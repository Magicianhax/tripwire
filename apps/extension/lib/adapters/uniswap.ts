import { isEvmAddress, type Chain, type Target } from "@tripwire/core";
import { chainLabel, evmTarget, EVM_CHAIN_IDS, isNativeEvm, isNativeSymbol, readTokenSymbol, UNISWAP_CHAIN_NAMES } from "./chains";
import { findButtons, isToggleLike, isVisible } from "./dom";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

const ANCHOR_RE = /^swap$/i;
const REVIEW_SELECTOR = '[data-testid="review-swap"]';
/** The Buy field's token selector. Scoped to the output side on purpose: the Sell selector
 * (`choose-input-token`) is what the user is spending, which Tripwire has no verdict about. */
const OUTPUT_TOKEN_SELECTOR = '[data-testid="choose-output-token"]';
/** The swap widget on a token page, and the token's own identity row above the chart: the two
 * places to put a verdict when the form has no pressable primary. Both are Uniswap's test ids. */
const TRADE_PANEL_SELECTOR = '[data-testid="token-details-swap"]';
const TOKEN_INFO_SELECTOR = '[data-testid="token-info-container"]';
/**
 * `/explore/tokens/<chain>/<address>` — Uniswap's own token page, which names the chain AND
 * the exact contract in the path. `readTarget` read only `?outputCurrency=`, so `readGap` fell
 * through to the symbol branch and the card said "Select a network to check DEGEN" on a URL
 * that literally reads `base/0x4ed4…`. A confident instruction to do something the user has
 * already done is worse than saying nothing.
 */
