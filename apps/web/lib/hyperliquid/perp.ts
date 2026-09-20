import { singleSidedOi, venueBasisBps, venueFunding, type MarginTier, type PerpVenueQuote } from "@tripwire/core";
import { atCapFrom } from "../venues/derive";
import { hyperliquidMarket } from "./client";

/**
 * The market side of Hyperliquid's public info API: everything the perp card shows about the
 * coin itself, as opposed to one account. Free, uncredited, backend-only.
 *
 * Every number the venue sends arrives as a decimal *string*; `num()` is the one place that is
 * turned into a number, and anything unparseable becomes null rather than NaN.
 */

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Universe = { name: string; szDecimals?: number; maxLeverage?: number; onlyIsolated?: boolean; marginTableId?: number };
/** `[id, { description, marginTiers }]` pairs, already inside the `metaAndAssetCtxs` response
 * the card fetches: the leverage ceiling steps down above stated notional thresholds. */
type MarginTableEntry = [number, { description?: string; marginTiers?: { lowerBound?: string; maxLeverage?: number }[] }];
type AssetCtx = {
  funding?: string;
  openInterest?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
  premium?: string | null;
  oraclePx?: string;
  markPx?: string;
  midPx?: string | null;
};
type MetaAndAssetCtxs = [{ universe: Universe[]; marginTables?: MarginTableEntry[] }, AssetCtx[]];

export type HlMarket = {
  coin: string;
  markPrice: number | null;
  oraclePrice: number | null;
  midPrice: number | null;
  /** Mark over oracle, as a percentage: what longs are paying above fair value right now. */
  premiumPct: number | null;
  /** Hyperliquid pays funding hourly; the card shows the 8h and annualised forms too. */
  fundingHourly: number | null;
  fundingPer8h: number | null;
  fundingAnnualPct: number | null;
  /** One side of the book — see the note in `hlMarket`, which is where the halving happens. */
  openInterestCoins: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  dayChangePct: number | null;
  maxLeverage: number | null;
  /**
   * The notional thresholds at which this market's leverage ceiling steps down, from the
   * `marginTables` block that has always ridden along in this same response (Round 2.5). Null
   * when the coin names no table, and a flat one-tier table is left for `leverageLadder` to
   * reject — the headline already said it.
   */
  marginTiers: MarginTier[] | null;
};

/** `metaAndAssetCtxs`: mark, oracle, funding, open interest, 24h volume and max leverage for
 * one coin, picked out of the whole-universe payload. */
export async function hlMarket(coin: string): Promise<HlMarket | null> {
  const { data } = await hyperliquidMarket<MetaAndAssetCtxs>("metaAndAssetCtxs");
  const universe = data?.[0]?.universe ?? [];
  const ctxs = data?.[1] ?? [];
  const wanted = coin.toUpperCase();
  const index = universe.findIndex((u) => (u?.name ?? "").toUpperCase() === wanted);
  if (index < 0) return null;
  const ctx = ctxs[index];
  if (!ctx) return null;

  const mark = num(ctx.markPx);
  const oracle = num(ctx.oraclePx);
  /**
   * `openInterest` is long **plus** short, so the card and the venue table halve it to the
   * one-side figure every other venue publishes (`PERP_VENUES.hyperliquid.oiSides`).
   *
   * Fixing Bybit without fixing this would have traded one wrong ranking for another: Bybit's
   * row was twice its real size, and Hyperliquid's still is. Measured rather than assumed —
   * DefiLlama's dimension-adapters #9365 found Hyperliquid at 2.00x CoinMarketCap across 16
   * windows, and our own recorded universe totals $10.59B at face value against $5.30B halved.
   * Nansen's `perp-screener.open_interest` passes the same face value through (2,348,413,914
   * for ETH), so it is not an independent check and is not treated as one.
   */
  const oi = singleSidedOi("hyperliquid", num(ctx.openInterest));
  const marginTiers = readMarginTiers(data?.[0]?.marginTables, universe[index]!.marginTableId);
  const prev = num(ctx.prevDayPx);
  const funding = venueFunding("hyperliquid", num(ctx.funding));
  return {
    coin: universe[index]!.name,
    markPrice: mark,
    oraclePrice: oracle,
    midPrice: num(ctx.midPx),
    premiumPct: mark !== null && oracle !== null && oracle !== 0 ? ((mark - oracle) / oracle) * 100 : null,
    fundingHourly: funding.raw,
    fundingPer8h: funding.per8h,
    fundingAnnualPct: funding.annualPct,
    openInterestCoins: oi,
    openInterestUsd: oi !== null && mark !== null ? oi * mark : null,
    dayVolumeUsd: num(ctx.dayNtlVlm),
    dayChangePct: mark !== null && prev !== null && prev !== 0 ? ((mark - prev) / prev) * 100 : null,
    maxLeverage: universe[index]!.maxLeverage ?? null,
    marginTiers,
  };
}

