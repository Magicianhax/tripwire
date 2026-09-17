import { describe, expect, it } from "vitest";
import {
  AuthorBadgesRequestSchema,
  CURATED_WALLETS,
  curatedWalletsFor,
  isVenueWalletAddress,
  normalizeHandle,
  validateCuratedWallets,
  WalletLinkDeleteSchema,
  WalletLinkSchema,
  type CuratedWallet,
} from "../src";

const HL = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

const valid: CuratedWallet = {
  handle: "someone",
  venue: "hyperliquid",
  address: HL,
  sourceUrl: "https://x.com/someone/status/1900000000000000001",
  verifiedOn: "2026-09-17",
};

describe("venue wallet addresses", () => {
  it("accepts 0x + 40 hex for Hyperliquid and Polymarket", () => {
    expect(isVenueWalletAddress("hyperliquid", HL)).toBe(true);
    expect(isVenueWalletAddress("polymarket", HL.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  it("rejects short, long, non-hex and Solana addresses", () => {
    for (const bad of ["0x7fdafde5", `${HL}00`, "0xZZdafde5cfb5465924316eced2d3715494c517d1", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", ""]) {
      expect(isVenueWalletAddress("hyperliquid", bad)).toBe(false);
      expect(isVenueWalletAddress("polymarket", bad)).toBe(false);
    }
  });
});

describe("normalizeHandle", () => {
  it("lowercases and strips a leading @", () => {
    expect(normalizeHandle("@VitalikButerin")).toBe("vitalikbuterin");
  });
});

describe("link schemas", () => {
  it("normalizes handle and address on a valid link", () => {
    const parsed = WalletLinkSchema.parse({ handle: "DegenAlpha", venue: "polymarket", address: HL.toUpperCase().replace("0X", "0x") });
    expect(parsed).toEqual({ handle: "degenalpha", venue: "polymarket", address: HL });
  });

  it("rejects bad handles, unknown venues and bad addresses", () => {
    expect(WalletLinkSchema.safeParse({ handle: "has space", venue: "hyperliquid", address: HL }).success).toBe(false);
    expect(WalletLinkSchema.safeParse({ handle: "a".repeat(16), venue: "hyperliquid", address: HL }).success).toBe(false);
    expect(WalletLinkSchema.safeParse({ handle: "ok", venue: "binance", address: HL }).success).toBe(false);
    expect(WalletLinkSchema.safeParse({ handle: "ok", venue: "hyperliquid", address: "0x123" }).success).toBe(false);
    expect(WalletLinkDeleteSchema.safeParse({ handle: "ok", venue: "polymarket" }).success).toBe(true);
    expect(WalletLinkDeleteSchema.safeParse({ handle: "ok" }).success).toBe(false);
  });

  it("author-badges request takes the person-intel handle rule and a display name", () => {
    expect(AuthorBadgesRequestSchema.safeParse({ handle: "VitalikButerin", displayName: "vitalik.eth" }).success).toBe(true);
    expect(AuthorBadgesRequestSchema.safeParse({ handle: "bad/handle", displayName: "x" }).success).toBe(false);
    expect(AuthorBadgesRequestSchema.safeParse({ handle: "ok", displayName: "" }).success).toBe(false);
  });
});

describe("curated wallets", () => {
  it("the shipped list passes validation (every entry sourced, no duplicates)", () => {
    expect(validateCuratedWallets(CURATED_WALLETS)).toEqual([]);
  });

  it("flags entries without an https source, a bad address, a bad date, or duplicates", () => {
    expect(validateCuratedWallets([valid])).toEqual([]);
    expect(validateCuratedWallets([{ ...valid, sourceUrl: "http://x.com/someone" }])).toHaveLength(1);
    expect(validateCuratedWallets([{ ...valid, sourceUrl: "" }])).toHaveLength(1);
    expect(validateCuratedWallets([{ ...valid, address: "0x1234" }])).toHaveLength(1);
    expect(validateCuratedWallets([{ ...valid, verifiedOn: "yesterday" }])).toHaveLength(1);
    expect(validateCuratedWallets([{ ...valid, handle: "Someone" }])).toHaveLength(1);
    expect(validateCuratedWallets([valid, { ...valid }])).toHaveLength(1);
  });

  it("looks entries up by exact normalized handle only", () => {
    const list = [valid];
    expect(curatedWalletsFor("@SomeOne", list)).toEqual([valid]);
    expect(curatedWalletsFor("someone_", list)).toEqual([]);
    expect(curatedWalletsFor("some", list)).toEqual([]);
  });
});
