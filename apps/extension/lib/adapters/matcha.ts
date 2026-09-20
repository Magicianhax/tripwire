import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS } from "./chains";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `matcha.xyz/...?buyAddress=<address>` -> spot. Requires
 * `chainId` (controller ruling, task-12 fix round 1: a missing/unknown chain -> null/UNCHECKED
 * dock, never a defaulted chain). */
export const matchaAdapter: VenueAdapter = {
  id: "matcha",
  tier: 2,
  match(url) {
    return url.hostname === "matcha.xyz";
  },
  readTarget(_doc, url): Target | null {
    const address = url.searchParams.get("buyAddress");
    if (!address) return null;
    const chainIdParam = url.searchParams.get("chainId");
    if (!chainIdParam) return null;
    const chain = EVM_CHAIN_IDS[Number(chainIdParam)];
    if (!chain) return null;
    return evmTarget(chain, address);
  },
  /** Matcha is EVM-only, so an id that is not in `EVM_CHAIN_IDS` is certainly a chain outside
   * coverage: the numeric fallback is safe here in a way it is not on a multi-VM venue. */
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(url.searchParams.get("chainId"), { numericIdsAreEvm: true });
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
