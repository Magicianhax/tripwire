import { describe, expect, it } from "vitest";
import { sameTarget, targetKey, type Target } from "../src/index";

const spot = (address: string, chain = "base"): Target => ({ kind: "spot", chain: chain as Target extends { chain: infer C } ? C : never, tokenAddress: address }) as Target;

describe("targetKey / sameTarget", () => {
  it("identifies a spot token by its chain and address, whatever the case or the symbol", () => {
    const a: Target = { kind: "spot", chain: "base", tokenAddress: "0x4A0E65A3ECCEC6DBE60AE065F2E7BB85FAE35EEA", symbol: "SPCX" };
    const b: Target = { kind: "spot", chain: "base", tokenAddress: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" };
    expect(sameTarget(a, b)).toBe(true);
    expect(sameTarget(a, spot("0x1e2f8f0a1b3c4d5e6f708192a3b4c5d6e7f80911"))).toBe(false);
  });

  it("separates the same address on two chains", () => {
    expect(sameTarget(spot("0xabc", "base"), spot("0xabc", "ethereum"))).toBe(false);
  });

  it("separates a perp coin's two sides and a prediction market's two outcomes", () => {
    expect(sameTarget({ kind: "perp", coin: "ETH", side: "long" }, { kind: "perp", coin: "ETH", side: "short" })).toBe(false);
    expect(sameTarget({ kind: "perp", coin: "eth", side: "long" }, { kind: "perp", coin: "ETH", side: "long" })).toBe(true);
    expect(sameTarget({ kind: "prediction", slug: "m", outcomeLabel: "Yes" }, { kind: "prediction", slug: "m", outcomeLabel: "No" })).toBe(false);
    expect(sameTarget({ kind: "prediction", slug: "m", marketId: "1" }, { kind: "prediction", slug: "m", marketId: "2" })).toBe(false);
  });

  it("never claims two kinds are the same subject, and treats a missing target as no match", () => {
    expect(sameTarget({ kind: "perp", coin: "ETH" }, spot("0xabc"))).toBe(false);
    expect(sameTarget(null, spot("0xabc"))).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(targetKey({ kind: "perp", coin: "ETH" })).toBe(targetKey({ kind: "perp", coin: "eth" }));
  });
});
