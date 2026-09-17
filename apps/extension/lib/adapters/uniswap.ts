import type { Target } from "@tripwire/core";
import { chainLabel, evmTarget, isNativeEvm, isNativeSymbol, readTokenSymbol, UNISWAP_CHAIN_NAMES } from "./chains";
import { findButton, isVisible } from "./dom";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

const ANCHOR_RE = /^swap$/i;
const REVIEW_SELECTOR = '[data-testid="review-swap"]';
/** The Buy field's token selector. Scoped to the output side on purpose: the Sell selector
 * (`choose-input-token`) is what the user is spending, which Tripwire has no verdict about. */
const OUTPUT_TOKEN_SELECTOR = '[data-testid="choose-output-token"]';

export const uniswapAdapter: VenueAdapter = {
  id: "uniswap",
  tier: 1,
  match(url) {
    return url.hostname === "app.uniswap.org";
  },
  readTarget(_doc, url): Target | null {
    const address = url.searchParams.get("outputCurrency");
    if (!address) return null;
    const chainParam = url.searchParams.get("chain");
    // Controller ruling (task-12 fix round 1): a missing/unknown `chain` param -> null
    // (UNCHECKED dock), never a defaulted chain.
    if (!chainParam) return null;
    const chain = UNISWAP_CHAIN_NAMES[chainParam];
    if (!chain) return null;
    return evmTarget(chain, address);
  },
  /**
   * The default swap page carries no token in its URL, so the strip used to read "no target on
   * this page" while the form plainly said Buy: ETH. This reads the Buy selector instead, and
   * names what it found: the chain if Tripwire doesn't cover it, the native coin if that is what
   * is selected, otherwise the symbol for the caller to resolve through Nansen.
   */
  readGap(doc, url): TargetGap | null {
    const chainParam = url.searchParams.get("chain");
    const chain = chainParam ? UNISWAP_CHAIN_NAMES[chainParam] : undefined;
    if (chainParam && !chain) return { kind: "unsupported-chain", label: chainLabel(chainParam) };

    const address = url.searchParams.get("outputCurrency");
    if (address) {
      // A real address that yielded no target is the native-ETH sentinel; anything else with a
      // chain we support already became a target.
      return isNativeEvm(address) ? { kind: "native-asset", symbol: "ETH" } : null;
    }

    const symbol = readTokenSymbol(doc.querySelector(OUTPUT_TOKEN_SELECTOR));
    if (!symbol) return null;
    if (isNativeSymbol(symbol, chain ?? null)) return { kind: "native-asset", symbol };
    return chain ? { kind: "symbol", symbol, chainHint: chain } : { kind: "symbol", symbol };
  },
  anchor(doc) {
    const review = doc.querySelector(REVIEW_SELECTOR);
    if (review instanceof HTMLButtonElement && !review.disabled && isVisible(review)) return review;
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
