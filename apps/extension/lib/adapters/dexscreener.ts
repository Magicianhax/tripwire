import type { Target } from "@tripwire/core";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/**
 * Tier 2, URL-only spot, dock only: `dexscreener.com/<chain>/<pair>`.
 *
 * Ruling (task-12-context.md): the pair address in the URL is a POOL/PAIR address, not the
 * token being traded — using it as the target would guard the wrong thing. A correct
 * implementation needs an async pair->token lookup, which `readTarget`'s synchronous
 * `(doc, url)` signature can't perform. Always returns null here; the runner shows an
 * UNCHECKED dock, never a false CLEAR/TRIPWIRE from the wrong address.
 */
export const dexscreenerAdapter: VenueAdapter = {
  id: "dexscreener",
  tier: 2,
  match(url) {
    return url.hostname === "dexscreener.com";
  },
  readTarget(_doc, _url): Target | null {
    return null;
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
