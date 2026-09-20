import { describe, expect, it } from "vitest";
import {
  balanceChangePct,
  chainGroups,
  fractionToPct,
  screenerKey,
  stillHoldingSummary,
  tapeDivider,
  tapeKeepsRow,
  tapeSpan,
  TAPE_MIN_USD,
} from "../src/index";

const at = (iso: string) => ({ timestampIso: iso });

describe("2.1 — the trade tape's post-time divider", () => {
  // Newest first, which is the order the tape is drawn in.
  const rows = [at("2026-09-20T13:13:50Z"), at("2026-09-20T13:10:00Z"), at("2026-09-20T13:05:00Z"), at("2026-09-20T12:59:08Z")];

  it("puts a trade either side of the post on the correct side of the divider", () => {
    const divider = tapeDivider(rows, "2026-09-20T13:07:00Z");
    expect(divider).toEqual({ kind: "inside", index: 2 });
    // Everything above the index is after the post; everything at or below it is before.
    expect(rows.slice(0, 2).every((r) => Date.parse(r.timestampIso) > Date.parse("2026-09-20T13:07:00Z"))).toBe(true);
    expect(rows.slice(2).every((r) => Date.parse(r.timestampIso) < Date.parse("2026-09-20T13:07:00Z"))).toBe(true);
  });

  it("refuses to draw a divider when the post is older than the fetched window", () => {
    // The measured case: 100 recorded WIF trades span fourteen minutes, so a post from the day
    // before is outside them. A divider under the last row would imply the list is everything
    // that happened since the post.
    expect(tapeDivider(rows, "2026-09-19T10:00:00Z")).toEqual({ kind: "older-than-window" });
  });

  it("refuses to draw one when every trade predates the post", () => {
    expect(tapeDivider(rows, "2026-09-20T18:00:00Z")).toEqual({ kind: "newer-than-window" });
  });

  it("says no-post rather than empty on a venue card, which has no post at all", () => {
    expect(tapeDivider(rows, null)).toEqual({ kind: "no-post" });
    expect(tapeDivider(rows, "not a date")).toEqual({ kind: "no-post" });
    expect(tapeDivider([], "2026-09-20T13:07:00Z")).toEqual({ kind: "empty" });
  });

  it("states the span it actually fetched", () => {
    expect(tapeSpan(rows)).toEqual({ fromIso: "2026-09-20T12:59:08.000Z", toIso: "2026-09-20T13:13:50.000Z" });
    expect(tapeSpan([])).toBeNull();
  });
});

describe("2.1 — which trades earn a line", () => {
  it("keeps a labelled wallet's trade whatever its size", () => {
    expect(tapeKeepsRow("CASHCAT Whale", 1.5)).toBe(true);
    expect(tapeKeepsRow("CASHCAT Whale", null)).toBe(true);
  });

  it("holds an unlabelled trade to the floor, and treats an empty label as unlabelled", () => {
    expect(tapeKeepsRow("", TAPE_MIN_USD)).toBe(true);
    expect(tapeKeepsRow("", TAPE_MIN_USD - 0.01)).toBe(false);
    expect(tapeKeepsRow(null, null)).toBe(false);
  });
});

describe("2.1 — have the winners already sold?", () => {
  it("weights by peak position value, so ten never-sold dust rows cannot carry the sentence", () => {
    // The shape of the recorded page: one large wallet that sold everything, and a crowd of small
    // wallets that never sold. Unweighted this reads 91% still holding; weighted it reads 9%.
    const rows = [{ stillHoldingRatio: 0, peakUsd: 100_000 }, ...Array.from({ length: 10 }, () => ({ stillHoldingRatio: 1, peakUsd: 1_000 }))];
    const summary = stillHoldingSummary(rows)!;
    expect(summary.counted).toBe(11);
    expect(summary.weightUsd).toBe(110_000);
    expect(summary.pct).toBeCloseTo(9.09, 2);
  });

  it("is null when nothing in the sample carries both a ratio and a weight", () => {
    expect(stillHoldingSummary([])).toBeNull();
    expect(stillHoldingSummary([{ stillHoldingRatio: 1, peakUsd: null }])).toBeNull();
    expect(stillHoldingSummary([{ stillHoldingRatio: null, peakUsd: 5_000 }])).toBeNull();
    // A zero peak carries no weight and must not divide by zero into NaN.
    expect(stillHoldingSummary([{ stillHoldingRatio: 1, peakUsd: 0 }])).toBeNull();
  });

  it("clamps a ratio outside 0-1 rather than reporting more than everything still held", () => {
    expect(stillHoldingSummary([{ stillHoldingRatio: 1.4, peakUsd: 1_000 }])!.pct).toBe(100);
    expect(stillHoldingSummary([{ stillHoldingRatio: -0.2, peakUsd: 1_000 }])!.pct).toBe(0);
  });
});

describe("2.1 — holder change columns", () => {
  it("reads a raw token amount as a percent of the balance it moved against", () => {
    expect(balanceChangePct(5_614_328, 74_200_000)).toBeCloseTo(7.57, 2);
    expect(balanceChangePct(-2_403_395, 74_200_000)).toBeCloseTo(-3.24, 2);
  });

  it("has no denominator for a zero or missing balance, so it prints nothing", () => {
    expect(balanceChangePct(100, 0)).toBeNull();
    expect(balanceChangePct(100, null)).toBeNull();
    expect(balanceChangePct(null, 100)).toBeNull();
    // A reported zero change is a measurement and stays one.
    expect(balanceChangePct(0, 100)).toBe(0);
  });
});

describe("1.6.2 — the catalog is priced before it is bought", () => {
  it("counts one group per five chains, folding duplicates and case", () => {
    expect(chainGroups(["solana", "ethereum", "Solana", "base"])).toEqual([["solana", "ethereum", "base"]]);
    expect(chainGroups(["a", "b", "c", "d", "e", "f"])).toEqual([
      ["a", "b", "c", "d", "e"],
      ["f"],
    ]);
    expect(chainGroups([])).toEqual([]);
    expect(chainGroups([" ", ""])).toEqual([]);
  });

  it("converts Nansen's fraction to a percent, and leaves a missing one missing", () => {
    expect(fractionToPct(-0.07355945698131958)).toBeCloseTo(-7.356, 3);
    expect(fractionToPct(null)).toBeNull();
    expect(fractionToPct(Number.NaN)).toBeNull();
  });

  it("case-folds an EVM address to match a row, and never a Solana mint", () => {
    expect(screenerKey("Ethereum", "0xABCDEF0123456789abcdef0123456789ABCDEF01")).toBe("ethereum:0xabcdef0123456789abcdef0123456789abcdef01");
    expect(screenerKey("solana", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm")).toBe("solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm");
    expect(screenerKey("solana", "ekpqgsjtjmfqkz9kqansqyxrcf8fbopzlhyxdm65zcjm")).not.toBe(
      screenerKey("solana", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"),
    );
  });
});
