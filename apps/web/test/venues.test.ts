import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PERP_VENUES } from "@tripwire/core";

/** Every test here runs in replay, so nothing reaches an exchange. */
process.env.TRIPWIRE_REPLAY = "1";

const { crossVenueFunding } = await import("../lib/venues");
const { _resetVenueState } = await import("../lib/venues/http");
const { hlMarket, hlBookDepth, hlFundingHistory, hlCandles } = await import("../lib/hyperliquid/perp");
const { perpMarketSection, perpTradersSection, spotHoldersSection, predictionBookSection } = await import("../lib/intel/depth");

beforeEach(() => _resetVenueState());

describe("Hyperliquid public market data", () => {
  it("picks one coin out of the whole-universe snapshot", async () => {
    const m = await hlMarket("ETH");
    expect(m).not.toBeNull();
    expect(m!.coin).toBe("ETH");
    expect(m!.markPrice).toBeGreaterThan(0);
    expect(m!.openInterestUsd).toBeGreaterThan(0);
  });

  it("normalises Hyperliquid's hourly funding onto 8 hours and a year", async () => {
    const m = (await hlMarket("ETH"))!;
    expect(PERP_VENUES.hyperliquid.fundingIntervalHours).toBe(1);
    expect(m.fundingPer8h).toBeCloseTo((m.fundingHourly ?? 0) * 8, 12);
    expect(m.fundingAnnualPct).toBeCloseTo((m.fundingHourly ?? 0) * 24 * 365 * 100, 8);
  });

  it("is null for a coin Hyperliquid doesn't list, rather than picking a neighbour", async () => {
    expect(await hlMarket("NOTACOIN")).toBeNull();
  });

  it("measures book depth within a band of mid and says which way it leans", async () => {
    const book = (await hlBookDepth("ETH"))!;
    expect(book.bestBid).toBeLessThanOrEqual(book.bestAsk!);
    expect(book.spreadBps).toBeGreaterThanOrEqual(0);
    expect(book.bidUsd).toBeGreaterThan(0);
    expect(book.imbalance).toBeGreaterThanOrEqual(-1);
    expect(book.imbalance).toBeLessThanOrEqual(1);
  });

  it("returns funding history in time order, with the 8h equivalent", async () => {
    const points = await hlFundingHistory("ETH");
    expect(points.length).toBeGreaterThan(1);
    for (let i = 1; i < points.length; i++) expect(points[i]!.timeMs).toBeGreaterThanOrEqual(points[i - 1]!.timeMs);
    expect(points[0]!.per8h).toBeCloseTo(points[0]!.hourlyRate * 8, 12);
  });

  it("turns candles into the shape the chart already draws", async () => {
    const { candles, interval } = await hlCandles("ETH", "1d");
    expect(interval).toBe("15m");
    expect(candles.length).toBeGreaterThan(10);
    expect(new Date(candles[0]!.interval_start).toString()).not.toBe("Invalid Date");
    expect(candles[0]!.high).toBeGreaterThanOrEqual(candles[0]!.low);
    // Hyperliquid quotes candle volume in coins; the chart wants USD.
    expect(candles[0]!.volume_usd).toBeGreaterThan(candles[0]!.close);
  });
});

describe("cross-venue funding table", () => {
  it("quotes every venue that lists the coin, each on its own row", async () => {
    const table = await crossVenueFunding("ETH");
    expect(table.coin).toBe("ETH");
    const venues = table.rows.map((r) => r.venue).sort();
    expect(venues).toEqual(["binance", "bybit", "dydx", "hyperliquid", "okx"]);
    for (const row of table.rows) {
      expect(row.error, `${row.venue}: ${row.error}`).toBeNull();
      expect(row.funding.per8h, row.venue).not.toBeNull();
      expect(row.markPrice, row.venue).toBeGreaterThan(0);
    }
  });

  it("names each venue's own contract for the coin", async () => {
    const byVenue = Object.fromEntries((await crossVenueFunding("ETH")).rows.map((r) => [r.venue, r.symbol]));
    expect(byVenue.hyperliquid).toBe("ETH");
    expect(byVenue.binance).toBe("ETHUSDT");
    expect(byVenue.bybit).toBe("ETHUSDT");
    expect(byVenue.okx).toBe("ETH-USDT-SWAP");
    expect(byVenue.dydx).toBe("ETH-USD");
  });

  it("normalises each venue's rate onto the same 8h figure, from its own interval", async () => {
    const rows = (await crossVenueFunding("ETH")).rows;
    for (const r of rows) {
      expect(r.funding.intervalHours, r.venue).toBeGreaterThan(0);
      expect(r.funding.per8h!, r.venue).toBeCloseTo(r.funding.raw! * (8 / r.funding.intervalHours), 12);
      expect(r.funding.annualPct!, r.venue).toBeCloseTo(r.funding.raw! * (24 / r.funding.intervalHours) * 365 * 100, 6);
    }
    // The two hourly venues must not be reported as if they paid 8-hourly.
    expect(rows.find((r) => r.venue === "hyperliquid")!.funding.intervalHours).toBe(1);
    expect(rows.find((r) => r.venue === "dydx")!.funding.intervalHours).toBe(1);
    // Binance's own fundingInfo says ETHUSDT is 8-hourly; it must not be inferred from the
    // remaining time to the next payment, which the fixture shows as ~3.2h.
    expect(rows.find((r) => r.venue === "binance")!.funding.intervalHours).toBe(8);
  });

  it("reports Binance's long-account share where the venue publishes it", async () => {
    const binance = (await crossVenueFunding("ETH")).rows.find((r) => r.venue === "binance")!;
    expect(binance.longAccountShare).toBeGreaterThan(0);
    expect(binance.longAccountShare).toBeLessThanOrEqual(1);
  });

  it("leaves out a venue with no contract for the coin, and says which", async () => {
    // Hyperliquid's 1000x memecoin tickers have no dYdX market.
    const table = await crossVenueFunding("kPEPE");
    expect(table.unmapped).toContain("dydx");
    expect(table.rows.some((r) => r.venue === "dydx")).toBe(false);
  });
});

