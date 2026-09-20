import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  fundingCapPressure,
  leverageLadder,
  normalizeFundingCap,
  oiTrend,
  venueBasisBps,
  type MarginTier,
  type OiHistoryPoint,
} from "../src/perp-venues";

/**
 * Round 2.5 — perp depth.
 *
 * Everything here is a figure the venues already send and the card threw away. The rules the
 * tests encode are the ones the brief argued for: one basis formula applied only where both
 * halves exist, two funding-cap shapes normalised into one, a countdown computed from an
 * absolute epoch rather than a cached "seconds remaining", and a null that stays a null.
 */

describe("basis is one formula, applied only where both halves exist", () => {
  it("prices mark against the venue's own index, in basis points", () => {
    // Binance's recorded ETH premiumIndex: mark 2450.46949612, index 2451.42488372.
    expect(venueBasisBps(2450.46949612, 2451.42488372)).toBeCloseTo(-3.897, 2);
    // Bybit's recorded ticker: 2450.48 against 2451.55.
    expect(venueBasisBps(2450.48, 2451.55)).toBeCloseTo(-4.365, 2);
    // Hyperliquid's recorded ctx: mark 2450.2 against oracle 2451.6.
    expect(venueBasisBps(2450.2, 2451.6)).toBeCloseTo(-5.71, 2);
  });

  it("is null when either half is missing, rather than treating the one it has as zero", () => {
    // dYdX publishes an oracle price and no mark; OKX publishes neither in what we fetch.
    expect(venueBasisBps(null, 2449.81)).toBeNull();
    expect(venueBasisBps(2450.4, null)).toBeNull();
    expect(venueBasisBps(null, null)).toBeNull();
  });

  it("refuses a zero or negative reference instead of dividing by it", () => {
    expect(venueBasisBps(2450, 0)).toBeNull();
    expect(venueBasisBps(2450, -1)).toBeNull();
    expect(venueBasisBps(Number.NaN, 2451)).toBeNull();
  });

  it("carries the sign: a mark above the index is a positive basis", () => {
    expect(venueBasisBps(101, 100)).toBeCloseTo(100, 6);
  });
});

describe("two funding-cap shapes, one render path", () => {
  it("reads Bybit's single magnitude as a symmetric pair", () => {
    // Bybit's recorded ETH ticker: fundingCap "0.00333", one magnitude covering both bounds.
    expect(normalizeFundingCap({ magnitude: 0.00333 })).toEqual({ lower: -0.00333, upper: 0.00333 });
    // A sign on the magnitude is still a magnitude.
    expect(normalizeFundingCap({ magnitude: -0.00333 })).toEqual({ lower: -0.00333, upper: 0.00333 });
  });

  it("reads OKX's signed pair as it is written, asymmetry included", () => {
    expect(normalizeFundingCap({ lower: -0.0075, upper: 0.0075 })).toEqual({ lower: -0.0075, upper: 0.0075 });
    expect(normalizeFundingCap({ lower: -0.003, upper: 0.0075 })).toEqual({ lower: -0.003, upper: 0.0075 });
  });

  it("is null for the venues that publish no cap at all", () => {
    expect(normalizeFundingCap({})).toBeNull();
    expect(normalizeFundingCap({ magnitude: null })).toBeNull();
    expect(normalizeFundingCap({ magnitude: 0 })).toBeNull();
    expect(normalizeFundingCap({ lower: -0.0075, upper: null })).toBeNull();
  });

  it("measures how far the current rate is toward the bound it is heading for", () => {
    const cap = normalizeFundingCap({ lower: -0.0075, upper: 0.0075 })!;
    expect(fundingCapPressure(0.006, cap)).toBeCloseTo(0.8, 6);
    // A negative rate is measured against the lower bound, not the upper one.
    expect(fundingCapPressure(-0.006, cap)).toBeCloseTo(0.8, 6);
    expect(fundingCapPressure(0, cap)).toBe(0);
    // Bybit's recorded ETH rate is about 1% of its own cap: nothing to say.
    expect(fundingCapPressure(0.00003531, normalizeFundingCap({ magnitude: 0.00333 })!)).toBeCloseTo(0.0106, 3);
  });

  it("returns null rather than a share when there is no rate or no cap", () => {
    expect(fundingCapPressure(null, { lower: -0.0075, upper: 0.0075 })).toBeNull();
    expect(fundingCapPressure(0.006, null)).toBeNull();
    // An asymmetric cap with a zero bound on the side the rate is on cannot be a share.
    expect(fundingCapPressure(-0.006, { lower: 0, upper: 0.0075 })).toBeNull();
  });
});

