import type { Target } from "@tripwire/core";
import { scanPathForAddress } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `photon-sol.tinyastro.io/...` -> spot, wherever a
 * base58/0x address appears in the path. */
export const photonAdapter: VenueAdapter = {
  id: "photon",
  tier: 2,
  match(url) {
    return url.hostname === "photon-sol.tinyastro.io";
  },
  readTarget(_doc, url): Target | null {
    return scanPathForAddress(url.pathname);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
