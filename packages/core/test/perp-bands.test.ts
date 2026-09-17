import { describe, expect, it } from "vitest";
import { liquidationBands, LIQ_BANDS, type PerpPosition } from "../src";

const pos = (liq: number | null, value: number, side: PerpPosition["side"] = "Long"): PerpPosition => ({
  address: "0x1",
  address_label: null,
  side,
  position_value_usd: value,
  leverage: null,
  entry_price: null,
  mark_price: 100,
  liquidation_price: liq,
  upnl_usd: null,
});

describe("liquidationBands", () => {
  it("sums position value inside each band, cumulatively", () => {
    const bands = liquidationBands([pos(98, 1_000), pos(96, 2_000), pos(92, 4_000)], 100);
    expect(bands).not.toBeNull();
    // ±3% catches 98 only; ±5% adds 96; ±10% adds 92.
    expect(bands!.map((b) => b.pct)).toEqual(LIQ_BANDS);
    expect(bands![0]).toMatchObject({ pct: 3, usd: 1_000, count: 1 });
    expect(bands![1]).toMatchObject({ pct: 5, usd: 3_000, count: 2 });
    expect(bands![2]).toMatchObject({ pct: 10, usd: 7_000, count: 3 });
  });

  it("counts both directions from mark", () => {
    const bands = liquidationBands([pos(97, 500, "Long"), pos(103, 700, "Short")], 100);
    expect(bands![0]).toMatchObject({ pct: 3, usd: 1_200, count: 2 });
  });

  it("splits the long and short side of each band", () => {
    const bands = liquidationBands([pos(98, 1_000, "Long"), pos(102, 400, "Short")], 100);
    expect(bands![0]!.longUsd).toBe(1_000);
    expect(bands![0]!.shortUsd).toBe(400);
  });

  it("skips positions with no liquidation price rather than counting them as zero", () => {
    const bands = liquidationBands([pos(null, 9_999), pos(99, 100)], 100);
    expect(bands![0]).toMatchObject({ usd: 100, count: 1 });
  });

  it("is null without a mark price or without positions", () => {
    expect(liquidationBands([pos(99, 100)], null)).toBeNull();
    expect(liquidationBands([pos(99, 100)], 0)).toBeNull();
    expect(liquidationBands(null, 100)).toBeNull();
    expect(liquidationBands([], 100)).toBeNull();
  });

  it("ignores a nonsense liquidation price", () => {
    expect(liquidationBands([pos(0, 100), pos(-5, 100)], 100)![2]).toMatchObject({ usd: 0, count: 0 });
  });
});