const EXPLORE_TOKEN_PATH_RE = /^\/explore\/tokens\/([^/?#]+)\/([^/?#]+)/;

/**
 * The token image inside a token button, and the chain badge pinned to its corner. Read live on
 * 2026-09-20 (`test/fixtures/venues/uniswap-ui-selected.json`): the badge's ONLY machine-readable
 * chain signal is its own test id, `data-testid="network-logo-<evm chain id>"`. It has no
 * `data-chain-id`, its `<img>` carries `alt=""`, and there is no `title` or `aria-label` — the
 * three attributes the previous reader scanned, which is why a Base badge read as no chain at all.
 */
const TOKEN_LOGO_SELECTOR = '[data-testid="token-logo"]';
const NETWORK_BADGE_SELECTOR = '[data-testid^="network-logo-"]';
const NETWORK_BADGE_RE = /^network-logo-(\d+)$/;

/**
 * The EVM chain id on the Buy token's badge, as the page spells it — NOT mapped to a `Chain`,
 * because "the page named a chain we don't cover" and "the page named no chain" must stay
 * distinguishable: the first is a coverage answer, the second is silence. Scoped to the Buy row
 * because the Sell row wears its own badge (live: Sell ETH = `network-logo-1` beside Buy GIZA =
 * `network-logo-8453`), so a page-wide scan would see two chains at once.
 */
function outputBadgeChainId(doc: Document): string | null {
  const output = doc.querySelector(OUTPUT_TOKEN_SELECTOR);
  if (!output) return null;
  const ids = new Set<string>();
  for (const el of output.querySelectorAll(NETWORK_BADGE_SELECTOR)) {
    const id = NETWORK_BADGE_RE.exec(el.getAttribute("data-testid") ?? "")?.[1];
    if (id) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

/** The older label-based signal, kept for the Robinhood-style chain names Uniswap writes as
 * text rather than as a numeric badge. Only output-side metadata counts. */
function outputChainFromLabels(doc: Document): Chain | undefined {
  const output = doc.querySelector(OUTPUT_TOKEN_SELECTOR);
  if (!output) return undefined;
  const found = new Set<Chain>();
  for (const el of [output, ...output.querySelectorAll('[data-chain-id], img[alt], [title]')]) {
    const id = el.getAttribute("data-chain-id");
    const byId = id ? EVM_CHAIN_IDS[Number(id)] : undefined;
    if (byId) found.add(byId);
    for (const attr of ["alt", "title"]) {
      const label = el.getAttribute(attr)?.trim().toLowerCase().replace(/ chain$/, "");
      if (label && UNISWAP_CHAIN_NAMES[label]) found.add(UNISWAP_CHAIN_NAMES[label]);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * The Buy side's chain. The `chain` param comes first on purpose: Uniswap writes `chain` and
 * `outputCurrency` together, so they describe the same token, whereas a badge left over from the
 * previously selected token would re-chain the URL's address to a contract that is a different
 * token entirely. When the URL says nothing — the UI-selection case, which is every
 * picker-chosen token — the badge is the page's own answer and is believed.
 */
function outputChain(doc: Document, url: URL): Chain | undefined {
  const param = url.searchParams.get("chain");
  if (param) return UNISWAP_CHAIN_NAMES[param.toLowerCase()] ?? EVM_CHAIN_IDS[Number(param)];
  const badge = outputBadgeChainId(doc);
  if (badge) return EVM_CHAIN_IDS[Number(badge)];
  return outputChainFromLabels(doc);
}

export const uniswapAdapter: VenueAdapter = {
  id: "uniswap",
  tier: 1,
  match(url) {
    return url.hostname === "app.uniswap.org";
  },
  readTarget(doc, url): Target | null {
    const explore = EXPLORE_TOKEN_PATH_RE.exec(url.pathname);
    if (explore) {
      const chain = UNISWAP_CHAIN_NAMES[explore[1]!.toLowerCase()];
      return chain ? evmTarget(chain, explore[2]!) : null;
    }

    const address = url.searchParams.get("outputCurrency");
    if (!address) return null;
    const chain = outputChain(doc, url);
    if (!chain) return null;
    return isEvmAddress(address) || isNativeEvm(address) ? evmTarget(chain, address) : null;
  },
  /**
   * The default swap page carries no token in its URL, so the strip used to read "no target on
   * this page" while the form plainly said Buy: ETH. This reads the Buy selector instead, and
   * names what it found: the chain if Tripwire doesn't cover it, the native coin if that is what
   * is selected, otherwise the symbol for the caller to resolve through Nansen.
   */
  readGap(doc, url): TargetGap | null {
    // An explore page carries its own chain; the only reason it produced no target is that the
    // chain is outside coverage. It must never reach the swap form's "pick a network" branch.
    const explore = EXPLORE_TOKEN_PATH_RE.exec(url.pathname);
    if (explore) return uncoveredChainGap(explore[1]);

    const output = doc.querySelector(OUTPUT_TOKEN_SELECTOR);
    const symbol = readTokenSymbol(output);
    const chainParam = url.searchParams.get("chain");
    const badge = outputBadgeChainId(doc);
    const chain = outputChain(doc, url);

    // The page NAMES a chain — in the URL or on the Buy badge — and it is one Tripwire has no
    // data for. That is an answer about coverage. It is never "pick a network": the user picked
    // one, and it is right there on the button.
    const named = chainParam ?? badge;
    if (named && !chain) return { kind: "unsupported-chain", label: chainLabel(named), ...(symbol ? { symbol } : {}) };

    const address = url.searchParams.get("outputCurrency");
    if (address) {
      if (!chain) return { kind: "unknown-chain", symbol: symbol ?? "this token" };
      // A real address that yielded no target is the native-ETH sentinel; anything else with a
      // chain we support already became a target.
      return isNativeEvm(address) ? { kind: "native-asset", symbol: "ETH" } : null;
    }

    if (!symbol) return null;
    if (!chain) {
      // The logo container is mounted but its badge has not arrived: a half-drawn row, not a
      // chainless one. The next tick will have it, so say the one thing that is true now.
      // No logo at all means the row's shape is not one we know — we cannot tell, and we say so
      // rather than instructing the user to do something they may already have done.
      return output?.querySelector(TOKEN_LOGO_SELECTOR) ? { kind: "pending", symbol } : { kind: "unknown-chain", symbol };
    }
    if (isNativeSymbol(symbol, chain)) return { kind: "native-asset", symbol };
    return { kind: "symbol", symbol, chainHint: chain };
  },
  anchor(doc) {
    const review = doc.querySelector(REVIEW_SELECTOR);
    if (review instanceof HTMLButtonElement && !review.disabled && isVisible(review)) return review;
    // `/explore/tokens/...` renders a Swap|Limit|Send segmented control whose first tab reads
    // exactly "Swap". Logged out there is no enabled review-swap, so without this reject the
    // tab became the anchor — and since the blocker binds to `anchor()`, a TRIPWIRE covered a
    // navigation tab instead of a trade button. Same reject hyperliquid/polymarket already use.
    const candidates = findButtons(doc, ANCHOR_RE, isToggleLike);
    return candidates.at(-1) ?? null;
  },
  /**
   * Both fallbacks are Uniswap's own test ids, read off the live
   * `/explore/tokens/base/0x4ed4…` page at 1440x900 on 2026-09-20: the trade panel sits at
   * x960 y284 (360x377) and the token identity header at x120 y173 (1200x58). Logged out,
   * the explore page's swap form has no enabled primary at all, so without these the verdict
   * for a page whose URL literally names the token went to the corner dock.
   */
  anchorPriority: [
    { role: "trade-panel-header", find: (doc) => doc.querySelector<HTMLElement>(TRADE_PANEL_SELECTOR) },
    { role: "token-identity", find: (doc) => doc.querySelector<HTMLElement>(TOKEN_INFO_SELECTOR) },
  ],
  overridePhrase: OVERRIDE_PHRASES.spot,
};
