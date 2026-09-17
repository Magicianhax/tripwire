import { describe, expect, it } from "vitest";
import { cleanLabel } from "../src/labels";

describe("cleanLabel", () => {
  it("strips emoji and returns the kind the label names", () => {
    expect(cleanLabel("🤓 Smart HL Perps Trader [0x25554a]")).toEqual({ text: "Smart HL Perps Trader [0x25554a]", kind: "smart-trader" });
    expect(cleanLabel("🐳 Whale [8ZgAmj7f]")).toEqual({ text: "Whale [8ZgAmj7f]", kind: "whale" });
    expect(cleanLabel("🏦 Selini Capital [0xaa7a21]")).toEqual({ text: "Selini Capital [0xaa7a21]", kind: "fund" });
  });

  it("removes ZWJ sequences, skin tones, variation selectors, flags and zero-width spaces", () => {
    expect(cleanLabel("👨‍💻 Dev Wallet").text).toBe("Dev Wallet");
    expect(cleanLabel("👍🏽 Good ☀️ day").text).toBe("Good day");
    expect(cleanLabel("🇺🇸 US Fund").text).toBe("US Fund");
    expect(cleanLabel("​​Wintermute: SOL Millionaire [FkaLnX17]").text).toBe("Wintermute: SOL Millionaire [FkaLnX17]");
  });

  it("classifies by keyword when there is no emoji", () => {
    expect(cleanLabel("Smart Trader [abc]").kind).toBe("smart-trader");
    expect(cleanLabel("Smart Money").kind).toBe("smart-trader");
    expect(cleanLabel("Fasanara Capital [0x7fdafd]").kind).toBe("fund");
    expect(cleanLabel("Paradigm Fund").kind).toBe("fund");
    expect(cleanLabel("CASHCAT Whale [9nXDunV8]").kind).toBe("whale");
    expect(cleanLabel("High Balance [GJvewfRj]").kind).toBe("whale");
    expect(cleanLabel("Public Figure: Ansem").kind).toBe("public-figure");
    expect(cleanLabel("Binance 14").kind).toBe("exchange");
    expect(cleanLabel("Coinbase: Hot Wallet").kind).toBe("exchange");
    expect(cleanLabel("MEV Bot [0x1]").kind).toBe("bot");
    expect(cleanLabel("Stonk: Rewards Distributor [5KXDF6Qn]").kind).toBe("other");
    expect(cleanLabel("[G8Bsxkoi]").kind).toBe("other");
  });

  it("classifies by Nansen's emoji when the words don't say", () => {
    expect(cleanLabel("🤖 0xabc").kind).toBe("bot");
    expect(cleanLabel("🐋 Big one").kind).toBe("whale");
    expect(cleanLabel("🏛️ Kraken-ish").kind).toBe("exchange");
  });

  it("never returns empty text for an emoji-only or blank label", () => {
    expect(cleanLabel("🤓")).toEqual({ text: "", kind: "smart-trader" });
    expect(cleanLabel("   ")).toEqual({ text: "", kind: "other" });
  });

  it("collapses the whitespace left behind", () => {
    expect(cleanLabel("  Big  🐳  Whale  ").text).toBe("Big Whale");
  });
});
