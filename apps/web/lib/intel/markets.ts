import { TargetSchema, type Target } from "@tripwire/core";
import { z } from "zod";
import { isReplay } from "../nansen/client";
import { nansen } from "../nansen/endpoints";

export const MarketsRequestSchema = z.object({symbol:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/)});

export type Market = {
  id: string;
  kind: "spot" | "perp";
  chain: string;
  symbol: string;
  name: string;
  address: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  match: "exact" | "related";
  detailTarget: Target | null;
  nansenUrl: string;
};
export type MarketCatalog = { symbol: string; markets: Market[]; errors: string[]; replay: boolean };

const rowSchema = z.object({
  chain: z.string().regex(/^[a-z0-9-]{1,40}$/),
  address: z.string().min(1).max(200).regex(/^[A-Za-z0-9:._-]+$/),
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  price: z.number().finite().nonnegative().nullish(),
  volume_24h: z.number().finite().nonnegative().nullish(),
  market_cap: z.number().finite().nonnegative().nullish(),
});

/** Search relevance is not asset equivalence. Preserve chain + address for every row;
 * unsupported markets still have useful snapshots and exact Nansen links. */
export function marketRows(symbol: string, rows: unknown[]): Market[] {
  const wanted = symbol.toUpperCase();
  const seen = new Set<string>();
  const markets: Market[] = [];
  for (const row of rows) {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) continue;
    const t = parsed.data;
    const kind = t.chain === "hyperliquid" ? "perp" : "spot";
    const canonicalAddress = /^0x[\da-f]{40}$/i.test(t.address) ? t.address.toLowerCase() : t.address;
    const id = `${t.chain}:${canonicalAddress}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const detail = TargetSchema.safeParse(kind === "perp"
      ? { kind, coin: t.address }
      : { kind, chain: t.chain, tokenAddress: t.address, symbol: t.symbol });
    const params = new URLSearchParams({ chain: t.chain, tokenAddress: t.address, tab: "transactions" });
    markets.push({
      id, kind, chain: t.chain, symbol: t.symbol, name: t.name, address: t.address,
      priceUsd: t.price ?? null, volume24hUsd: t.volume_24h ?? null, marketCapUsd: t.market_cap ?? null,
      match: t.symbol.replace(/^\$/, "").toUpperCase() === wanted ? "exact" : "related",
      detailTarget: detail.success ? detail.data : null,
      nansenUrl: `https://app.nansen.ai/token-god-mode?${params}`,
    });
  }
  return markets.sort((a, b) => Number(b.match === "exact") - Number(a.match === "exact")
    || (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1));
}

export async function marketCatalog(symbol: string): Promise<MarketCatalog> {
  const wanted = symbol.toUpperCase();
  try {
    const { data } = await nansen.searchGeneral(wanted, "token", 25);
    return { symbol: wanted, markets: marketRows(wanted, data.tokens ?? []), errors: [], replay: isReplay() };
  } catch {
    return { symbol: wanted, markets: [], errors: ["Markets are temporarily unavailable. Try again."], replay: isReplay() };
  }
}
