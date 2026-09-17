import { describe, expect, it } from "vitest";
import { meterFill, meterTicks } from "../app/_lib/meter";
import { targetParts } from "../app/_lib/target-label";

describe("targetParts", () => {
  it("sets addresses in mono, words in the UI face, and names the chain for its logo", () => {
    expect(targetParts({ kind: "spot", chain: "solana", tokenAddress: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" })).toEqual([
      { text: "EKpQ…zcjm", mono: true },
      { text: " on ", mono: false },
      { text: "Solana", mono: false, chain: "solana" },
    ]);
    expect(targetParts({ kind: "spot", chain: "base", tokenAddress: "0xabc", symbol: "WIF" })).toEqual([
      { text: "WIF", mono: false },
      { text: " on ", mono: false },
      { text: "Base", mono: false, chain: "base" },
    ]);
    expect(targetParts({ kind: "perp", coin: "ETH", side: "long" })).toEqual([{ text: "ETH long", mono: false }]);
  });

  it("joins back to the plain label", () => {
    const parts = targetParts({ kind: "prediction", slug: "will-it-rain", outcome: "Yes" } as never);
    expect(parts.map((p) => p.text).join("")).toBe("will-it-rain, Yes");
  });
});

describe("meter", () => {
  it("has five ticks from zero to the maximum", () => {
    expect(meterTicks(1000)).toEqual([0, 250, 500, 750, 1000]);
    expect(meterTicks(3000)).toEqual([0, 750, 1500, 2250, 3000]);
  });

  it("clamps the fill to 0..100% and reports the zero state", () => {
    expect(meterFill(0, 1000)).toEqual({ pct: 0, zero: true });
    expect(meterFill(250, 1000)).toEqual({ pct: 25, zero: false });
    expect(meterFill(5000, 1000)).toEqual({ pct: 100, zero: false });
  });
});
