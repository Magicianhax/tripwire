import type { Target } from "@tripwire/core";
import { evmTarget, PANCAKESWAP_CHAIN_NAMES } from "./chains";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `pancakeswap.finance/...?outputCurrency=<address>` ->
 * spot. Requires `chain` (controller ruling, task-12 fix round 1: a missing/unknown chain ->
 * null/UNCHECKED dock, never a defaulted chain).
 *
 * PancakeSwap writes `?chain=bsc`, which Uniswap's map has no reason to carry and which this
 * adapter never lowercased, so its own home chain resolved to nothing. It now reads its own
 * map (`PANCAKESWAP_CHAIN_NAMES`), case-normalised. */
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
    const chain = PANCAKESWAP_CHAIN_NAMES[chainParam.trim().toLowerCase()];
    if (!chain) return null;
    return evmTarget(chain, address);
  },
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(url.searchParams.get("chain"));
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
