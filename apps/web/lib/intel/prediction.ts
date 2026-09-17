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

type GammaMarket = {
  id: string;
  slug: string;
  question: string;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  volumeNum?: number;
  active?: boolean;
  closed?: boolean;
};

/** Why a prediction target can't be checked (shown as the UNCHECKED headline), or null. */
export type MarketProblem = "Pick a market" | "Not a Yes/No market" | "Market not found";
export type MarketResolution = { market: GammaMarket | null; problem: MarketProblem | null };

const FOUND_TTL_MS = 3_600_000;
const NOT_FOUND_TTL_MS = 5 * 60_000;

function isYesNoMarket(m: GammaMarket): boolean {
  try {
    const outcomes = JSON.parse(m.outcomes ?? "null") as unknown;
    return Array.isArray(outcomes) && outcomes.length === 2 && String(outcomes[0]).toLowerCase() === "yes" && String(outcomes[1]).toLowerCase() === "no";
  } catch {
    return false;
  }
}

/** A Gamma GET that throws on a non-OK status or network error, so failures are never cached. */
async function gammaGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Polymarket slug -> market via Polymarket's public Gamma API (not a Nansen call; ids match
 * Nansen market_id). A market slug resolves directly; an event slug only when the event has
 * exactly one open market. The market must be a plain Yes/No market -- anything else is left
 * UNCHECKED rather than guessed at (a wrong market or outcome could block the wrong trade).
 *
 * Cached: a found market 1h, a real (200) not-found / ambiguous answer 5 min; errors never.
 */
export async function resolveMarket(slug: string): Promise<MarketResolution> {
  const cacheKey = `gamma2|${slug}`;
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey) as { value: string; expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) return JSON.parse(row.value) as MarketResolution;

  let result: MarketResolution;
  if (isReplay()) {
    const file = path.resolve(process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen"), "gammaMarket.json");
    const market = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as GammaMarket) : null;
    result = judge(market ? [market] : []);
  } else {
    const byMarket = await gammaGet<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
    if (byMarket[0]) {
      result = judge([byMarket[0]]);
    } else {
      const events = await gammaGet<{ markets?: GammaMarket[] }[]>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
      result = judge((events[0]?.markets ?? []).filter((m) => !m.closed));
    }
  }

  const now = Date.now();
  const ttl = result.market ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
  db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(cacheKey, JSON.stringify(result), now, now + ttl);
  return result;
}

function judge(candidates: GammaMarket[]): MarketResolution {
  if (candidates.length === 0) return { market: null, problem: "Market not found" };
  if (candidates.length > 1) return { market: null, problem: "Pick a market" };
  const market = candidates[0]!;
  if (!isYesNoMarket(market)) return { market: null, problem: "Not a Yes/No market" };
  return { market, problem: null };
}

export async function buildPredictionIntel(
  t: PredictionTarget,
  mode: "chip" | "panel",
): Promise<{ signals: Signal[]; panel: PredictionPanel; headline: string | null }> {
  const errors: string[] = [];
  let resolution: MarketResolution | null = null;
  try {
    resolution = await resolveMarket(t.slug);
  } catch (e) {
    errors.push(`Polymarket lookup failed: ${e instanceof Error ? e.message : e}`);
  }
  const market = resolution?.market ?? null;
  if (!market) {
    const problem = resolution?.problem ?? null;
    return {
      signals: predictionSignals({ outcome: t.outcome }),
      panel: { market: null, holders: null, trades: null, errors: problem ? [...errors, problem] : errors },
      headline: problem,
    };
  }
  const marketId = market.id;
  const headline = t.outcome ? null : "Pick YES or NO";
  // Without a picked outcome the signal can't be computed: don't spend credits on the chip.
  if (!t.outcome && mode === "chip") {
    return { signals: predictionSignals({}), panel: { ...marketPanel(market), holders: null, trades: null, errors }, headline };
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

  return {
    signals: predictionSignals({ outcome: t.outcome, holders: holders.value, pnl }),
    panel: {
      ...marketPanel(market),
      holders: list.map((h) => ({ ...h, key: holderKey(h), pnl: pnl[holderKey(h)] ?? null })),
      trades: trades?.value ?? null,
      errors,
    },
    headline,
  };
}

function marketPanel(market: GammaMarket): Pick<PredictionPanel, "market"> {
  let yesPrice: number | null = null;
  try {
    yesPrice = market.outcomePrices ? Number(JSON.parse(market.outcomePrices)[0]) : null;
  } catch {
    yesPrice = null;
  }
  return { market: { id: market.id, question: market.question, slug: market.slug, yesPrice, endDate: market.endDate ?? null } };
}
