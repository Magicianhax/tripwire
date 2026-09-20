import type { Target } from "@tripwire/core";
import { evmTarget, GMGN_CHAIN_SEGMENTS, scanPathForAddress, solanaTarget } from "./chains";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

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
    // A named chain gmgn routes to that Tripwire does not cover must NOT fall through to the
    // bare address scan: a Tron address is valid base58, so the scan would have handed back a
    // Solana target for it -- a confident answer about the wrong chain.
    if (match?.[1] && uncoveredChainGap(match[1])) return null;
    return scanPathForAddress(url.pathname);
  },
  /** gmgn's leading segment names the chain; the ones it routes to that Tripwire does not
   * cover (tron, ton, sui, …) get a coverage answer rather than the generic line. Only the
   * `/<chain>/token/<addr>` shape has a chain signal — the bare address scan has none. */
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(CHAIN_TOKEN_PATH_RE.exec(url.pathname)?.[1]);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
