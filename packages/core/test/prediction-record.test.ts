/**
 * Round 1.2.5 / 1.2.6 / 1.2.8 — what counts as a proven winner, and what the sample says.
 *
 * These two items change the *meaning* of the prediction card's headline signal, so the
 * measurement lives beside the code rather than in a build log nobody re-runs.
 */
import { describe, expect, it } from "vitest";
// The recorded responses themselves: core has no Node types, so the fixtures are imported
// rather than read off disk.
import pmPnlByAddress from "../../../fixtures/nansen/pmPnlByAddress.json";
import pmAddressSummary from "../../../fixtures/nansen/pmAddressSummary.json";
import pmTopHolders from "../../../fixtures/nansen/pmTopHolders.json";
import type { PmHolder } from "../src/nansen-types";
import { EMPTY_RECORD, provenWinnerSplit, recordFromAddressSummary, recordFromPnlRows, sideTotals } from "../src/signals/prediction";

type PnlRow = { total_pnl_usd: number | null; market_resolved: boolean | null };

const holder = (side: string, size: number, price: number | null, address: string): PmHolder => ({
  market_id: "1",
  address,
  owner_address: "0x",
  side,
  position_size: size,
  avg_entry_price: price,
  current_price: price,
  unrealized_pnl_usd: null,
});

describe("1.2.5 — the judged market stops counting in its own weight", () => {
  const rows = pmPnlByAddress.data as PnlRow[];

  it("the recorded wallet's settled-only record differs from the all-rows sum it replaced", () => {
    const allRows = rows.reduce((s, r) => s + (r.total_pnl_usd ?? 0), 0);
    const record = recordFromPnlRows(rows);
    expect(allRows).toBeCloseTo(14_337.53, 2);
    expect(record.pnlUsd).toBeCloseTo(16_815.68, 2);
    // Every row the old sum counted that this one does not is an *open* position — one of which
    // is the market being judged (4441305, market_resolved: false, -744.52 on the fixture).
    expect(record.settledMarkets).toBe(rows.filter((r) => r.market_resolved === true).length);
    expect(record.settledMarkets).toBeLessThan(rows.length);
  });

  it("a wallet with nothing settled has no record, and is never scored as a zero", () => {
    const record = recordFromPnlRows([{ total_pnl_usd: -5_000, market_resolved: false }]);
    expect(record.pnlUsd).toBeNull();
    expect(record.settledMarkets).toBe(0);
    expect(recordFromPnlRows([]).pnlUsd).toBeNull();
    expect(recordFromPnlRows(null).settledMarkets).toBeNull();
  });
});

describe("1.2.8 — the record the card actually buys", () => {
  const summary = pmAddressSummary.data[0]!;

  it("takes realized PnL, never the total that mixes in the open judged position", () => {
    const record = recordFromAddressSummary(summary);
    expect(record.pnlUsd).toBeCloseTo(34_523.68, 2);
    // total_pnl_usd is +13,788.16 — 20,735.52 of unrealized value away from the settled figure,
    // and the open position in the market under judgement is inside that difference.
    expect(record.pnlUsd).not.toBeCloseTo(13_788.16, 2);
    expect(record.winRate).toBeCloseTo(0.1219, 4);
    expect(record.marketsWon).toBe(68);
    expect(record.marketsTraded).toBe(558);
    expect(record.walletAgeDays).toBe(104);
    // The summary cannot say how many markets settled, and inventing one would be a claim.
    expect(record.settledMarkets).toBeNull();
  });

  it("an address the summary has never seen is a record we do not have, not a record of zero", () => {
    expect(recordFromAddressSummary(null)).toEqual(EMPTY_RECORD);
    expect(recordFromAddressSummary({ realized_pnl_usd: null, win_rate: null }).pnlUsd).toBeNull();
  });

  it("a wallet with a high settled PnL and a 12% win rate still weighs by money, not by win rate", () => {
    // The calibration gate on 1.2.8: nothing in this round reads win_rate as a threshold. A
    // win-rate rule would classify the recorded wallet very differently, and its thresholds are
    // unmeasured (docs/CALIBRATION.md, open questions).
    const holders = [holder("Yes", 1_000, 0.5, "a"), holder("No", 1_000, 0.5, "b")];
    const record = recordFromAddressSummary(summary);
    const split = provenWinnerSplit(holders, (h) => (h.address === "a" ? record.pnlUsd : null));
    expect(split.proven).toBe(1);
    expect(split.yes).toBeGreaterThan(0);
    expect(split.no).toBe(0);
  });
});

describe("1.2.6 — side totals and concentration describe the sample, nothing more", () => {
  it("splits the recorded top holders by side and measures the top ten's share", () => {
    const holders = pmTopHolders.data as PmHolder[];
    const totals = sideTotals(holders);
    expect(totals.sample).toBe(holders.length);
    expect(totals.valued).toBe(holders.length);
    expect(totals.yesUsd).toBeGreaterThan(0);
    expect(totals.noUsd).toBeGreaterThan(0);
    expect(totals.top10SharePct).toBeGreaterThan(0);
    expect(totals.top10SharePct).toBeLessThanOrEqual(100);
    // Nothing on this market carries a third outcome, so "other" stays absent rather than 0.
    expect(totals.otherUsd).toBeNull();
  });

  it("an empty sample reports nothing, never zeros", () => {
    expect(sideTotals([])).toEqual({ yesUsd: null, noUsd: null, otherUsd: null, sample: 0, valued: 0, top10SharePct: null });
    expect(sideTotals(null).top10SharePct).toBeNull();
  });

  it("a one-sided sample leaves the other side null, and an unpriceable holder is not counted", () => {
    const totals = sideTotals([holder("No", 100, 0.4, "a"), holder("No", 300, 0.4, "b"), holder("Yes", 999, null, "c")]);
    expect(totals.noUsd).toBeCloseTo(160, 6);
    expect(totals.yesUsd).toBeNull();
    expect(totals.sample).toBe(3);
    expect(totals.valued).toBe(2);
    expect(totals.top10SharePct).toBe(100);
  });

  it("a balanced sample splits evenly and a third outcome lands in 'other'", () => {
    const totals = sideTotals([holder("Yes", 100, 0.5, "a"), holder("no", 100, 0.5, "b"), holder("Up", 100, 0.5, "c")]);
    expect(totals.yesUsd).toBeCloseTo(50, 6);
    expect(totals.noUsd).toBeCloseTo(50, 6);
    expect(totals.otherUsd).toBeCloseTo(50, 6);
  });
});
