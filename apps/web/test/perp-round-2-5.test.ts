/**
 * Round 2.5 — perp depth.
 *
 * Everything here runs in replay against recorded responses, so no test reaches an exchange or
 * spends a credit. The recorded venue fixtures are from two different sessions (Round 1.3
 * re-recorded Binance's 24h ticker later than the rest), so prices across venues do not agree
 * to the dollar — which is why every assertion below is about a figure derived *within* one
 * venue's own payload.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countdownLabel, leverageLadder, oiTrend, PERP_VENUES } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-perp25-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

const { crossVenueFunding } = await import("@/lib/venues");
const { _resetVenueState } = await import("@/lib/venues/http");
const { hlMarket, hlPerpAtOpenInterestCap } = await import("@/lib/hyperliquid/perp");
const { perpMarketSection, perpVenuesSection, perpCohortLadderSection } = await import("@/lib/intel/depth");

beforeEach(() => _resetVenueState());

const rowOf = async (venue: string) => (await crossVenueFunding("ETH")).rows.find((r) => r.venue === venue)!;

// --- 2.5.1 the fields the venues were already sending ------------------------------------------

describe("2.5.1 basis is read where both halves exist, and nowhere else", () => {
  it("prices Binance's mark against the index in the same payload", async () => {
    const r = await rowOf("binance");
    // premiumIndex: markPrice 2450.46949612, indexPrice 2451.42488372.
    expect(r.indexPrice).toBeCloseTo(2451.42488372, 6);
    expect(r.basisBps).toBeCloseTo(-3.897, 2);
  });

  it("prices Bybit's mark against its index, and Hyperliquid's against its oracle", async () => {
    expect((await rowOf("bybit")).basisBps).toBeCloseTo(-4.365, 2);
    const hl = await rowOf("hyperliquid");
    expect(hl.indexPrice).toBeCloseTo(2451.6, 6);
    expect(hl.basisBps).toBeCloseTo(-5.71, 2);
  });

  it("leaves OKX and dYdX blank rather than inventing a third formula", async () => {
    // OKX publishes a `premium` it derived some other way; dYdX publishes an oracle price with
    // no mark to compare it to. Neither is a basis, so neither gets a number.
    const okx = await rowOf("okx");
    expect(okx.indexPrice).toBeNull();
    expect(okx.basisBps).toBeNull();
    const dydx = await rowOf("dydx");
    expect(dydx.basisBps).toBeNull();
    expect(PERP_VENUES.okx.basisReference).toBeNull();
    expect(PERP_VENUES.dydx.basisReference).toBeNull();
  });
});

describe("2.5.1 the 24h change is deliberately not a venue column", () => {
  it("is not on the row at all, and nothing parses it", async () => {
    // Four of the five venues publish it and the brief listed it. It is a property of the
    // asset, not of the venue, so a column would print one number five times in a table that
    // is already six columns wide inside a 440px popover — and the card states the coin's 24h
    // change once already, under "The market right now". Nothing is parsed that nothing draws.
    const row = await rowOf("bybit");
    expect(Object.keys(row)).not.toContain("change24hPct");
  });

  it("degrades to null rather than zero when a venue answers without a field", async () => {
    const { binanceQuoteFrom, bybitQuoteFrom, dydxQuoteFrom } = await import("@/lib/venues/derive");
    expect(binanceQuoteFrom({ premium: {} })).toEqual({ indexPrice: null, basisBps: null, nextFundingMs: null, fundingCap: null });
    expect(bybitQuoteFrom({}).basisBps).toBeNull();
    expect(dydxQuoteFrom().nextFundingMs).toBeNull();
    // A venue that sends 0 for "no scheduled payment" must not render as 1970.
    expect(binanceQuoteFrom({ premium: { nextFundingTime: 0 } }).nextFundingMs).toBeNull();
  });
});

describe("2.5.1 two funding-cap shapes reach the card as one", () => {
  it("reads Bybit's magnitude and OKX's signed pair", async () => {
    expect((await rowOf("bybit")).fundingCap).toEqual({ lower: -0.00333, upper: 0.00333 });
    expect((await rowOf("okx")).fundingCap).toEqual({ lower: -0.0075, upper: 0.0075 });
  });

  it("leaves the venues that publish no cap null", async () => {
    expect((await rowOf("binance")).fundingCap).toBeNull();
    expect((await rowOf("hyperliquid")).fundingCap).toBeNull();
    expect((await rowOf("dydx")).fundingCap).toBeNull();
  });
});

// --- 2.5.2 the funding countdown ----------------------------------------------------------------

describe("2.5.2 every venue that publishes a next funding time carries the absolute epoch", () => {
  it("takes each centralised venue's own timestamp", async () => {
    expect((await rowOf("binance")).nextFundingMs).toBe(1789689600000);
    expect((await rowOf("bybit")).nextFundingMs).toBe(1789689600000);
    expect((await rowOf("okx")).nextFundingMs).toBe(1789718400000);
  });

  it("fills Hyperliquid's from predictedFundings, which had no caller before this round", async () => {
    // The recorded payload carries HlPerp for ETH at 1789675200000. Hyperliquid's own
    // metaAndAssetCtxs says nothing about when the next payment lands.
    expect((await rowOf("hyperliquid")).nextFundingMs).toBe(1789675200000);
  });

  it("leaves dYdX null rather than rounding up to the next hour on its behalf", async () => {
    // dYdX v4 settles hourly, but the indexer does not publish the timestamp, and a derived
    // one would be this card's claim rather than the venue's.
    expect((await rowOf("dydx")).nextFundingMs).toBeNull();
  });

  it("counts down from the reader's clock, not from the cached response", () => {
    const next = 1789689600000;
    expect(countdownLabel(next, next - 2 * 3_600_000 - 30 * 60_000)).toBe("in 2h 30m");
    // A response cached for 60s outlives its own countdown; a passed time says so.
    expect(countdownLabel(next, next + 60_000)).toBe("due now");
  });
});

// --- 2.5.3 open interest over time ---------------------------------------------------------------

describe("2.5.3 open interest gets a history, and it is named after the venue that published it", () => {
  it("reads Binance's statistics host into a series that states its own span", async () => {
    const section = await perpVenuesSection("ETH");
    const series = section.oiHistory!;
    expect(series.venue).toBe("binance");
    expect(series.symbol).toBe("ETHUSDT");
    expect(series.period).toBe("5m");
    expect(series.points.length).toBe(288);
    const trend = oiTrend(series.points)!;
    // 288 five-minute buckets is just under 24 hours of readings.
    expect(trend.hours).toBe(24);
    expect(trend.changePct).not.toBeNull();
  });

  it("carries the USD figure through the same one-side normalisation as the table's own column", async () => {
    const series = (await perpVenuesSection("ETH")).oiHistory!;
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "fixtures", "venues", "binance-openInterestHist.json"), "utf8"));
    expect(PERP_VENUES.binance.oiSides).toBe(1);
    expect(series.points[0]!.oiUsd).toBeCloseTo(Number(raw[0].sumOpenInterestValue), 2);
    expect(series.points[0]!.timeMs).toBe(raw[0].timestamp);
  });

  it("costs the table nothing when it fails", async () => {
    // The statistics host is separate from `fapi` and can rate-limit on its own; the sparkline
    // is the only thing that may be lost when it does.
    const { oiHistoryFrom } = await import("@/lib/venues/derive");
    expect(oiHistoryFrom("ETHUSDT", null)).toBeNull();
    expect(oiHistoryFrom("ETHUSDT", [])).toBeNull();
    expect(oiHistoryFrom("ETHUSDT", [{ timestamp: 1, sumOpenInterestValue: "not a number" }])).toBeNull();
  });
});

// --- 2.5.4 the open-interest cap ------------------------------------------------------------------

describe("2.5.4 a coin at its open-interest cap says so, and a coin we could not ask about does not", () => {
  it("reads the free list Hyperliquid publishes", async () => {
    // The recorded list is CANTO, FTM, JELLY, LOOM, RLB, VINE, ZEREBRO.
    expect(await hlPerpAtOpenInterestCap("JELLY")).toBe(true);
    expect(await hlPerpAtOpenInterestCap("ETH")).toBe(false);
    expect(await hlPerpAtOpenInterestCap("jelly")).toBe(true);
  });

  it("reaches the market section, where a failed lookup is unknown rather than uncapped", async () => {
    const section = await perpMarketSection("ETH");
    expect(section.atOpenInterestCap).toBe(false);
    const { atCapFrom } = await import("@/lib/venues/derive");
    expect(atCapFrom("ETH", null)).toBeNull();
    expect(atCapFrom("ETH", ["JELLY"])).toBe(false);
    expect(atCapFrom("JELLY", ["JELLY"])).toBe(true);
  });
});

// --- 2.5.5 the leverage ladder ---------------------------------------------------------------------

describe("2.5.5 Hyperliquid's margin table was already in the payload the card fetches", () => {
  it("pairs the coin's marginTableId with the table it names", async () => {
    const m = (await hlMarket("ETH"))!;
    // ETH is marginTableId 55 in the recorded universe, and its ceiling is the 25x headline.
    expect(m.maxLeverage).toBe(25);
    expect(m.marginTiers).not.toBeNull();
    expect(m.marginTiers![0]!.maxLeverage).toBe(25);
    expect(m.marginTiers![0]!.lowerBoundUsd).toBe(0);
  });

  it("states where the ceiling steps down, and says nothing when it never does", async () => {
    const m = (await hlMarket("ETH"))!;
    const ladder = leverageLadder(m.marginTiers);
    if (ladder) {
      expect(ladder.topLeverage).toBe(25);
      for (const step of ladder.steps) expect(step.maxLeverage).toBeLessThan(25);
    }
    // A single-tier table is the common case and has nothing to add to the headline.
    expect(leverageLadder([{ lowerBoundUsd: 0, maxLeverage: 25 }])).toBeNull();
  });
});

// --- 2.5.6 the cohort liquidation ladder ------------------------------------------------------------

describe("2.5.6 the liquidation ladder can be read for a cohort other than Smart Money", () => {
  it("buys a different population, and says which one and what it cost", async () => {
    const section = await perpCohortLadderSection("ETH", "all_traders");
    expect(section.cohort).toBe("all_traders");
    expect(section.credits).toBe(5);
    expect(section.positions!.length).toBe(50);
    // The recorded all-traders page is $1.71B against Smart Money's $573M over the same 50 rows.
    const total = section.positions!.reduce((t, p) => t + p.position_value_usd, 0);
    expect(total).toBeGreaterThan(1_000_000_000);
  });

  it("states whether its page was the whole population, like the Smart Money ladder does", async () => {
    const section = await perpCohortLadderSection("ETH", "all_traders");
    expect(section.isLastPage).toBe(false);
    expect(section.returned).toBe(50);
  });

  it("refuses a cohort name Nansen does not define rather than sending it", async () => {
    await expect(perpCohortLadderSection("ETH", "everyone" as never)).rejects.toThrow(/cohort/i);
  });
});