/** The coin's own margin table, as tiers, or null when the payload names none for it. */
function readMarginTiers(tables: MarginTableEntry[] | undefined, id: number | undefined): MarginTier[] | null {
  if (!Array.isArray(tables) || typeof id !== "number") return null;
  const table = tables.find((t) => Array.isArray(t) && t[0] === id)?.[1];
  const tiers = table?.marginTiers;
  if (!Array.isArray(tiers)) return null;
  const rows = tiers
    .map((t) => {
      const lower = num(t?.lowerBound);
      return lower === null || typeof t?.maxLeverage !== "number" ? null : { lowerBoundUsd: lower, maxLeverage: t.maxLeverage };
    })
    .filter((t): t is MarginTier => t !== null);
  return rows.length > 0 ? rows : null;
}

// ---- predictedFundings: when each venue next pays ---------------------------------------------

/** What one venue is expected to pay next, from Hyperliquid's own cross-venue view. */
export type HlPredictedFunding = { hlNextFundingMs: number | null };

/** Hyperliquid spells the venues this way inside `predictedFundings`. */
const HL_VENUE_KEY = "HlPerp";

type PredictedFundingRow = [string, [string, { fundingRate?: string; nextFundingTime?: number; fundingIntervalHours?: number } | null][]];

/**
 * When Hyperliquid next pays funding on this coin.
 *
 * `predictedFundings` had a TTL entry and no caller outside the recorder. It is free, and it is
 * the **only** source for Hyperliquid's next payment time: `metaAndAssetCtxs` states the current
 * rate and never the schedule. The whole 234-coin payload is cached under one key, because the
 * answer is the same list whichever coin asked for it.
 *
 * The rate it also carries is deliberately not read: the card's funding figures come from each
 * venue's own payload, and a second opinion on the same number in the same row is a way for two
 * cells to disagree.
 */
export async function hlPredictedFunding(coin: string): Promise<HlPredictedFunding | null> {
  const { data } = await hyperliquidMarket<PredictedFundingRow[]>("predictedFundings", {}, { cacheKey: "all" });
  if (!Array.isArray(data)) return null;
  const wanted = coin.trim().toUpperCase();
  const row = data.find((r) => Array.isArray(r) && typeof r[0] === "string" && r[0].toUpperCase() === wanted);
  const venues = row?.[1];
  if (!Array.isArray(venues)) return null;
  const hl = venues.find((v) => Array.isArray(v) && v[0] === HL_VENUE_KEY)?.[1];
  const next = num(hl?.nextFundingTime);
  return { hlNextFundingMs: next !== null && next > 0 ? next : null };
}

// ---- perpsAtOpenInterestCap -------------------------------------------------------------------

/**
 * Whether Hyperliquid currently lists this coin among the perps at their open-interest cap.
 *
 * Free, a bare array of coin names, cached under a single key because the answer is the whole
 * list either way. **Null means the list could not be read** — a failed free call must not come
 * back as a reassuring "not capped". This renders as a line on the card and never as a block.
 */
export async function hlPerpAtOpenInterestCap(coin: string): Promise<boolean | null> {
  try {
    const { data } = await hyperliquidMarket<string[]>("perpsAtOpenInterestCap", {}, { cacheKey: "all" });
    return atCapFrom(coin, data);
  } catch {
    return null;
  }
}

/** The Hyperliquid row of the cross-venue table, from the same payload. */
export function hlVenueQuote(market: HlMarket | null, coin: string, error: string | null, predicted?: HlPredictedFunding | null): PerpVenueQuote {
  return {
    venue: "hyperliquid",
    symbol: coin,
    markPrice: market?.markPrice ?? null,
    funding: venueFunding("hyperliquid", market?.fundingHourly ?? null),
    openInterestUsd: market?.openInterestUsd ?? null,
    volume24hUsd: market?.dayVolumeUsd ?? null,
    longAccountShare: null,
    // Hyperliquid's reference is an oracle rather than an index of spot venues, which is why
    // `PERP_VENUES.hyperliquid.basisReference` names it and the table's note says so.
    indexPrice: market?.oraclePrice ?? null,
    basisBps: venueBasisBps(market?.markPrice ?? null, market?.oraclePrice ?? null),
    nextFundingMs: predicted?.hlNextFundingMs ?? null,
    // Hyperliquid publishes no funding bound.
    fundingCap: null,
    error,
  };
}

export type FundingPoint = { timeMs: number; hourlyRate: number; per8h: number; premium: number | null };

/**
 * `fundingHistory` for one coin over `hours`. Each point is one hourly funding payment; the
 * card charts the 8h-equivalent so the axis reads like every venue's funding chart.
 */
