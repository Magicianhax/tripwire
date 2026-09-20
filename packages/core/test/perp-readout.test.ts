import { describe, expect, it } from "vitest";
// The recorded responses themselves: core has no Node types, so the fixtures are imported
// rather than read off disk.
import bybitTickers from "../../../fixtures/venues/bybit-tickers.json";
import clearinghouseState from "../../../fixtures/hyperliquid/clearinghouseState.json";
import perpScreener from "../../../fixtures/nansen/perpScreener.json";
import positionIntelligence from "../../../fixtures/nansen/positionIntelligence.json";
import smPerpTrades from "../../../fixtures/nansen/smPerpTrades.json";
import {
  accountLeverage,
  fundingFlow,
  maintenanceBufferPct,
  OPENS_WINDOW_MS,
  positionCohorts,
  positionLadderAside,
  recentOpens,
  smartMoneyLongShort,
} from "../src/perp-readout";
import { PERP_VENUES, PERP_VENUE_IDS, singleSidedOi } from "../src/perp-venues";
import type { PerpPositionIntelligence, PerpScreenerRow, PerpTrade } from "../src/nansen-types";

const screener = (over: Partial<PerpScreenerRow>): PerpScreenerRow => ({
  token_symbol: "ETH",
  mark_price: 2450,
  funding: null,
  open_interest: null,
  current_smart_money_position_longs_usd: null,
  current_smart_money_position_shorts_usd: null,
  smart_money_longs_count: null,
  smart_money_shorts_count: null,
  ...over,
});

// --- 1.3.1 -----------------------------------------------------------------------------------

describe("a null Smart Money row reads unknown, not 50/50", () => {
  it("returns unknown when both position figures are null", () => {
    // The breach this round opens with: `?? 0` plus `total > 0 ? … : 50` painted an even mint
    // and red bar over "Long $0 · 0 wallets / Short $0 · 0 wallets".
    const split = smartMoneyLongShort(screener({}));
    expect(split.state).toBe("unknown");
    expect(smartMoneyLongShort(null).state).toBe("unknown");
    expect(smartMoneyLongShort(undefined).state).toBe("unknown");
  });

  it("keeps a genuinely balanced market as a real 50/50", () => {
    // Guarding on `total === 0` would have swallowed this one, which is why the guard is on
    // both figures being null instead.
    const split = smartMoneyLongShort(
      screener({
        current_smart_money_position_longs_usd: 5_000_000,
        current_smart_money_position_shorts_usd: -5_000_000,
        smart_money_longs_count: 12,
        smart_money_shorts_count: 9,
      }),
    );
    expect(split).toMatchObject({ state: "split", longPct: 50, shortPct: 50, longUsd: 5_000_000, shortUsd: 5_000_000, longCount: 12, shortCount: 9 });
  });

  it("reads a skewed market from the recorded screener row", () => {
    const row = perpScreener.data[0]! as PerpScreenerRow;
    const split = smartMoneyLongShort(row);
    expect(split.state).toBe("split");
    if (split.state !== "split") return;
    // 77,577,513.00642 long against 36,155,132.30196 short.
    expect(split.longPct).toBeCloseTo(68.2, 1);
    expect(split.shortUsd).toBeCloseTo(36_155_132.3, 1);
    expect(split.longCount).toBe(56);
  });

  it("separates 'nobody is positioned' from 'we do not know'", () => {
    const split = smartMoneyLongShort(screener({ current_smart_money_position_longs_usd: 0, current_smart_money_position_shorts_usd: 0 }));
    expect(split.state).toBe("empty");
  });

  it("does not invent the side Nansen did not report", () => {
    const split = smartMoneyLongShort(screener({ current_smart_money_position_longs_usd: 4_000_000 }));
    expect(split).toMatchObject({ state: "split", longPct: 100, shortUsd: 0 });
    // The wallet count Nansen never sent stays null rather than becoming a zero on screen.
    if (split.state === "split") expect(split.shortCount).toBeNull();
  });
});

// --- 1.3.2 -----------------------------------------------------------------------------------

