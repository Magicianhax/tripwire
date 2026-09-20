import { describe, expect, it, vi } from "vitest";
import { createPairResolver, pairTarget, ResolvePairRequestSchema } from "../lib/intel/resolve-pair";

const pairAddress = "CJieB7FUMhEFMaEFjAxQJnkVXNMvaBm3DHHP8RTgBeG1";
const tokenAddress = "tipp4C4Jnpft26HC9VXNjUPidojZqxXf8nzKvrKf5BS";
const request = { chain: "solana" as const, pairAddress: pairAddress.toLowerCase() };
const pair = { chainId: "solana", pairAddress, baseToken: { address: tokenAddress, symbol: "TIPPED" } };

describe("Dexscreener exact pair resolution", () => {
  it.each([
    "0x714442e9a611f8561a7df108d6d925132937cfb8",
    "0x9a12a27fe4fc8fb943de50c93eae9d57c1cd22b1a642aa4146f4aca60ad3aec5",
  ])("resolves Robinhood CHUMP pool %s to the exact token on the same chain", async (pool) => {
    const address = "0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B";
    const candidate = { chainId: "robinhood", pairAddress: pool, baseToken: { address, symbol: "CHUMP" } };
    const input = { chain: "robinhood" as const, pairAddress: pool };
    const fetcher = vi.fn(async () => Response.json({ pairs: [candidate] }));
    expect(await createPairResolver(fetcher)(input)).toEqual({ kind: "spot", chain: "robinhood", tokenAddress: address, symbol: "CHUMP" });
    expect(fetcher).toHaveBeenCalledWith(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${pool}`, expect.any(Object));
    expect(pairTarget({ pairs: [{ ...candidate, chainId: "ethereum" }] }, input)).toBeNull();
    expect(pairTarget({ pairs: [{ ...candidate, baseToken: { address: `0x${"ab".repeat(32)}` } }] }, input)).toBeNull();
  });
  it("rejects malformed bytes32 pool identifiers before fetching", () => {
    for (const value of [`0x${"ab".repeat(31)}`, `0x${"ab".repeat(33)}`, `0x${"gg".repeat(32)}`]) {
      expect(ResolvePairRequestSchema.safeParse({ chain: "robinhood", pairAddress: value }).success).toBe(false);
    }
  });
  it("resolves canonical lowercase Solana URLs without altering the mint's case", () => {
    expect(pairTarget({ pairs: [pair] }, request)).toEqual({ kind: "spot", chain: "solana", tokenAddress, symbol: "TIPPED" });
  });
  it("never treats the pool, unrelated pair, wrong chain, or malformed mint as the target", () => {
    for (const candidate of [
      { ...pair, pairAddress: tokenAddress },
      { ...pair, chainId: "ethereum" },
      { ...pair, baseToken: { address: "wrong" } },
    ]) expect(pairTarget({ pairs: [candidate] }, request)).toBeNull();
    expect(pairTarget({ pairs: null }, request)).toBeNull();
    expect(pairTarget({ pairs: [pair, pair] }, request)).toBeNull();
  });
  it("maps BNB to Dexscreener's bsc chain and validates EVM addresses", () => {
    const evm = "0x0000000000000000000000000000000000000001";
    expect(pairTarget({ pairs: [{ chainId: "bsc", pairAddress: evm, baseToken: { address: evm } }] },
      { chain: "bnb", pairAddress: evm })).toEqual({ kind: "spot", chain: "bnb", tokenAddress: evm });
    expect(ResolvePairRequestSchema.safeParse({ chain: "ethereum", pairAddress }).success).toBe(false);
    expect(ResolvePairRequestSchema.safeParse({ chain: "https://evil.test", pairAddress }).success).toBe(false);
    expect(ResolvePairRequestSchema.safeParse({ chain: "solana", pairAddress: "../".repeat(12) }).success).toBe(false);
  });
  it("deduplicates and caches exact pair lookups and uses only the fixed API origin", async () => {
    const fetcher = vi.fn(async () => Response.json({ pairs: [pair] }));
    const resolve = createPairResolver(fetcher);
    const results = await Promise.all([resolve(request), resolve(request)]);
    expect(results[0]?.tokenAddress).toBe(tokenAddress);
    expect(results[1]).toEqual(results[0]);
    await resolve(request);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`https://api.dexscreener.com/latest/dex/pairs/solana/${request.pairAddress}`,
      expect.objectContaining({ signal: expect.any(AbortSignal), redirect: "error" }));
  });
  it("retries failures rather than permanently caching a missing token", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ pairs: [pair] }));
    const resolve = createPairResolver(fetcher);
    await expect(resolve(request)).rejects.toThrow("503");
    expect((await resolve(request))?.tokenAddress).toBe(tokenAddress);
  });
});
