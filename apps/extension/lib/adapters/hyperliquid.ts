import type { Target } from "@tripwire/core";
import { readTokenSymbol } from "./chains";
import { closestWithin, findButtons, isSelected, isToggleLike, leavesWithText } from "./dom";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/** Any trade page, for `match()`: a spot pair still needs an adapter, or the page gets no
 * answer at all instead of a coverage answer. */
const TRADE_PATH_RE = /^\/trade\/([^/?#]+)(\/([^/?#]+))?\/?$/;
/**
 * A PERP market: exactly one path segment. `/trade/ETH` is the ETH perp; `/trade/PURR/USDC`
 * is a Hyperliquid **spot** pair and `/trade/@107` is a spot index, neither of which exists in
 * the perp universe. The old unanchored `/^\/trade\/([^/]+)/` read `PURR` out of the pair and
 * spent `perp-screener` (1) plus `tgm/perp-positions` (5) = 6 credits per coin per 2 minutes
 * asking about a market that does not exist.
 */
const COIN_PATH_RE = /^\/trade\/([^/?#]+)\/?$/;
/** Hyperliquid writes spot markets as `@<index>` in the URL (`/trade/@107`). */
const SPOT_INDEX_RE = /^@\d+$/;
/** The spot venue behind these pages. Not HyperEVM: that is the EVM chain beside it, and
 * naming the wrong one would be its own confident error. */
const HL_SPOT_LABEL = "Hyperliquid spot";
const ANCHOR_RE = /^(buy|sell|long|short|place order)/i;
// Side-toggle labels: "Long", "Buy", or "Buy / Long" style (whole first word).
const TOGGLE_LONG_WORD_RE = /^(buy|long)\b/i;
const TOGGLE_SHORT_WORD_RE = /^(sell|short)\b/i;
// Submit-button fallback match: prefix (e.g. "Buy / Long ETH"), per task-12-context.md.
const FALLBACK_LONG_RE = /^(buy|long)/i;
const FALLBACK_SHORT_RE = /^(sell|short)/i;

// Live markup (2026-09-17): the side toggle is plain divs "Buy / Long" | "Sell / Short" with no ARIA;
// the selected label carries the class token "left" (long) or "right" (short). The order form's
// primary action reads "Connect" logged out; connected labels are inferred.
const LIVE_LONG_LABEL_RE = /^buy \/ long$/i;
const LIVE_SHORT_LABEL_RE = /^sell \/ short$/i;
const FORM_PRIMARY_RE = /^(connect|enable trading|place order|buy|sell|long|short)/i;
const FORM_MAX_DEPTH = 8;

/** The live div toggle's two labels, when present. */
function liveSideLabels(doc: Document): { long: Element; short: Element } | null {
  const long = leavesWithText(doc, LIVE_LONG_LABEL_RE)[0];
  const short = leavesWithText(doc, LIVE_SHORT_LABEL_RE)[0];
  return long && short ? { long, short } : null;
}

/** The order form around the live side toggle: the nearest ancestor holding a primary-action
 * button. Closer than the site header's own "Connect", which sits outside the form. */
function liveFormSubmit(doc: Document): HTMLButtonElement | null {
  const labels = liveSideLabels(doc);
  if (!labels) return null;
  let found: HTMLButtonElement[] = [];
  closestWithin(labels.long, FORM_MAX_DEPTH, (el) => {
    found = findButtons(el, FORM_PRIMARY_RE, isToggleLike);
    return found.length > 0;
  });
  return found.find((btn) => btn.getAttribute("type") === "submit") ?? found[found.length - 1] ?? null;
}

/** The order form's primary action: never a Buy/Long | Sell/Short side toggle (ARIA toggle
 * state/role, or inside a tablist/radiogroup). A `type=submit` button wins; otherwise the last
 * matching button (order forms put the submit after their controls). */
function findSubmit(doc: Document): HTMLButtonElement | null {
  const live = liveFormSubmit(doc);
  if (live) return live;
  const candidates = findButtons(doc, ANCHOR_RE, isToggleLike);
  return candidates.find((btn) => btn.getAttribute("type") === "submit") ?? candidates[candidates.length - 1] ?? null;
}

/** The active Long/Buy vs Short/Sell toggle: the live div toggle's left/right class token, else
 * aria-pressed/aria-selected/data-state on button toggles, else the submit button's own text.
 * Ambiguous -> undefined (the signal then shows "Pick long or short"). */
function detectSide(doc: Document): "long" | "short" | undefined {
  const live = liveSideLabels(doc);
  if (live) {
    const long = live.long.classList.contains("left");
    const short = live.short.classList.contains("right");
    if (long !== short) return long ? "long" : "short";
  }

  let longBtn: HTMLButtonElement | null = null;
  let shortBtn: HTMLButtonElement | null = null;
  for (const btn of doc.querySelectorAll("button")) {
    if (!isToggleLike(btn)) continue; // the submit button isn't a side toggle
    const text = (btn.textContent ?? "").trim();
    if (!longBtn && TOGGLE_LONG_WORD_RE.test(text)) longBtn = btn;
    if (!shortBtn && TOGGLE_SHORT_WORD_RE.test(text)) shortBtn = btn;
  }
  if (longBtn && isSelected(longBtn)) return "long";
  if (shortBtn && isSelected(shortBtn)) return "short";

  const submit = findSubmit(doc);
  if (submit) {
    const text = (submit.textContent ?? "").trim();
    if (FALLBACK_LONG_RE.test(text)) return "long";
    if (FALLBACK_SHORT_RE.test(text)) return "short";
  }
  return undefined;
}

export const hyperliquidAdapter: VenueAdapter = {
  id: "hyperliquid",
  tier: 1,
  match(url) {
    return url.hostname === "app.hyperliquid.xyz" && TRADE_PATH_RE.test(url.pathname);
  },
  readTarget(doc, url): Target | null {
    const match = COIN_PATH_RE.exec(url.pathname);
    const coin = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (!coin) return null; // a spot pair: no perp market, and no perp credits spent on it
    // Non-crypto HIP-3 markets are namespaced "xyz:TSLA" -- ruling: skip (null target).
    if (coin.includes(":")) return null;
    if (SPOT_INDEX_RE.test(coin)) return null; // `/trade/@107` is a spot index, not a perp
    const side = detectSide(doc);
    return side ? { kind: "perp", coin, side } : { kind: "perp", coin };
  },
  /**
   * The spot half of Hyperliquid. Nansen's perp data is the perp universe, and Tripwire has no
   * HyperCore spot coverage, so the honest answer names the venue instead of pricing a market
   * that does not exist.
   */
  readGap(_doc, url): TargetGap | null {
    const match = TRADE_PATH_RE.exec(url.pathname);
    if (!match) return null;
    const base = match[1] ? decodeURIComponent(match[1]) : "";
    const quote = match[3];
    if (!quote && !SPOT_INDEX_RE.test(base)) return null; // a perp page, or a HIP-3 namespace
    // `@107` is an index into Hyperliquid's spot universe, not a ticker: say nothing about it.
    const symbol = quote && !SPOT_INDEX_RE.test(base) ? readTokenSymbol({ textContent: base } as Element) : null;
    return { kind: "unsupported-chain", label: HL_SPOT_LABEL, ...(symbol ? { symbol } : {}) };
  },
  anchor(doc) {
    return findSubmit(doc);
  },
  overridePhrase: OVERRIDE_PHRASES.perp,
};
