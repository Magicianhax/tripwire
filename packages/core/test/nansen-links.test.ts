import { describe, expect, it } from "vitest";
import { nansenChainSlug, nansenTargetUrl, nansenTokenUrl } from "../src/nansen-links";
import { CHAINS } from "../src/types";
import { CANDLE_INTERVAL, defaultViewTimeframe, MS_PER_TIMEFRAME, NETFLOW_TILE_TIMEFRAME, VERDICT_TIMEFRAME, VIEW_TIMEFRAMES } from "../src/timeframe";

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

describe("nansenTokenUrl", () => {
  it("points at Token God Mode with the chain and address as query params", () => {
    expect(nansenTokenUrl("solana", WIF)).toBe(`https://app.nansen.ai/token-god-mode?chain=solana&tokenAddress=${WIF}`);
  });

  it("builds a URL for every chain Tripwire supports", () => {
    for (const chain of CHAINS) {
      const url = nansenTokenUrl(chain, UNI);
      expect(url, chain).not.toBeNull();
      expect(new URL(url!).searchParams.get("chain"), chain).toBe(nansenChainSlug(chain));
    }
  });

  it("refuses a chain it cannot name, and an empty address", () => {
    expect(nansenTokenUrl("sui", WIF)).toBeNull();
    expect(nansenTokenUrl("solana", "")).toBeNull();
  });

  it("escapes an address rather than pasting it into the query string", () => {
    const url = new URL(nansenTokenUrl("solana", "a&chain=ethereum")!);
    expect(url.searchParams.get("chain")).toBe("solana");
    expect(url.searchParams.get("tokenAddress")).toBe("a&chain=ethereum");
  });
});

describe("nansenTargetUrl", () => {
  it("links a spot token", () => {
    expect(nansenTargetUrl({ kind: "spot", chain: "base", tokenAddress: UNI })).toContain("token-god-mode");
  });

  // Nansen publishes no documented deep-link for either surface; a guessed URL that 404s is
  // worse than no button, so the card omits it.
  it("omits perp and prediction markets", () => {
    expect(nansenTargetUrl({ kind: "perp", coin: "ETH", side: "long" })).toBeNull();
    expect(nansenTargetUrl({ kind: "prediction", slug: "will-x-happen" })).toBeNull();
  });
});

describe("view timeframes", () => {
  it("the verdict window is one of the offered windows, and every window has a candle interval", () => {
    expect(VIEW_TIMEFRAMES).toContain(VERDICT_TIMEFRAME);
    for (const tf of VIEW_TIMEFRAMES) {
      expect(CANDLE_INTERVAL[tf], tf).toBeTruthy();
      expect(MS_PER_TIMEFRAME[tf], tf).toBeGreaterThan(0);
    }
  });

  it("windows are listed shortest first", () => {
    const spans = VIEW_TIMEFRAMES.map((tf) => MS_PER_TIMEFRAME[tf]);
    expect([...spans].sort((a, b) => a - b)).toEqual(spans);
  });

  it("defaults to the smallest window that covers the post's age", () => {
    const min = 60_000;
    expect(defaultViewTimeframe(4 * min)).toBe("5m");
    expect(defaultViewTimeframe(6 * min)).toBe("1h");
    expect(defaultViewTimeframe(3 * 3_600_000)).toBe("6h");
    expect(defaultViewTimeframe(20 * 3_600_000)).toBe("1d");
    expect(defaultViewTimeframe(30 * 24 * 3_600_000)).toBe("7d");
  });

  it("falls back to the verdict window when there is no post to age", () => {
    expect(defaultViewTimeframe(null)).toBe(VERDICT_TIMEFRAME);
    expect(defaultViewTimeframe(undefined)).toBe(VERDICT_TIMEFRAME);
    expect(defaultViewTimeframe(Number.NaN)).toBe(VERDICT_TIMEFRAME);
  });

  it("the 30d netflow tile maps to 7d, because flows go back no further", () => {
    expect(NETFLOW_TILE_TIMEFRAME.d30).toBe("7d");
    expect(NETFLOW_TILE_TIMEFRAME.d7).toBe("7d");
    expect(NETFLOW_TILE_TIMEFRAME.h24).toBe("1d");
    expect(NETFLOW_TILE_TIMEFRAME.h1).toBe("1h");
  });
});
