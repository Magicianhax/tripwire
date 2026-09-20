import { describe, expect, it } from "vitest";
import type { TokenBag, TokenSource } from "../lib/x/parse";
import { chainForAddress, pickTokens } from "../lib/x/pick";

const SOL_CA = { chain: "solana" as const, address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" };
const EVM_CA = { chain: "evm" as const, address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" };

/** One post body, the shape every pre-2.4 tweet had. */
const body = (tokens: TokenBag): TokenSource[] =>
  tokens.cashtags.length || tokens.addresses.length ? [{ origin: "post", handle: null, text: "", tokens }] : [];

describe("pickTokens", () => {
  it("prefers the contract address over a cashtag (shills pair a namesake ticker with the real CA)", () => {
    expect(pickTokens(body({ cashtags: ["WIF"], addresses: [SOL_CA] }))[0]).toMatchObject({
      token: { kind: "address", address: SOL_CA },
      origin: "post",
    });
  });

  it("keeps both addresses when there are several, most recently typed first", () => {
    const picks = pickTokens(body({ cashtags: [], addresses: [EVM_CA, SOL_CA] }));
    expect(picks.map((p) => p.token)).toEqual([
      { kind: "address", address: EVM_CA },
      { kind: "address", address: SOL_CA },
    ]);
  });

  it("falls back to cashtags when the post has no address", () => {
    expect(pickTokens(body({ cashtags: ["PEPE", "WIF"], addresses: [] }))[0]!.token).toEqual({
      kind: "cashtag",
      symbol: "PEPE",
    });
  });

  it("returns nothing for a post with neither", () => {
    expect(pickTokens(body({ cashtags: [], addresses: [] }))).toEqual([]);
  });
});

describe("chainForAddress", () => {
  it("solana stays solana; EVM defaults to ethereum unless the post mentions base", () => {
    expect(chainForAddress(SOL_CA, "on base")).toBe("solana");
    expect(chainForAddress(EVM_CA, "new gem")).toBe("ethereum");
    expect(chainForAddress(EVM_CA, "live on Base now")).toBe("base");
  });
});