describe("the funding countdown is computed from an absolute time, not a cached remainder", () => {
  const now = Date.UTC(2026, 8, 20, 12, 0, 0);

  it("counts hours and minutes down to the venue's own next payment", () => {
    expect(countdownLabel(now + 3 * 3_600_000 + 12 * 60_000, now)).toBe("in 3h 12m");
    expect(countdownLabel(now + 42 * 60_000, now)).toBe("in 42m");
    expect(countdownLabel(now + 90 * 60_000, now)).toBe("in 1h 30m");
  });

  it("does not round the last minute up into a promise", () => {
    expect(countdownLabel(now + 30_000, now)).toBe("in under a minute");
    expect(countdownLabel(now + 59_999, now)).toBe("in under a minute");
  });

  it("says a payment is due rather than counting backwards, while the lag is plausible", () => {
    // The response is cached for 60s and a card sits open for minutes, so a passed time is normal.
    expect(countdownLabel(now - 1, now)).toBe("due now");
    expect(countdownLabel(now - 5 * 60_000, now)).toBe("due now");
  });

  it("says nothing about a timestamp that passed hours ago, because that is a stale snapshot", () => {
    // Replay serves recorded payloads whose payment times are days old. "Due now" about one of
    // those would assert an imminent payment nobody reported.
    expect(countdownLabel(now - 3 * 3_600_000, now)).toBeNull();
    expect(countdownLabel(now - 40 * 24 * 3_600_000, now)).toBeNull();
  });

  it("is null for a venue that does not publish one, and for nonsense", () => {
    expect(countdownLabel(null, now)).toBeNull();
    expect(countdownLabel(0, now)).toBeNull();
    expect(countdownLabel(Number.NaN, now)).toBeNull();
    // Further out than any funding schedule: something is wrong, so say nothing.
    expect(countdownLabel(now + 40 * 3_600_000, now)).toBeNull();
  });
});

describe("open interest over time states its own span and direction", () => {
  const point = (hoursAgo: number, oiUsd: number): OiHistoryPoint => ({ timeMs: Date.UTC(2026, 8, 20, 12) - hoursAgo * 3_600_000, oiUsd });

  it("reports the change across the points it actually has", () => {
    const trend = oiTrend([point(24, 1_000_000_000), point(12, 1_100_000_000), point(0, 1_200_000_000)])!;
    expect(trend.hours).toBe(24);
    expect(trend.changePct).toBeCloseTo(20, 6);
    expect(trend.first).toBe(1_000_000_000);
    expect(trend.last).toBe(1_200_000_000);
  });

  it("is null below two points, because one point is not a trend", () => {
    expect(oiTrend([])).toBeNull();
    expect(oiTrend([point(0, 1_000_000_000)])).toBeNull();
  });

  it("reports no percentage when the first reading is zero, rather than an infinity", () => {
    const trend = oiTrend([point(2, 0), point(0, 500)])!;
    expect(trend.changePct).toBeNull();
    expect(trend.last).toBe(500);
  });
});

describe("the leverage ladder is read at stated sizes, never as one tier", () => {
  it("reads Hyperliquid's tiers as the notional at which the ceiling steps down", () => {
    const tiers: MarginTier[] = [
      { lowerBoundUsd: 0, maxLeverage: 25 },
      { lowerBoundUsd: 20_000_000, maxLeverage: 10 },
    ];
    const ladder = leverageLadder(tiers)!;
    expect(ladder.topLeverage).toBe(25);
    expect(ladder.steps).toEqual([{ fromUsd: 20_000_000, maxLeverage: 10 }]);
  });

  it("is null for a flat table, because 'tier 1 of 1' says nothing the headline did not", () => {
    // Recorded margin table 50: a single tier at 50x.
    expect(leverageLadder([{ lowerBoundUsd: 0, maxLeverage: 50 }])).toBeNull();
    expect(leverageLadder([])).toBeNull();
    expect(leverageLadder(null)).toBeNull();
  });

  it("sorts the steps by size and drops the ones that state no bound", () => {
    const ladder = leverageLadder([
      { lowerBoundUsd: 50_000_000, maxLeverage: 5 },
      { lowerBoundUsd: 0, maxLeverage: 25 },
      { lowerBoundUsd: 20_000_000, maxLeverage: 10 },
    ])!;
    expect(ladder.steps.map((s) => s.maxLeverage)).toEqual([10, 5]);
    expect(ladder.steps.map((s) => s.fromUsd)).toEqual([20_000_000, 50_000_000]);
  });
});
