import { describe, expect, it } from "vitest";
import { extractTokens, isEvmAddress, isSolanaAddress } from "../src/addresses";
import { pickFlowTimeframe } from "../src/timeframe";

const EVM = "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9";
const SOL = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

describe("extractTokens", () => {
  it("finds cashtags, dedupes and uppercases", () => {
    const r = extractTokens("ape $WIF and $wif then $Bonk");
    expect(r.cashtags).toEqual(["WIF", "BONK"]);
  });

  it("ignores dollar amounts", () => {
    expect(extractTokens("up $100 today, $5k, $2.5M").cashtags).toEqual([]);
  });

  it("finds evm and solana addresses", () => {
    const r = extractTokens(`ca: ${EVM} and ${SOL}`);
    expect(r.addresses).toEqual([
      { chain: "evm", address: EVM },
      { chain: "solana", address: SOL },
    ]);
  });

  it("does not treat urls or short words as solana addresses", () => {
    expect(extractTokens("see https://x.com/status/1234567890123456789").addresses).toEqual([]);
  });
});

describe("address validators", () => {
  it("validates", () => {
    expect(isEvmAddress(EVM)).toBe(true);
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isSolanaAddress(SOL)).toBe(true);
    expect(isSolanaAddress("0OIl" + SOL.slice(4))).toBe(false);
  });
});

describe("pickFlowTimeframe", () => {
  const m = 60_000, h = 60 * m, d = 24 * h;
  it.each([
    [3 * m, "5m"],
    [50 * m, "1h"],
    [5 * h, "6h"],
    [11 * h, "12h"],
    [20 * h, "1d"],
    [3 * d, "7d"],
    [30 * d, "7d"],
  ] as const)("%d ms -> %s", (age, tf) => {
    expect(pickFlowTimeframe(age)).toBe(tf);
  });
});
