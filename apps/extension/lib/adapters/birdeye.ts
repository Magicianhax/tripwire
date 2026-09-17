import type { Target } from "@tripwire/core";
import { BIRDEYE_CHAIN_NAMES, evmTarget, solanaTarget } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const TOKEN_PATH_RE = /^\/token\/([^/?#]+)/;

/** Tier 2, URL-only spot, dock only: `birdeye.so/token/<addr>?chain=<name>` -> spot. */
export const birdeyeAdapter: VenueAdapter = {
  id: "birdeye",
  tier: 2,
  match(url) {
    return url.hostname === "birdeye.so";
  },
  readTarget(_doc, url): Target | null {
    const match = TOKEN_PATH_RE.exec(url.pathname);
    const address = match?.[1];
    if (!address) return null;
    const chainParam = url.searchParams.get("chain");
    const chain = chainParam ? BIRDEYE_CHAIN_NAMES[chainParam] : "solana"; // Birdeye defaults to solana
    if (!chain) return null;
    return chain === "solana" ? solanaTarget(address) : evmTarget(chain, address);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
