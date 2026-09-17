import type { Target } from "@tripwire/core";
import { evmTarget, UNISWAP_CHAIN_NAMES } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `pancakeswap.finance/...?outputCurrency=<address>` ->
 * spot. Requires `chain` (controller ruling, task-12 fix round 1: a missing/unknown chain ->
 * null/UNCHECKED dock, never a defaulted chain). */
export const pancakeswapAdapter: VenueAdapter = {
  id: "pancakeswap",
  tier: 2,
  match(url) {
    return url.hostname === "pancakeswap.finance";
  },
  readTarget(_doc, url): Target | null {
    const address = url.searchParams.get("outputCurrency");
    if (!address) return null;
    const chainParam = url.searchParams.get("chain");
    if (!chainParam) return null;
    const chain = UNISWAP_CHAIN_NAMES[chainParam];
    if (!chain) return null;
    return evmTarget(chain, address);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
