import type { Target } from "@tripwire/core";
import { evmTarget, UNISWAP_CHAIN_NAMES } from "./chains";
import { findButton, isVisible } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const ANCHOR_RE = /^swap$/i;
const REVIEW_SELECTOR = '[data-testid="review-swap"]';

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
  anchor(doc) {
    const review = doc.querySelector(REVIEW_SELECTOR);
    if (review instanceof HTMLButtonElement && !review.disabled && isVisible(review)) return review;
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