describe("open interest is one side of the book on every row", () => {
  it("records a measured convention for every venue", () => {
    for (const venue of PERP_VENUE_IDS) expect([1, 2]).toContain(PERP_VENUES[venue].oiSides);
    // The one venue whose own field is long-plus-short.
    expect(PERP_VENUES.hyperliquid.oiSides).toBe(2);
    expect(PERP_VENUES.binance.oiSides).toBe(1);
  });

  it("halves a both-sides figure and leaves a one-side figure alone", () => {
    expect(singleSidedOi("hyperliquid", 2_396_190_000)).toBeCloseTo(1_198_095_000, 0);
    expect(singleSidedOi("binance", 5_620_000_000)).toBe(5_620_000_000);
  });

  it("never turns a missing figure into zero open interest", () => {
    for (const venue of PERP_VENUE_IDS) {
      expect(singleSidedOi(venue, null)).toBeNull();
      expect(singleSidedOi(venue, undefined)).toBeNull();
      expect(singleSidedOi(venue, Number.NaN)).toBeNull();
    }
  });

  it("matches Bybit's own two spellings of the same market", () => {
    const ticker = bybitTickers.result.list[0]!;
    // The evidence behind bybit.oiSides === 1: the field we read is exactly half the other.
    expect(Number(ticker.openInterestValue) / Number(ticker.singleOpenInterestValue)).toBeCloseTo(2, 4);
  });
});

// --- 1.3.3 -----------------------------------------------------------------------------------

describe("three cohorts, each on its own scale", () => {
  const row = positionIntelligence.data[0]! as PerpPositionIntelligence;

  it("reads all three cohorts from the recorded row", () => {
    const cohorts = positionCohorts(row);
    expect(cohorts.map((c) => c.id)).toEqual(["smart_trader", "whale", "public_figure"]);
    expect(cohorts[0]!.longPct).toBeCloseTo(73.4, 1);
    expect(cohorts[1]!.longPct).toBeCloseTo(53.6, 1);
    expect(cohorts[2]!.longPct).toBeCloseTo(74.1, 1);
  });

  it("states that `*_total_usd` is longs plus shorts, not net exposure", () => {
    for (const c of positionCohorts(row)) {
      expect(c.grossUsd).toBeCloseTo((c.longsUsd ?? 0) + Math.abs(c.shortsUsd ?? 0), 2);
      // A net figure would be the difference; nothing here may be read as one.
      expect(c.grossUsd).not.toBeCloseTo((c.longsUsd ?? 0) - Math.abs(c.shortsUsd ?? 0), 2);
    }
  });

  it("normalises each bar to its own total, so the whale figure cannot flatten the smart one", () => {
    const cohorts = positionCohorts(row);
    // Whale gross is roughly 20x smart-trader gross on this row; both bars still read.
    expect(cohorts[1]!.grossUsd! / cohorts[0]!.grossUsd!).toBeGreaterThan(10);
    for (const c of cohorts) expect(c.longPct).toBeGreaterThan(1);
  });

  it("renders a cohort with no data as unknown, never as an even split", () => {
    const [smart, whale] = positionCohorts({ ...row, whale_longs_usd: null, whale_shorts_usd: null, whale_total_usd: null });
    expect(smart!.state).toBe("split");
    expect(whale!.state).toBe("unknown");
    expect(whale!.longPct).toBeNull();
    expect(positionCohorts(null).every((c) => c.state === "unknown")).toBe(true);
  });

  it("separates a cohort that holds nothing from a cohort we know nothing about", () => {
    const [smart] = positionCohorts({ ...row, smart_trader_longs_usd: 0, smart_trader_shorts_usd: 0, smart_trader_total_usd: 0 });
    expect(smart!.state).toBe("empty");
  });
});

// --- 1.3.4 -----------------------------------------------------------------------------------

const trade = (over: Partial<PerpTrade>): PerpTrade => ({
  trader_address_label: null,
  trader_address: "0xabc",
  token_symbol: "ETH",
  side: "Long",
  action: "Reduce",
  value_usd: 1_000,
  price_usd: 2_450,
  block_timestamp: "2026-09-17T10:00:00.000000Z",
  ...over,
});

