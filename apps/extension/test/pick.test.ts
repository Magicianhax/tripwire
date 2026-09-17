import { describe, expect, it } from "vitest";
import { chainForAddress, pickToken } from "../lib/x/pick";

const SOL_CA = { chain: "solana" as const, address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" };
const EVM_CA = { chain: "evm" as const, address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" };

describe("pickToken", () => {
  it("prefers the contract address over a cashtag (shills pair a namesake ticker with the real CA)", () => {
    expect(pickToken({ cashtags: ["WIF"], addresses: [SOL_CA] })).toEqual({ kind: "address", address: SOL_CA });
  });

  it("uses the first address when there are several", () => {
    expect(pickToken({ cashtags: [], addresses: [EVM_CA, SOL_CA] })).toEqual({ kind: "address", address: EVM_CA });
  });

  it("falls back to the first cashtag when the post has no address", () => {
    expect(pickToken({ cashtags: ["PEPE", "WIF"], addresses: [] })).toEqual({ kind: "cashtag", symbol: "PEPE" });
  });

  it("returns null for a post with neither", () => {
    expect(pickToken({ cashtags: [], addresses: [] })).toBeNull();
  });
});

describe("chainForAddress", () => {
  it("solana stays solana; EVM defaults to ethereum unless the post mentions base", () => {
    expect(chainForAddress(SOL_CA, "on base")).toBe("solana");
    expect(chainForAddress(EVM_CA, "new gem")).toBe("ethereum");
    expect(chainForAddress(EVM_CA, "live on Base now")).toBe("base");
  });
});
