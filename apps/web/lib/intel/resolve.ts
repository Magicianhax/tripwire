import { CHAINS, isEvmAddress, isSolanaAddress, type Chain } from "@tripwire/core";
import { nansen } from "../nansen/endpoints";

export type TokenRef = { chain: Chain; tokenAddress: string; symbol: string; name: string; volume24h: number | null; marketCap: number | null };

const CHAIN_SET = new Set<string>(CHAINS);

/** Cashtag -> most liquid real token on a supported chain (Hyperliquid pseudo-tokens excluded). */
export async function resolveCashtag(symbol: string, chainHint?: Chain): Promise<{ best: TokenRef | null; candidates: TokenRef[] }> {
  const wanted = symbol.replace(/^\$/, "").toUpperCase();
  const { data } = await nansen.searchGeneral(wanted, "token", 25);
  const candidates = (data.tokens ?? [])
    .filter((t) => t.symbol?.replace(/^\$/, "").toUpperCase() === wanted && CHAIN_SET.has(t.chain))
    .filter((t) => (t.chain === "solana" ? isSolanaAddress(t.address) : isEvmAddress(t.address)))
    .map<TokenRef>((t) => ({
      chain: t.chain as Chain,
      tokenAddress: t.address,
      symbol: wanted,
      name: t.name,
      volume24h: t.volume_24h,
      marketCap: t.market_cap,
    }))
    .sort((a, b) => {
      if (chainHint && (a.chain === chainHint) !== (b.chain === chainHint)) return a.chain === chainHint ? -1 : 1;
      return (b.volume24h ?? 0) - (a.volume24h ?? 0);
    });
  return { best: candidates[0] ?? null, candidates: candidates.slice(0, 5) };
}
