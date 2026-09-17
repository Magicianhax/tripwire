import type { Target } from "@tripwire/core";
import { findButton, isSelected } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const COIN_PATH_RE = /^\/trade\/([^/]+)/;
const ANCHOR_RE = /^(buy|sell|long|short)/i;
// Toggle-button match: exact ("Long" / "Short" / "Buy" / "Sell" only).
const TOGGLE_LONG_RE = /^(buy|long)$/i;
const TOGGLE_SHORT_RE = /^(sell|short)$/i;
// Submit-button fallback match: prefix (e.g. "Buy / Long ETH"), per task-12-context.md.
const FALLBACK_LONG_RE = /^(buy|long)/i;
const FALLBACK_SHORT_RE = /^(sell|short)/i;

/** The active Long/Buy vs Short/Sell toggle, by aria-pressed/aria-selected/data-state, else
 * the submit button's own text. Ambiguous -> undefined (the signal then shows "Pick long or
 * short"). */
function detectSide(doc: Document): "long" | "short" | undefined {
  let longBtn: HTMLButtonElement | null = null;
  let shortBtn: HTMLButtonElement | null = null;
  for (const btn of doc.querySelectorAll("button")) {
    const text = (btn.textContent ?? "").trim();
    if (!longBtn && TOGGLE_LONG_RE.test(text)) longBtn = btn;
    if (!shortBtn && TOGGLE_SHORT_RE.test(text)) shortBtn = btn;
  }
  if (longBtn && isSelected(longBtn)) return "long";
  if (shortBtn && isSelected(shortBtn)) return "short";

  const submit = findButton(doc, ANCHOR_RE);
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
    return url.hostname === "app.hyperliquid.xyz" && COIN_PATH_RE.test(url.pathname);
  },
  readTarget(doc, url): Target | null {
    const match = COIN_PATH_RE.exec(url.pathname);
    const coin = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (!coin) return null;
    // Non-crypto HIP-3 markets are namespaced "xyz:TSLA" -- ruling: skip (null target).
    if (coin.includes(":")) return null;
    const side = detectSide(doc);
    return side ? { kind: "perp", coin, side } : { kind: "perp", coin };
  },
  anchor(doc) {
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.perp,
};
