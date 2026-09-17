import { venueFunding, type PerpVenueQuote } from "@tripwire/core";
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

type Universe = { name: string; szDecimals?: number; maxLeverage?: number; onlyIsolated?: boolean };
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
type MetaAndAssetCtxs = [{ universe: Universe[] }, AssetCtx[]];

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
  openInterestCoins: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  dayChangePct: number | null;
  maxLeverage: number | null;
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
  const oi = num(ctx.openInterest);
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
  };
}

/** The Hyperliquid row of the cross-venue table, from the same payload. */
export function hlVenueQuote(market: HlMarket | null, coin: string, error: string | null): PerpVenueQuote {
  return {
    venue: "hyperliquid",
    symbol: coin,
    markPrice: market?.markPrice ?? null,
    funding: venueFunding("hyperliquid", market?.fundingHourly ?? null),
    openInterestUsd: market?.openInterestUsd ?? null,
    volume24hUsd: market?.dayVolumeUsd ?? null,
    longAccountShare: null,
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
