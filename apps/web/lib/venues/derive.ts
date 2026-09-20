import { normalizeFundingCap, oiTrend, venueBasisBps, type OiHistorySeries, type PerpVenueQuote } from "@tripwire/core";
import { venueNum } from "./http";

/**
 * Round 2.5: the figures each venue was already sending in the payloads the table fetches, and
 * the rules for turning five different shapes into five comparable cells.
 *
 * These are pure functions over the recorded response shapes, deliberately separate from
 * `index.ts`'s fetching, so every rule below is testable without a network or a fixture file:
 *
 * - **Basis** is mark minus the venue's own fair-value reference, in basis points, and exists
 *   only where the payload carries **both** halves. Three venues can answer it. OKX publishes a
 *   `premium` it derived some other way and dYdX publishes an oracle with no mark, and neither
 *   is filled in from the other two, because three differently computed figures in one column
 *   invite a comparison none of them supports.
 * - **24h change** is deliberately *not* here, although four of the five venues publish it and
 *   the brief listed it. It is a property of the asset rather than of the venue, so a column of
 *   it would print one number five times in a table that is already six columns wide inside a
 *   440px popover, and the card states the coin's 24h change once already in "The market right
 *   now". Nothing is parsed here that nothing renders.
 * - **The next funding time** is the venue's own absolute epoch. It is never derived from a
 *   schedule ("dYdX pays hourly, so the next one is at the top of the hour") — that would be
 *   this card's claim rather than the venue's.
 * - **The funding cap** arrives as a magnitude on Bybit and a signed pair on OKX; both are
 *   normalised by `normalizeFundingCap` so the card has one render path, not two parsers.
 *
 * Every one of them is null-in, null-out. A venue that answered without a field must not read
 * as a zero basis, a flat day or an uncapped market.
 */

export type VenueExtras = Pick<PerpVenueQuote, "indexPrice" | "basisBps" | "nextFundingMs" | "fundingCap">;

export const NO_EXTRAS: VenueExtras = { indexPrice: null, basisBps: null, nextFundingMs: null, fundingCap: null };

/** An epoch in milliseconds, or null. Rejects the zero and the empty string venues send for
 * "no scheduled payment", which would otherwise render as 1970. */
function epochMs(v: unknown): number | null {
  const n = venueNum(v);
  return n !== null && n > 0 ? n : null;
}

/** Binance USD-M: `premiumIndex` carries the mark, the index and the next payment. */
export function binanceQuoteFrom(input: { premium: { markPrice?: string; indexPrice?: string; nextFundingTime?: number } | null | undefined }): VenueExtras {
  const index = venueNum(input.premium?.indexPrice);
  return {
    indexPrice: index,
    basisBps: venueBasisBps(venueNum(input.premium?.markPrice), index),
    nextFundingMs: epochMs(input.premium?.nextFundingTime),
    // Binance publishes an `interestRate` and no funding bound in this payload.
    fundingCap: null,
  };
}

/** Bybit v5: everything is on the one ticker row, and `fundingCap` is a single magnitude
 * covering both bounds. */
export function bybitQuoteFrom(t: { markPrice?: string; indexPrice?: string; nextFundingTime?: string; fundingCap?: string } | null | undefined): VenueExtras {
  const index = venueNum(t?.indexPrice);
  return {
    indexPrice: index,
    basisBps: venueBasisBps(venueNum(t?.markPrice), index),
    nextFundingMs: epochMs(t?.nextFundingTime),
    fundingCap: normalizeFundingCap({ magnitude: venueNum(t?.fundingCap) }),
  };
}

/**
 * OKX: the funding payload states the schedule and both bounds. There is no index price in any
 * response the table already fetches, so the basis cell stays blank rather than being filled
 * from `premium`, which OKX computes against an index we never see.
 */
export function okxQuoteFrom(input: {
  funding: { nextFundingTime?: string; maxFundingRate?: string; minFundingRate?: string } | null | undefined;
}): VenueExtras {
  return {
    indexPrice: null,
    basisBps: null,
    nextFundingMs: epochMs(input.funding?.nextFundingTime),
    fundingCap: normalizeFundingCap({ lower: venueNum(input.funding?.minFundingRate), upper: venueNum(input.funding?.maxFundingRate) }),
  };
}

/**
 * dYdX v4: the indexer publishes an oracle price with no mark to compare it to, no funding
 * timestamp and no funding bound, so every cell this round adds is blank on this row — blank,
 * rather than borrowed from a venue that did answer.
 */
export function dydxQuoteFrom(): VenueExtras {
  return { ...NO_EXTRAS };
}

// ---- Binance open-interest history ------------------------------------------------------------

export type BinanceOiHistRow = { timestamp?: number; sumOpenInterest?: string; sumOpenInterestValue?: string };

/**
 * Binance's `futures/data/openInterestHist` rows as a series the card can draw.
 *
 * This is the only open-interest-over-time source in the set — every other venue publishes a
 * single current figure — which is exactly why the series carries the venue that produced it:
 * a 24h delta drawn from Binance must never be read as Hyperliquid's. `sumOpenInterestValue` is
 * the one-side USD figure, the same convention as the table's own column (`oiSides: 1`).
 *
 * Fewer than two usable points is not a series, and returns null rather than a flat line.
 */
export function oiHistoryFrom(symbol: string, rows: BinanceOiHistRow[] | null | undefined, period = "5m"): OiHistorySeries | null {
  if (!Array.isArray(rows)) return null;
  const points = rows
    .map((r) => {
      const timeMs = epochMs(r?.timestamp);
      const oiUsd = venueNum(r?.sumOpenInterestValue);
      return timeMs === null || oiUsd === null ? null : { timeMs, oiUsd };
    })
    .filter((p): p is { timeMs: number; oiUsd: number } => p !== null)
    .sort((a, b) => a.timeMs - b.timeMs);
  return oiTrend(points) === null ? null : { venue: "binance", symbol, period, points };
}

// ---- Hyperliquid's open-interest cap list --------------------------------------------------------

/**
 * Whether Hyperliquid currently lists this coin among the perps at their open-interest cap.
 *
 * **Null means the list could not be read**, which is not the same as "not capped": a failed
 * free call must not produce a reassuring answer. The list is a bare array of coin names.
 */
export function atCapFrom(coin: string, list: readonly string[] | null | undefined): boolean | null {
  if (!Array.isArray(list)) return null;
  const wanted = coin.trim().toUpperCase();
  return list.some((c) => typeof c === "string" && c.trim().toUpperCase() === wanted);
}
