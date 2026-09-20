import type { Target } from "@tripwire/core";
import { BIRDEYE_CHAIN_NAMES, evmTarget, solanaTarget } from "./chains";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/**
 * Birdeye moved: `https://birdeye.so/token/<mint>?chain=solana` answers **308** to
 * `/<chain>/token/<mint>` and drops the `chain` param on the way, so the old
 * `/^\/token\/([^/?#]+)/` matched nothing and every Birdeye token page resolved to null. The
 * path segment is now the only chain signal there is.
 */
const CHAIN_TOKEN_PATH_RE = /^\/([^/?#]+)\/token\/([^/?#]+)/;

/** Tier 2, URL-only spot, dock only: `birdeye.so/<chain>/token/<addr>` -> spot. An unmapped
 * chain slug is a coverage answer, never a defaulted chain (the `pancakeswap.ts` ruling). */
export const birdeyeAdapter: VenueAdapter = {
  id: "birdeye",
  tier: 2,
  match(url) {
    return url.hostname === "birdeye.so";
  },
  readTarget(_doc, url): Target | null {
    const match = CHAIN_TOKEN_PATH_RE.exec(url.pathname);
    const [, chainSlug, address] = match ?? [];
    if (!chainSlug || !address) return null;
    const chain = BIRDEYE_CHAIN_NAMES[chainSlug.toLowerCase()];
    if (!chain) return null;
    return chain === "solana" ? solanaTarget(address) : evmTarget(chain, address);
  },
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(CHAIN_TOKEN_PATH_RE.exec(url.pathname)?.[1]);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