/**
 * A fixture directory with one venue's files taken out, which is what a venue being down looks
 * like from inside `venueGet`: the call throws a named VenueError. Failing this way exercises
 * the real error path rather than a stub of it.
 */
function fixturesWithout(prefix: string): string {
  const src = path.resolve(__dirname, "..", "..", "..", "fixtures", "venues");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tripwire-venues-"));
  for (const f of fs.readdirSync(src)) if (!f.startsWith(prefix)) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  return dir;
}

describe("one venue failing is one row", () => {
  afterEach(() => {
    delete process.env.TRIPWIRE_VENUE_FIXTURES;
    _resetVenueState();
  });

  it("keeps the other venues when one is unreachable", async () => {
    process.env.TRIPWIRE_VENUE_FIXTURES = fixturesWithout("bybit");
    const table = await crossVenueFunding("ETH");
    const bybit = table.rows.find((r) => r.venue === "bybit")!;
    expect(bybit.error).toBeTruthy();
    expect(bybit.funding.per8h).toBeNull();
    expect(bybit.openInterestUsd).toBeNull();
    // Everyone else still answered.
    for (const r of table.rows.filter((row) => row.venue !== "bybit")) expect(r.error, r.venue).toBeNull();
  });

  it("sinks the failed rows to the bottom of the table", async () => {
    process.env.TRIPWIRE_VENUE_FIXTURES = fixturesWithout("okx");
    const rows = (await crossVenueFunding("ETH")).rows;
    expect(rows[rows.length - 1]!.venue).toBe("okx");
    expect(rows.slice(0, -1).every((r) => r.error === null)).toBe(true);
  });

  it("keeps funding when only a venue's secondary calls are gone", async () => {
    // Binance's open interest and account ratio are nice-to-haves; losing them must not lose
    // the funding rate, which is the column the table exists for.
    process.env.TRIPWIRE_VENUE_FIXTURES = fixturesWithout("binance-o");
    const binance = (await crossVenueFunding("ETH")).rows.find((r) => r.venue === "binance")!;
    expect(binance.error).toBeNull();
    expect(binance.funding.per8h).not.toBeNull();
    expect(binance.openInterestUsd).toBeNull();
  });
});

describe("depth sections", () => {
  it("builds the perp market section from three independent public calls", async () => {
    const s = await perpMarketSection("ETH");
    expect(s.errors).toEqual([]);
    expect(s.market?.markPrice).toBeGreaterThan(0);
    expect(s.book?.bidUsd).toBeGreaterThan(0);
    expect(s.funding?.length).toBeGreaterThan(1);
  });

  it("reads the perp traders section, including who is in this coin right now", async () => {
    const s = await perpTradersSection("ETH");
    expect(s.errors).toEqual([]);
    expect(s.credits).toBe(11);
    expect(s.leaderboard!.length).toBeGreaterThan(0);
    // The leaderboard has no `side` column; it has a signed holding, which is where side comes from.
    const held = s.leaderboard!.find((r) => (r.holdingAmount ?? 0) !== 0);
    if (held) expect(held.side).toBe(held.holdingAmount! > 0 ? "Long" : "Short");
    expect(s.leaderboard![0]!.realizedPnlUsd).not.toBeNull();
    expect(s.trades![0]!.valueUsd).toBeGreaterThan(0);
    // "Top HL accounts active in this coin" is read from each account's own open positions.
    expect(s.topAccountsHere).toBeGreaterThan(0);
    expect(s.topAccounts![0]!.hereNow?.coin.toUpperCase()).toBe("ETH");
  });

  it("marks nobody as active in a coin none of the top accounts holds", async () => {
    const s = await perpTradersSection("NOTACOIN");
    expect(s.topAccountsHere).toBe(0);
    expect(s.topAccounts!.every((a) => a.hereNow === null)).toBe(true);
  });

  it("reads holders with their share of supply", async () => {
    const s = await spotHoldersSection("solana", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm");
    expect(s.credits).toBe(5);
    expect(s.holders!.length).toBeGreaterThan(0);
    expect(s.holders![0]!.valueUsd).toBeGreaterThan(0);
    expect(s.top10SharePct).toBeGreaterThan(0);
  });

  it("groups the prediction book by outcome, bids down and asks up", async () => {
    const s = await predictionBookSection("701502");
    expect(s.errors).toEqual([]);
    expect(s.books!.length).toBeGreaterThan(0);
    for (const b of s.books!) {
      for (let i = 1; i < b.bids.length; i++) expect(b.bids[i]!.price).toBeLessThanOrEqual(b.bids[i - 1]!.price);
      for (let i = 1; i < b.asks.length; i++) expect(b.asks[i]!.price).toBeGreaterThanOrEqual(b.asks[i - 1]!.price);
      if (b.bestBid !== null && b.bestAsk !== null) expect(b.spread).toBeCloseTo(b.bestAsk - b.bestBid, 12);
    }
  });
});
