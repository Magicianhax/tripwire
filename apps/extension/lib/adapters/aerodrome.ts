import type { Target } from "@tripwire/core";
import { evmTarget } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `aerodrome.finance/...?to=<address>` -> spot base
 * (Aerodrome is Base-only). */
export const aerodromeAdapter: VenueAdapter = {
  id: "aerodrome",
  tier: 2,
  match(url) {
    return url.hostname === "aerodrome.finance";
  },
  readTarget(_doc, url): Target | null {
    return evmTarget("base", url.searchParams.get("to"));
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
