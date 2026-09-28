import { beforeEach, describe, expect, it } from "vitest";
import { _resetClaimedTokens, claimToken, isTokenClaimed, releaseToken } from "../lib/claimed-tokens";

const ADDR = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

beforeEach(() => _resetClaimedTokens());

describe("claimed tokens", () => {
  it("claims case-insensitively so the lens skips the address it is told about", () => {
    claimToken(ADDR);
    expect(isTokenClaimed(ADDR.toUpperCase())).toBe(true);
  });

  it("gives a claim back when the address turns out to be a wallet, not a token", () => {
    claimToken(ADDR);
    releaseToken(ADDR.toLowerCase());
    // The wallet lens may now mark it, which is the whole point: a pasted wallet address is not
    // a contract and must not be answered as one.
    expect(isTokenClaimed(ADDR)).toBe(false);
  });

  it("ignores empty input on both sides", () => {
    claimToken(null);
    releaseToken(undefined);
    expect(isTokenClaimed(null)).toBe(false);
  });
});
