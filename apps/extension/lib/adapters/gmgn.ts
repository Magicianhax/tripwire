import type { Target } from "@tripwire/core";
import { evmTarget, GMGN_CHAIN_SEGMENTS, scanPathForAddress, solanaTarget } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const CHAIN_TOKEN_PATH_RE = /^\/([a-z]+)\/token\/([^/?#]+)/;

/** Tier 2, URL-only spot, dock only: `gmgn.ai/<chainHint>/token/<addr>` -> spot, using the
 * leading path segment as a chain hint (`sol`, `eth`, `bsc`, …); falls back to a bare
 * base58/0x scan for any other path shape. */
export const gmgnAdapter: VenueAdapter = {
  id: "gmgn",
  tier: 2,
  match(url) {
    return url.hostname === "gmgn.ai";
  },
  readTarget(_doc, url): Target | null {
    const match = CHAIN_TOKEN_PATH_RE.exec(url.pathname);
    if (match) {
      const [, chainSegment, address] = match;
      const chain = chainSegment ? GMGN_CHAIN_SEGMENTS[chainSegment] : undefined;
      if (chain === "solana") return solanaTarget(address);
      if (chain) return evmTarget(chain, address);
    }
    return scanPathForAddress(url.pathname);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
