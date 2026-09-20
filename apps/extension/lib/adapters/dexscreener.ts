import { isEvmAddress, type Chain, type Target } from "@tripwire/core";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** Dexscreener routes are provider-specific, not Birdeye's supported-chain list. */
const DEXSCREENER_CHAIN_NAMES: Record<string, Chain> = {
  solana: "solana", ethereum: "ethereum", base: "base", arbitrum: "arbitrum",
  bnb: "bnb", bsc: "bnb", polygon: "polygon", optimism: "optimism",
  avalanche: "avalanche", robinhood: "robinhood",
} satisfies Record<Chain | "bsc", Chain>;

/** Pair identity only: the runner resolves it through the backend before guarding a token.
 * Dexscreener lowercases even Solana pair URLs; these are provider IDs, not mint addresses. */
export function readDexscreenerPair(url: URL): { chain: Chain; pairAddress: string } | null {
  if (url.hostname !== "dexscreener.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const chain = DEXSCREENER_CHAIN_NAMES[segments[0]!];
  const pairAddress = segments[1]!;
  // Uniswap v4 uses a bytes32 pool ID rather than a contract address.
  if (!chain || !(chain === "solana" ? /^[a-zA-Z0-9]{32,44}$/.test(pairAddress)
    : isEvmAddress(pairAddress) || /^0x[0-9a-fA-F]{64}$/.test(pairAddress))) return null;
  return { chain, pairAddress };
}

/** Tier 2: the URL is a pool, never a token. Async pair resolution lives in the runner. */
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