export async function hlFundingHistory(coin: string, hours = 48): Promise<FundingPoint[]> {
  // Bucketed to the hour so a card left open shares one cache entry for the whole window.
  const startTime = Math.floor((Date.now() - hours * 3_600_000) / 3_600_000) * 3_600_000;
  const { data } = await hyperliquidMarket<{ coin: string; fundingRate: string; premium: string | null; time: number }[]>(
    "fundingHistory",
    { coin, startTime },
    { cacheKey: `${coin}|${hours}h|${startTime}` },
  );
  if (!Array.isArray(data)) return [];
  return data
    .map((p) => {
      const rate = num(p?.fundingRate);
      return rate === null || typeof p?.time !== "number"
        ? null
        : { timeMs: p.time, hourlyRate: rate, per8h: rate * 8, premium: num(p?.premium) };
    })
    .filter((p): p is FundingPoint => p !== null)
    .sort((a, b) => a.timeMs - b.timeMs);
}

export type BookDepth = {
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  /** Notional resting within ±`bandPct` of mid, per side. */
  bandPct: number;
  bidUsd: number;
  askUsd: number;
  /** (bid − ask) / (bid + ask): positive means more resting bids than offers. */
  imbalance: number | null;
};

type BookLevel = { px: string; sz: string; n?: number };

/** `l2Book`: how much is actually resting within half a percent of mid, and which way it leans. */
export async function hlBookDepth(coin: string, bandPct = 0.5): Promise<BookDepth | null> {
  const { data } = await hyperliquidMarket<{ coin: string; time: number; levels: [BookLevel[], BookLevel[]] }>("l2Book", { coin }, { cacheKey: coin });
  const bids = data?.levels?.[0] ?? [];
  const asks = data?.levels?.[1] ?? [];
  const bestBid = num(bids[0]?.px);
  const bestAsk = num(asks[0]?.px);
  if (bestBid === null || bestAsk === null) return null;
  const mid = (bestBid + bestAsk) / 2;
  if (mid <= 0) return null;
  const lo = mid * (1 - bandPct / 100);
  const hi = mid * (1 + bandPct / 100);

  const sum = (levels: BookLevel[], keep: (px: number) => boolean) =>
    levels.reduce((total, l) => {
      const px = num(l?.px);
      const sz = num(l?.sz);
      return px !== null && sz !== null && keep(px) ? total + px * sz : total;
    }, 0);

  const bidUsd = sum(bids, (px) => px >= lo);
  const askUsd = sum(asks, (px) => px <= hi);
  const total = bidUsd + askUsd;
  return {
    bestBid,
    bestAsk,
    spreadBps: ((bestAsk - bestBid) / mid) * 10_000,
    bandPct,
    bidUsd,
    askUsd,
    imbalance: total > 0 ? (bidUsd - askUsd) / total : null,
  };
}

/** One candle in the shape `lib/ui/PriceChart.tsx` already draws (`Candle` from core). */
export type PerpCandle = { interval_start: string; open: number; high: number; low: number; close: number; volume_usd: number | null };

const CANDLE_INTERVAL: Record<string, { interval: string; hours: number }> = {
  "1h": { interval: "1m", hours: 1 },
  "6h": { interval: "5m", hours: 6 },
  "1d": { interval: "15m", hours: 24 },
  "7d": { interval: "1h", hours: 24 * 7 },
};

/** `candleSnapshot`: the price series behind the perp card's chart. */
export async function hlCandles(coin: string, window: string): Promise<{ interval: string; candles: PerpCandle[] }> {
  const spec = CANDLE_INTERVAL[window] ?? CANDLE_INTERVAL["1d"]!;
  const bucket = 5 * 60_000;
  const endTime = Math.floor(Date.now() / bucket) * bucket;
  const startTime = endTime - spec.hours * 3_600_000;
  const { data } = await hyperliquidMarket<{ t: number; T: number; o: string; c: string; h: string; l: string; v: string; n?: number }[]>(
    "candleSnapshot",
    { req: { coin, interval: spec.interval, startTime, endTime } },
    { cacheKey: `${coin}|${spec.interval}|${startTime}` },
  );
  if (!Array.isArray(data)) return { interval: spec.interval, candles: [] };
  const candles = data
    .map((c) => {
      const o = num(c?.o);
      const h = num(c?.h);
      const l = num(c?.l);
      const close = num(c?.c);
      const v = num(c?.v);
      if (o === null || h === null || l === null || close === null || typeof c?.t !== "number") return null;
      return { interval_start: new Date(c.t).toISOString(), open: o, high: h, low: l, close, volume_usd: v === null ? null : v * close };
    })
    .filter((c): c is PerpCandle => c !== null);
  return { interval: spec.interval, candles };
}