describe("the 5-credit trade call becomes the opens strip", () => {
  const now = Date.parse("2026-09-17T11:00:00Z");

  it("filters a 24h response down to the opens inside one hour", () => {
    const rows = [
      trade({ action: "Open", block_timestamp: "2026-09-17T10:30:00.000000Z", trader_address: "0xin" }),
      trade({ action: "Open", block_timestamp: "2026-09-17T02:00:00.000000Z", trader_address: "0xold" }),
      trade({ action: "Reduce", block_timestamp: "2026-09-17T10:45:00.000000Z", trader_address: "0xcut" }),
      trade({ action: "Add", block_timestamp: "2026-09-17T10:50:00.000000Z", trader_address: "0xadd" }),
      trade({ action: "Close", block_timestamp: "2026-09-17T10:55:00.000000Z", trader_address: "0xclose" }),
    ];
    const out = recentOpens(rows, now);
    // An add is not an open, and neither is a reduce or a close: the strip is titled "opened".
    expect(out.opens.map((t) => t.trader_address)).toEqual(["0xin"]);
    expect(out.tradeCount).toBe(5);
    expect(out.latestOpenIso).toBe("2026-09-17T10:30:00.000000Z");
  });

  it("says when the last open was, so an empty hour is still an answer", () => {
    const out = recentOpens([trade({ action: "open", block_timestamp: "2026-09-17T02:00:00.000000Z" })], now);
    expect(out.opens).toHaveLength(0);
    expect(out.latestOpenIso).toBe("2026-09-17T02:00:00.000000Z");
  });

  it("finds no opens in the recorded window, and says how many trades it looked at", () => {
    // The recorded page is 12 rows and every one of them is a Reduce, so replay exercises the
    // empty line rather than the list. That is what the market did, not a parsing failure.
    const rows = smPerpTrades.data as PerpTrade[];
    const out = recentOpens(rows, Date.parse("2026-09-17T10:30:00Z"));
    expect(out.tradeCount).toBe(12);
    expect(out.opens).toHaveLength(0);
    expect(out.latestOpenIso).toBeNull();
  });

  it("survives a missing call, a missing action and an unparseable stamp", () => {
    expect(recentOpens(null, now).opens).toHaveLength(0);
    expect(recentOpens(undefined, now).tradeCount).toBe(0);
    expect(recentOpens([trade({ action: "Open", block_timestamp: "not a date" })], now).opens).toHaveLength(0);
    expect(recentOpens([trade({ action: undefined as unknown as string })], now).opens).toHaveLength(0);
  });

  it("reads an offset-free stamp as UTC, not as the reader's local time", () => {
    const out = recentOpens([trade({ action: "Open", block_timestamp: "2026-09-17T10:30:00" })], now);
    expect(out.opens).toHaveLength(1);
    expect(OPENS_WINDOW_MS).toBe(3_600_000);
  });
});

// --- 1.3.7 -----------------------------------------------------------------------------------

describe("the ladder says whether it is the whole set", () => {
  it("names a truncated page as the largest returned", () => {
    expect(positionLadderAside(6, 50, false)).toBe("6 of the 50 largest returned");
  });
  it("states a complete page plainly", () => {
    expect(positionLadderAside(6, 12, true)).toBe("6 of 12");
  });
  it("claims nothing when the response did not say", () => {
    expect(positionLadderAside(6, 50, null)).toBe("6 of 50 returned");
    expect(positionLadderAside(6, 50, undefined)).toBe("6 of 50 returned");
  });
});

// --- 1.3.8 -----------------------------------------------------------------------------------

describe("the Hyperliquid account fields already on the wire", () => {
  const state = clearinghouseState;

  it("reads a negative cumFunding as funding paid", () => {
    const btc = state.assetPositions.find((p) => p.position.coin === "BTC")!.position;
    const flow = fundingFlow(Number(btc.cumFunding.allTime));
    expect(flow.direction).toBe("paid");
    expect(flow.usd).toBeCloseTo(3_495_876.56, 2);
    expect(flow.text).toBe("paid in funding");
  });

  it("reads a positive cumFunding as funding received, and zero as neither", () => {
    const pons = state.assetPositions.find((p) => p.position.coin === "PONS")!.position;
    expect(fundingFlow(Number(pons.cumFunding.allTime)).direction).toBe("received");
    expect(fundingFlow(0).direction).toBe("flat");
    expect(fundingFlow(null)).toMatchObject({ direction: "unknown", usd: null });
  });

  it("derives account leverage, which is not the leverage configured on a position", () => {
    const derived = accountLeverage(Number(state.marginSummary.totalNtlPos), Number(state.marginSummary.accountValue));
    expect(derived).toBeCloseTo(3.78, 2);
    // The same account configured 30x on its BTC leg. Two true numbers, two labels.
    expect(state.assetPositions.find((p) => p.position.coin === "BTC")!.position.leverage.value).toBe(30);
    expect(accountLeverage(1, 0)).toBeNull();
    expect(accountLeverage(null, 100)).toBeNull();
  });

  it("gives a maintenance buffer that is a share of equity, not a liquidation price", () => {
    const buffer = maintenanceBufferPct(Number(state.marginSummary.accountValue), Number(state.crossMaintenanceMarginUsed));
    expect(buffer).toBeCloseTo(82.6, 1);
    // The position this buffer covers has no liquidation price at all, which is the reason the
    // tile may never be phrased as one.
    expect(state.assetPositions.find((p) => p.position.coin === "BTC")!.position.liquidationPx).toBeNull();
    expect(maintenanceBufferPct(null, 1)).toBeNull();
  });
});
