/**
 * Round 2.2 — a prediction market's outcomes are whatever the market says they are.
 *
 * Measured on Polymarket's live book on 2026-09-20: **44 of the 100 highest-24h-volume open
 * markets** had outcomes other than Yes/No (NFL, CS2, LoL and Dota moneylines, spreads, totals).
 * Every one of them was blank before this round, and the reason they could not simply be waved
 * through is in `fixtures/nansen/gammaMarketOutcomes.json`: market 4384973, "Spread: BAL (-8.5)",
 * whose outcomes are `["BAL", "NO"]` — where NO is New Orleans.
 */
import { describe, expect, it } from "vitest";
// Core has no Node types, so the recorded market is imported rather than read off disk.
import gammaMarketOutcomes from "../../../fixtures/nansen/gammaMarketOutcomes.json";
import {
  EMPTY_RECORD,
  isYesNoOutcomes,
  outcomeIndexOf,
  predictionSignals,
  provenWinnerSplit,
  provenWinnerWeights,
  sideTotals,
  targetOutcomeIndex,
  yesNoSide,
  type HolderRecord,
} from "../src/signals/prediction";
import type { PmHolder } from "../src/nansen-types";

const BAL_NO = JSON.parse(gammaMarketOutcomes.outcomes) as string[];

const holder = (side: string, size: number, price: number | null, address: string): PmHolder => ({
  market_id: "m",
  address,
  owner_address: "0x",
  side,
  position_size: size,
  avg_entry_price: price,
  current_price: price,
  unrealized_pnl_usd: null,
});

const records = (by: Record<string, number>): Record<string, HolderRecord> =>
  Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...EMPTY_RECORD, pnlUsd: v }]));

const signal = (s: ReturnType<typeof predictionSignals>) => s.find((x) => x.id === "smart_side_disagrees")!;

describe("the recorded non-Yes/No market", () => {
  it("is the New Orleans case, not a hypothetical", () => {
    expect(BAL_NO).toEqual(["BAL", "NO"]);
    expect(isYesNoOutcomes(BAL_NO)).toBe(false);
    // The trap, stated: the old side reader turns a football team into "the no side".
    expect(yesNoSide("NO")).toBe("no");
    expect(outcomeIndexOf("NO", BAL_NO)).toBe(1);
    expect(outcomeIndexOf("BAL", BAL_NO)).toBe(0);
  });
});

describe("outcomeIndexOf", () => {
  it("matches exactly and case-insensitively, or not at all", () => {
    expect(outcomeIndexOf("yes", ["Yes", "No"])).toBe(0);
    expect(outcomeIndexOf("  No  ", ["Yes", "No"])).toBe(1);
    expect(outcomeIndexOf("Ravens", ["Ravens", "Saints"])).toBe(0);
    // Never a prefix or a near match: one live event carries 329 markets a character apart.
    expect(outcomeIndexOf("Rav", ["Ravens", "Saints"])).toBeNull();
    expect(outcomeIndexOf("Ravens ", ["Ravens (-3.5)", "Saints"])).toBeNull();
    expect(outcomeIndexOf("Yes", null)).toBeNull();
    expect(outcomeIndexOf("", ["Yes", "No"])).toBeNull();
  });

  it("a repeated outcome name is ambiguous, so it matches nothing", () => {
    expect(outcomeIndexOf("Draw", ["Draw", "Draw"])).toBeNull();
  });
});

describe("targetOutcomeIndex", () => {
  it("resolves the page's label against this market's own set", () => {
    expect(targetOutcomeIndex({ outcomeLabel: "BAL" }, BAL_NO)).toBe(0);
    expect(targetOutcomeIndex({ outcomeLabel: "NO" }, BAL_NO)).toBe(1);
  });

  it("the legacy yes/no flag never overrides a label, and never applies off a Yes/No market", () => {
    // The page read "NO" and also set the legacy flag. On ["BAL", "NO"] the label wins and means
    // New Orleans; the flag would have meant the second outcome of a Yes/No market, which this
    // is not.
    expect(targetOutcomeIndex({ outcomeLabel: "NO", outcome: "no" }, BAL_NO)).toBe(1);
    expect(targetOutcomeIndex({ outcome: "no" }, BAL_NO)).toBeNull();
    expect(targetOutcomeIndex({ outcome: "no" }, ["Yes", "No"])).toBe(1);
    expect(targetOutcomeIndex({ outcome: "yes" }, ["Yes", "No"])).toBe(0);
  });

  it("a label this market does not list resolves to nothing, never to the first outcome", () => {
    expect(targetOutcomeIndex({ outcomeLabel: "Over" }, BAL_NO)).toBeNull();
    expect(targetOutcomeIndex({ outcomeLabel: "Yes" }, BAL_NO)).toBeNull();
    expect(targetOutcomeIndex({}, BAL_NO)).toBeNull();
    expect(targetOutcomeIndex({ outcomeLabel: "Yes" }, null)).toBeNull();
  });
});

