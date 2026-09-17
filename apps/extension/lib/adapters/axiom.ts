import type { Target } from "@tripwire/core";
import { scanPathForAddress } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `axiom.trade/...` -> spot, wherever a base58/0x address
 * appears in the path (e.g. `/meme/<mint>`). */
export const axiomAdapter: VenueAdapter = {
  id: "axiom",
  tier: 2,
  match(url) {
    return url.hostname === "axiom.trade";
  },
  readTarget(_doc, url): Target | null {
    return scanPathForAddress(url.pathname);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
