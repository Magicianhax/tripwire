import fs from "node:fs";
import path from "node:path";
import { holderKey, predictionSignals, type PmHolder, type PmTrade, type PredictionTarget, type Signal } from "@tripwire/core";
import { getDb } from "../db";
import { isReplay } from "../nansen/client";
import { nansen } from "../nansen/endpoints";
import { mapLimit, settle } from "./util";

export type PredictionPanel = {
  market: { id: string; question: string; slug: string; yesPrice: number | null; endDate: string | null } | null;
  holders: (PmHolder & { key: string; pnl: number | null })[] | null;
  trades: PmTrade[] | null;
  errors: string[];
};

type GammaMarket = { id: string; slug: string; question: string; outcomePrices?: string; endDate?: string; volumeNum?: number; active?: boolean; closed?: boolean };

/**
 * Polymarket slug -> market id via Polymarket's public Gamma API (not a Nansen call; ids match Nansen market_id).
 * Tries a market slug first, then an event slug (picks the highest-volume open market).
 */
export async function resolveMarket(slug: string): Promise<GammaMarket | null> {
  const cacheKey = `gamma|${slug}`;
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey) as { value: string; expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) return JSON.parse(row.value) as GammaMarket | null;

  let market: GammaMarket | null = null;
  if (isReplay()) {
    const file = path.resolve(process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen"), "gammaMarket.json");
    market = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as GammaMarket) : null;
  } else {
    const get = async <T>(url: string): Promise<T | null> => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return res.ok ? ((await res.json()) as T) : null;
    };
    const byMarket = await get<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
    market = byMarket?.[0] ?? null;
    if (!market) {
      const events = await get<{ markets?: GammaMarket[] }[]>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
      const open = (events?.[0]?.markets ?? []).filter((m) => !m.closed);
      market = open.sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))[0] ?? null;
    }
  }
  const now = Date.now();
  db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(cacheKey, JSON.stringify(market), now, now + 3_600_000);
  return market;
}

export async function buildPredictionIntel(t: PredictionTarget, mode: "chip" | "panel"): Promise<{ signals: Signal[]; panel: PredictionPanel }> {
  const errors: string[] = [];
  let market: GammaMarket | null = null;
  try {
    market = await resolveMarket(t.slug);
  } catch (e) {
    errors.push(`Polymarket lookup failed: ${e instanceof Error ? e.message : e}`);
  }
  const marketId = t.marketId ?? market?.id;
  if (!marketId) {
    return { signals: predictionSignals({ outcome: t.outcome }), panel: { market: null, holders: null, trades: null, errors: [...errors, "Market not found"] } };
  }

  const [holders, trades] = await Promise.all([
    settle(nansen.pmTopHolders(marketId), (d) => d.data),
    mode === "panel" ? settle(nansen.pmTrades(marketId), (d) => d.data) : Promise.resolve(null),
  ]);
  if (holders.error) errors.push(holders.error);
  if (trades?.error) errors.push(trades.error);

  const pnl: Record<string, number> = {};
  const list = holders.value ?? [];
  const keys = [...new Set(list.map(holderKey))];
  await mapLimit(keys, 4, async (key) => {
    const r = await settle(nansen.pmPnlByAddress(key), (d) => d.data);
    if (r.value) pnl[key] = r.value.reduce((s, row) => s + (row.total_pnl_usd ?? 0), 0);
  });

  let yesPrice: number | null = null;
  try {
    yesPrice = market?.outcomePrices ? Number(JSON.parse(market.outcomePrices)[0]) : null;
  } catch {
    yesPrice = null;
  }

  return {
    signals: predictionSignals({ outcome: t.outcome, holders: holders.value, pnl }),
    panel: {
      market: market ? { id: marketId, question: market.question, slug: market.slug, yesPrice, endDate: market.endDate ?? null } : { id: marketId, question: t.slug, slug: t.slug, yesPrice: null, endDate: null },
      holders: list.map((h) => ({ ...h, key: holderKey(h), pnl: pnl[holderKey(h)] ?? null })),
      trades: trades?.value ?? null,
      errors,
    },
  };
}