describe("provenWinnerWeights", () => {
  it("weights by this market's outcomes, so 'NO' is New Orleans and not the no side", () => {
    const holders = [holder("BAL", 100, 0.5, "a"), holder("NO", 100, 0.5, "b")];
    const split = provenWinnerWeights(holders, BAL_NO, (h) => ({ a: 2, b: 1 })[h.address] ?? null);
    expect(split.byOutcome).toEqual([100, 50]);
    expect(split.proven).toBe(2);
    expect(split.unmatchedUsd).toBe(0);
    // The two-sided reader would have scored the same holders as an empty Yes side.
    expect(provenWinnerSplit(holders, (h) => ({ a: 2, b: 1 })[h.address] ?? null)).toEqual({ yes: 0, no: 50, proven: 1 });
  });

  it("a proven winner on a side the market does not list is reported, never folded in", () => {
    const holders = [holder("BAL", 100, 0.5, "a"), holder("Draw", 100, 0.5, "b")];
    const split = provenWinnerWeights(holders, BAL_NO, () => 2);
    expect(split.byOutcome).toEqual([100, 0]);
    expect(split.proven).toBe(1);
    expect(split.unmatchedUsd).toBe(100);
  });

  it("losers, missing records and unpriceable positions carry no weight", () => {
    const holders = [holder("BAL", 100, 0.5, "a"), holder("NO", 100, 0.5, "b"), holder("BAL", 100, null, "c")];
    const split = provenWinnerWeights(holders, BAL_NO, (h) => ({ a: -5, b: null, c: 9 })[h.address] ?? null);
    expect(split.byOutcome).toEqual([0, 0]);
    expect(split.proven).toBe(0);
  });
});

describe("sideTotals with an outcome set", () => {
  it("reports the market's own outcomes and leaves the Yes/No fields null", () => {
    const totals = sideTotals([holder("BAL", 100, 0.5, "a"), holder("NO", 300, 0.5, "b")], BAL_NO);
    expect(totals.byOutcome).toEqual([50, 150]);
    expect(totals.yesUsd).toBeNull();
    expect(totals.noUsd).toBeNull();
    expect(totals.unmatchedUsd).toBe(0);
    expect(totals.valued).toBe(2);
  });

  it("still fills Yes and No on a market whose outcomes really are Yes and No", () => {
    const totals = sideTotals([holder("Yes", 100, 0.5, "a"), holder("No", 100, 0.5, "b")], ["Yes", "No"]);
    expect(totals.yesUsd).toBeCloseTo(50, 6);
    expect(totals.noUsd).toBeCloseTo(50, 6);
    expect(totals.byOutcome).toEqual([50, 50]);
  });

  it("a side the set does not contain is unmatched, not zero and not 'other'", () => {
    const totals = sideTotals([holder("BAL", 100, 0.5, "a"), holder("Draw", 100, 0.5, "b")], BAL_NO);
    expect(totals.byOutcome).toEqual([50, 0]);
    expect(totals.unmatchedUsd).toBeCloseTo(50, 6);
  });

  it("with no set given it behaves exactly as Round 1.2 shipped it", () => {
    const totals = sideTotals([holder("Yes", 100, 0.5, "a"), holder("Up", 100, 0.5, "b")]);
    expect(totals.byOutcome).toBeNull();
    expect(totals.unmatchedUsd).toBeNull();
    expect(totals.otherUsd).toBeCloseTo(50, 6);
  });
});

describe("smart_side_disagrees on a non-Yes/No market", () => {
  it("produces a value at all, computed against the market's two teams", () => {
    const holders = [holder("BAL", 100, 0.5, "a"), holder("NO", 300, 0.5, "b")];
    const s = signal(predictionSignals({ outcomes: BAL_NO, outcomeIndex: 0, holders, records: records({ a: 1, b: 1 }) }));
    expect(s.value).toBeCloseTo(75, 6);
    expect(s.label).toBe("75% of proven-winner money is on NO");
    // The mapping did not move: >70 is high, exactly as Round 1.2 shipped it.
    expect(s.severity).toBe("high");
  });

  it("names the other outcome, never the word 'No'", () => {
    const holders = [holder("Ravens", 100, 0.5, "a"), holder("Saints", 100, 0.5, "b")];
    const s = signal(predictionSignals({ outcomes: ["Ravens", "Saints"], outcomeIndex: 1, holders, records: records({ a: 1, b: 1 }) }));
    expect(s.label).toContain("on Ravens");
  });

  it("three or more outcomes have no single 'other', and the sentence says so", () => {
    const set = ["Alice", "Bob", "Carol"];
    const holders = [holder("Alice", 100, 0.5, "a"), holder("Bob", 100, 0.5, "b"), holder("Carol", 200, 0.5, "c")];
    const s = signal(predictionSignals({ outcomes: set, outcomeIndex: 0, holders, records: records({ a: 1, b: 1, c: 1 }) }));
    expect(s.value).toBeCloseTo(75, 6);
    expect(s.label).toBe("75% of proven-winner money is on the other outcomes");
  });

  it("no pick is UNCHECKED and the prompt is in the market's own words", () => {
    const s = signal(predictionSignals({ outcomes: BAL_NO }));
    expect(s.value).toBeNull();
    expect(s.label).toBe("Pick BAL or NO to compare with proven winners");
    expect(signal(predictionSignals({ outcomes: ["A", "B", "C"] })).label).toBe("Pick an outcome to compare with proven winners");
  });

  it("money on a side the market does not list is in neither half of the ratio", () => {
    const holders = [holder("BAL", 100, 0.5, "a"), holder("NO", 100, 0.5, "b"), holder("Draw", 1_000_000, 0.5, "c")];
    const s = signal(predictionSignals({ outcomes: BAL_NO, outcomeIndex: 0, holders, records: records({ a: 1, b: 1, c: 1 }) }));
    expect(s.value).toBeCloseTo(50, 6);
  });

  it("a Yes/No market computes exactly what it computed before", () => {
    const holders = [holder("Yes", 100, 0.5, "a"), holder("No", 300, 0.5, "b")];
    const before = signal(predictionSignals({ outcome: "yes", holders, records: records({ a: 1, b: 1 }) }));
    const after = signal(predictionSignals({ outcomes: ["Yes", "No"], outcomeIndex: 0, holders, records: records({ a: 1, b: 1 }) }));
    expect(before.value).toBeCloseTo(75, 6);
    expect(after.value).toBe(before.value);
    expect(after.label).toBe(before.label);
    expect(after.severity).toBe(before.severity);
  });
});
