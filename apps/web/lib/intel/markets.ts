import { chainGroups, fractionToPct, MAX_ENRICH_GROUPS, screenerKey, SCREENER_MAX_CHAINS, TargetSchema, type Target } from "@tripwire/core";
import { z } from "zod";
import { isReplay } from "../nansen/client";
import { nansen, type TokenScreenerRow } from "../nansen/endpoints";

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

// ---- Round 1.6.2: the batched token-screener enrichment ---------------------------------------

/** Re-exported from core, where the card reads the same number to price the press (M-4). */
export { MAX_ENRICH_GROUPS };

export const MarketEnrichRequestSchema = z.object({
  markets: z
    .array(
      z.object({
        chain: z.string().regex(/^[a-z0-9-]{1,40}$/),
        address: z.string().min(1).max(200).regex(/^[A-Za-z0-9:._-]+$/),
      }),
    )
    .min(1)
    .max(100),
});
export type MarketEnrichRequest = z.infer<typeof MarketEnrichRequestSchema>;

/**
 * What one credit adds to a catalog row. Deliberately **only** the four figures `search/general`
 * does not carry: price, 24h volume and market cap already render from the free snapshot, and a
 * second source for the same figure under the same word is how two numbers start disagreeing on
 * one card.
 */
export type MarketEnrichment = {
  /** Whole days since deployment. The screener sends both days and hours; days is what is shown. */
  ageDays: number | null;
  /** Percent over 24h. Nansen sends a **fraction** here, so it is converted exactly once. */
  priceChangePct: number | null;
  fdvUsd: number | null;
  /** Circulating over total supply, as the screener reports it. */
  fdvMcRatio: number | null;
};

export type MarketEnrichResponse = {
  /** Keyed by `chain:address`, so a row with no answer is simply absent rather than zeroed. */
  rows: Record<string, MarketEnrichment>;
  /** Chains asked about, groups bought, and what those groups cost. */
  chains: number;
  groups: number;
  credits: number;
  /** Chains the cap left out, which the card states rather than silently dropping. */
  skippedChains: string[];
  errors: string[];
  replay: boolean;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What a catalog of these markets will cost to enrich, computed without spending anything. */
export function enrichmentPlan(markets: readonly { chain: string }[]): { groups: string[][]; skippedChains: string[]; credits: number } {
  const all = chainGroups(markets.map((m) => m.chain), SCREENER_MAX_CHAINS);
  const groups = all.slice(0, MAX_ENRICH_GROUPS);
  return { groups, skippedChains: all.slice(MAX_ENRICH_GROUPS).flat(), credits: groups.length };
}

/**
 * One credit enriches a whole page of the catalog, not one row.
 *
 * `filters.token_address` takes an array and `chains` takes one to five — both measured on the
 * first live call — so the shape of the spend is "one call per group of five chains", whatever
 * the row count. A group whose call fails leaves its rows at today's three figures and names
 * itself in `errors`; it never blanks the catalog.
 */
export async function enrichMarkets(input: MarketEnrichRequest): Promise<MarketEnrichResponse> {
  const { groups, skippedChains, credits } = enrichmentPlan(input.markets);
  const rows: Record<string, MarketEnrichment> = {};
  const errors: string[] = [];

  await Promise.all(
    groups.map(async (chains) => {
      const inGroup = new Set(chains);
      const addresses = [...new Set(input.markets.filter((m) => inGroup.has(m.chain.toLowerCase())).map((m) => m.address))];
      if (addresses.length === 0) return;
      try {
        const { data } = await nansen.tokenScreener(chains, addresses);
        for (const row of (data.data ?? []) as TokenScreenerRow[]) {
          const chain = typeof row.chain === "string" ? row.chain : null;
          const address = typeof row.token_address === "string" ? row.token_address : null;
          if (!chain || !address) continue;
          rows[screenerKey(chain, address)] = {
            ageDays: num(row.token_age_days),
            priceChangePct: fractionToPct(num(row.price_change)),
            fdvUsd: num(row.fdv),
            fdvMcRatio: num(row.fdv_mc_ratio),
          };
        }
      } catch (e) {
        errors.push(`Token screener (${chains.join(", ")}): ${e instanceof Error ? e.message : e}`);
      }
    }),
  );

  return { rows, chains: groups.flat().length, groups: groups.length, credits, skippedChains, errors, replay: isReplay() };
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
