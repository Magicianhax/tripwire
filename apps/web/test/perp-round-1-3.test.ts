/**
 * Round 1.3 — the perp card stops asserting things that are not true.
 *
 * Everything here runs in replay against the recorded responses, so no test reaches an exchange
 * or spends a credit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PERP_VENUES, positionCohorts, positionLadderAside, recentOpens } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const VENUE_FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "venues");

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-perp13-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

const { crossVenueFunding } = await import("@/lib/venues");
const { _resetVenueState } = await import("@/lib/venues/http");
const { hlMarket, hlFundingHistory } = await import("@/lib/hyperliquid/perp");
const { buildPerpIntel } = await import("@/lib/intel/perp");

beforeEach(() => _resetVenueState());

const ETH = { kind: "perp", coin: "ETH" } as const;

// --- 1.3.2 -----------------------------------------------------------------------------------

describe("1.3.2 open interest is one side of the book, on every row", () => {
  it("reads Bybit's single-sided figure, not the long-plus-short one that sorted the table", async () => {
    const bybit = (await crossVenueFunding("ETH")).rows.find((r) => r.venue === "bybit")!;
    // The recorded ticker carries both: 1,954,642,843.92 both sides, 977,321,434.21 one side.
    expect(bybit.openInterestUsd).toBeCloseTo(977_321_434.21, 2);
  });

  it("halves Hyperliquid's own long-plus-short figure in the same change", async () => {
    // Fixing Bybit alone would have traded one wrong ranking for another: Hyperliquid's
    // `openInterest` is 977,951.4262 ETH, $2.396B both sides at the recorded mark, $1.198B
    // one side.
    const m = (await hlMarket("ETH"))!;
    expect(PERP_VENUES.hyperliquid.oiSides).toBe(2);
    expect(m.openInterestCoins).toBeCloseTo(488_975.71, 2);
    expect(m.openInterestUsd).toBeCloseTo(1_198_088_292.24, 2);
    expect(m.openInterestUsd).toBeCloseTo(m.openInterestCoins! * m.markPrice!, 6);
  });

  it("sorts the venues by a figure that now means the same thing on every row", async () => {
    const order = (await crossVenueFunding("ETH")).rows.filter((r) => !r.error).map((r) => r.venue);
    // Measured on the recorded fixtures: Binance $5.62B, OKX $1.49B, Hyperliquid $1.198B,
    // Bybit $977M, dYdX $16.8M. Before this round Bybit sat 3rd on a doubled number and
    // Hyperliquid sat 2nd on one.
    expect(order).toEqual(["binance", "okx", "hyperliquid", "bybit", "dydx"]);
  });

  it("degrades to null rather than halving a figure whose convention it does not know", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-bybit-"));
    for (const f of fs.readdirSync(VENUE_FIXTURES)) fs.copyFileSync(path.join(VENUE_FIXTURES, f), path.join(dir, f));
    const file = path.join(dir, "bybit-tickers.json");
    const body = JSON.parse(fs.readFileSync(file, "utf8")) as { result: { list: Record<string, unknown>[] } };
    // An inverse or newly listed market that publishes only the legacy both-sides fields.
    delete body.result.list[0]!.singleOpenInterestValue;
    delete body.result.list[0]!.singleOpenInterest;
    fs.writeFileSync(file, JSON.stringify(body));
    process.env.TRIPWIRE_VENUE_FIXTURES = dir;
    _resetVenueState();
    const bybit = (await crossVenueFunding("ETH")).rows.find((r) => r.venue === "bybit")!;
    expect(bybit.openInterestUsd).toBeNull();
    // The rest of the row survives: only the cell we cannot state honestly goes.
    expect(bybit.error).toBeNull();
    expect(bybit.funding.per8h).not.toBeNull();
    delete process.env.TRIPWIRE_VENUE_FIXTURES;
    _resetVenueState();
  });
});

// --- 1.3.5 -----------------------------------------------------------------------------------

describe("1.3.5 the largest venue stops printing an em dash for its own volume", () => {
  it("fills Binance's 24h volume from `ticker/24hr`, in the quote asset", async () => {
    const rows = (await crossVenueFunding("ETH")).rows;
    const binance = rows.find((r) => r.venue === "binance")!;
    expect(binance.volume24hUsd).toBeCloseTo(6_337_810_216.17, 2);
    // Every venue in the table now states one, which is what the column claimed all along.
    for (const r of rows.filter((x) => !x.error)) expect(r.volume24hUsd, r.venue).not.toBeNull();
  });

  it("costs that one cell, never the row, when Binance rate-limits the call", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-b24-"));
    for (const f of fs.readdirSync(VENUE_FIXTURES)) if (f !== "binance-ticker24hr.json") fs.copyFileSync(path.join(VENUE_FIXTURES, f), path.join(dir, f));
    process.env.TRIPWIRE_VENUE_FIXTURES = dir;
    _resetVenueState();
    const binance = (await crossVenueFunding("ETH")).rows.find((r) => r.venue === "binance")!;
    expect(binance.volume24hUsd).toBeNull();
    // Funding, open interest and the long-account share are all still there.
    expect(binance.error).toBeNull();
    expect(binance.funding.per8h).not.toBeNull();
    expect(binance.openInterestUsd).toBeGreaterThan(0);
    expect(binance.longAccountShare).not.toBeNull();
    delete process.env.TRIPWIRE_VENUE_FIXTURES;
    _resetVenueState();
  });
});

// --- 1.3.6 -----------------------------------------------------------------------------------

describe("1.3.6 the funding chart's window is the one that is fetched", () => {
  it("fetches 48 hours, which is what the card's title now says", async () => {
    const points = await hlFundingHistory("ETH");
    expect(points.length).toBeGreaterThan(1);
    const spanHours = (points[points.length - 1]!.timeMs - points[0]!.timeMs) / 3_600_000;
    expect(Math.round(spanHours)).toBe(48);
    // The card's `FUNDING_WINDOW_HOURS` is 48 because this default is; asking for 48 explicitly
    // must give the same series, so a change to the default cannot quietly leave a wrong window
    // in the section title.
    expect(await hlFundingHistory("ETH", 48)).toEqual(points);
  });
});

// --- 1.3.3, 1.3.4, 1.3.7 ---------------------------------------------------------------------

describe("what the perp panel buys, and what the chip does not", () => {
  it("1.3.3 buys the cohort row in panel mode and renders all three cohorts", async () => {
    const { panel } = await buildPerpIntel(ETH, "panel");
    expect(panel.cohorts).not.toBeNull();
    expect(panel.cohortsAtIso).not.toBeNull();
    const cohorts = positionCohorts(panel.cohorts);
    expect(cohorts.map((c) => c.state)).toEqual(["split", "split", "split"]);
    // Verified live on ETH and recorded: the three genuinely disagree, so this is not a
    // restatement of the screener's single Smart Money bar.
    expect(cohorts[0]!.longPct).toBeCloseTo(73.4, 1);
    expect(cohorts[1]!.longPct).toBeCloseTo(53.6, 1);
    expect(cohorts[2]!.longPct).toBeCloseTo(74.1, 1);
  });

  it("1.3.3 never lets the 1-credit cohort call onto the chip", async () => {
    const { panel } = await buildPerpIntel(ETH, "chip");
    expect(panel.mode).toBe("chip");
    expect(panel.cohorts).toBeNull();
    expect(panel.cohortsAtIso).toBeNull();
    expect(panel.trades).toBeNull();
  });

  it("1.3.4 keeps the repointed trade call out of the card's error list", async () => {
    const { panel } = await buildPerpIntel(ETH, "panel");
    expect(panel.trades).not.toBeNull();
    // `panel.errors` drives the card's "Unavailable:" footer and the unchecked headline. A
    // section that could not load is a gap in that section, not a broken check.
    expect(panel.errors).toEqual([]);
    expect(panel.tradesError).toBeNull();
    expect(panel.cohortsError).toBeNull();
  });

  it("1.3.4 filters the 24h page down to opens inside the hour", async () => {
    const { panel } = await buildPerpIntel(ETH, "panel");
    const stamps = (panel.trades ?? []).map((t) => Date.parse(t.block_timestamp));
    const newest = Math.max(...stamps);
    // Every recorded row is a Reduce, so the window is honestly empty and the strip says what
    // it looked at instead of showing nothing.
    const out = recentOpens(panel.trades, newest);
    expect(out.tradeCount).toBe(12);
    expect(out.opens).toHaveLength(0);
    // The same page with one Open in it produces the strip.
    const withOpen = [{ ...panel.trades![0]!, action: "Open", block_timestamp: new Date(newest - 60_000).toISOString() }];
    expect(recentOpens(withOpen, newest).opens).toHaveLength(1);
  });

  it("1.3.7 carries the pagination flag the ladder's aside needs", async () => {
    const { panel } = await buildPerpIntel(ETH, "panel");
    expect(panel.positionsReturned).toBe(50);
    // The recorded page reports `is_last_page: false`, so 50 was a cap and not the population.
    expect(panel.positionsIsLastPage).toBe(false);
    expect(positionLadderAside(6, panel.positionsReturned!, panel.positionsIsLastPage)).toBe("6 of the 50 largest returned");
  });
});

afterEach(() => {
  delete process.env.TRIPWIRE_VENUE_FIXTURES;
});
