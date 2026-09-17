import type { Target } from "@tripwire/core";
import { solanaTarget } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Tier 2, URL-only spot, dock only: `raydium.io/...?outputMint=<mint>` -> spot solana. */
export const raydiumAdapter: VenueAdapter = {
  id: "raydium",
  tier: 2,
  match(url) {
    return url.hostname === "raydium.io";
  },
  readTarget(_doc, url): Target | null {
    return solanaTarget(url.searchParams.get("outputMint"));
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
