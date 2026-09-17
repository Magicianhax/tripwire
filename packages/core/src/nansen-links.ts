import { CHAINS, type Chain, type Target } from "./types";

export const NANSEN_APP_ORIGIN = "https://app.nansen.ai";

/**
 * Tripwire's chain ids written the way Nansen's app expects them in a Token God Mode URL. The
 * two vocabularies happen to agree today, so this is an identity map — it exists so a future
 * divergence is one edit in one tested place rather than a silent wrong link.
 */
export const NANSEN_CHAIN_SLUGS: Record<Chain, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bnb: "bnb",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
};

export function nansenChainSlug(chain: string): string | null {
  return (CHAINS as readonly string[]).includes(chain) ? NANSEN_CHAIN_SLUGS[chain as Chain] : null;
}

/** The token's own page in Nansen's Token God Mode. */
export function nansenTokenUrl(chain: string, tokenAddress: string): string | null {
  const slug = nansenChainSlug(chain);
  if (!slug || !tokenAddress) return null;
  const url = new URL("/token-god-mode", NANSEN_APP_ORIGIN);
  url.searchParams.set("chain", slug);
  url.searchParams.set("tokenAddress", tokenAddress);
  return url.href;
}

/**
 * Where a target can be opened on Nansen, or null when it can't.
 *
 * Perp markets and prediction markets return null on purpose: Nansen ships Hyperliquid perp and
 * prediction-market data through its API, but publishes no documented, stable deep-link pattern
 * for either surface. A guessed URL that 404s is worse than no link, so the card omits the
 * button entirely for those kinds.
 */
export function nansenTargetUrl(target: Target): string | null {
  return target.kind === "spot" ? nansenTokenUrl(target.chain, target.tokenAddress) : null;
}
