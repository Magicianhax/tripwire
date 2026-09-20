// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dexscreenerAdapter, readDexscreenerPair } from "../lib/adapters/dexscreener";

const pair = "cjieb7fumhefmaefjaxqjnkvxnmvabm3dhhp8rtgbeg1";
describe("Dexscreener pair identity", () => {
  it.each([
    "0x714442e9a611f8561a7df108d6d925132937cfb8",
    "0x9a12a27fe4fc8fb943de50c93eae9d57c1cd22b1a642aa4146f4aca60ad3aec5",
  ])("recognizes Robinhood pools without treating the pool as a token: %s", (pairAddress) => {
    const url = new URL(`https://dexscreener.com/robinhood/${pairAddress}?maker=wallet`);
    expect(readDexscreenerPair(url)).toEqual({ chain: "robinhood", pairAddress });
    expect(dexscreenerAdapter.readTarget(document, url)).toBeNull();
  });
  it("accepts bytes32 pools on other EVM chains but rejects malformed pool IDs", () => {
    const poolId = `0x${"ab".repeat(32)}`;
    expect(readDexscreenerPair(new URL(`https://dexscreener.com/ethereum/${poolId}`)))
      .toEqual({ chain: "ethereum", pairAddress: poolId });
    for (const invalid of [poolId.slice(0, -1), `${poolId}0`, `0x${"gg".repeat(32)}`]) {
      expect(readDexscreenerPair(new URL(`https://dexscreener.com/robinhood/${invalid}`))).toBeNull();
    }
  });
  it("extracts a supported pair but never mistakes it for a mint", () => {
    const url = new URL(`https://dexscreener.com/solana/${pair}`);
    expect(readDexscreenerPair(url)).toEqual({ chain: "solana", pairAddress: pair });
    expect(dexscreenerAdapter.readTarget(document, url)).toBeNull();
  });
  it("rejects unrelated pages, wallets, unsupported chains, extra segments and other origins", () => {
    for (const href of ["https://dexscreener.com/wallets", `https://dexscreener.com/wallets/${pair}`,
      `https://dexscreener.com/sui/${pair}`, `https://dexscreener.com/solana/${pair}/wallets`,
      `https://example.com/solana/${pair}`, "https://dexscreener.com/solana/not-an-address"]) {
      expect(readDexscreenerPair(new URL(href))).toBeNull();
    }
  });
  it("normalizes BSC chain identity and rereads navigation without retaining the previous pool", () => {
    const evm = "0x0000000000000000000000000000000000000001";
    expect(readDexscreenerPair(new URL(`https://dexscreener.com/bsc/${evm}`))).toEqual({ chain: "bnb", pairAddress: evm });
    expect(readDexscreenerPair(new URL(`https://dexscreener.com/ethereum/${pair}`))).toBeNull();
    expect(readDexscreenerPair(new URL("https://dexscreener.com/"))).toBeNull();
  });
});
