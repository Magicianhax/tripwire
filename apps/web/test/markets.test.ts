import { afterEach, describe, expect, it, vi } from "vitest";
import { nansen } from "../lib/nansen/endpoints";
import { marketCatalog, marketRows, MarketsRequestSchema } from "../lib/intel/markets";
import { POST } from "../app/api/markets/route";

const mint = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const token = { name: "Zcash", symbol: "ZEC", chain: "solana", address: mint, price: 1470, volume_24h: 24e6, market_cap: 151e6 };
afterEach(() => vi.restoreAllMocks());

describe("market catalog", () => {
  it("accepts numeric ticker prefixes without rewriting identity", () => {
    expect(MarketsRequestSchema.parse({symbol:"1INCH"})).toEqual({symbol:"1INCH"});
    expect(MarketsRequestSchema.parse({symbol:"1000PEPE"})).toEqual({symbol:"1000PEPE"});
  });
  it("keeps exact and related spot/perp markets independently, including unsupported chains", () => {
    const rows = marketRows("ZEC", [token,
      { ...token, chain: "near", address: "zec.omft.near" },
      { ...token, chain: "hyperliquid", address: "ZEC", volume_24h: 550e6 },
      { ...token, symbol: "CBZEC", chain: "base", address: "0x0000000000000000000000000000000000000001" },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ kind: "perp", detailTarget: { kind: "perp", coin: "ZEC" }, priceUsd: 1470 });
    expect(rows.find((row) => row.chain === "near")?.nansenUrl).toContain("chain=near&tokenAddress=zec.omft.near");
    expect(rows.at(-1)).toMatchObject({ symbol: "CBZEC", match: "related" });
    expect(rows.find((row) => row.chain === "solana")?.detailTarget).toMatchObject({ chain: "solana", tokenAddress: mint });
  });
  it("does not turn a namespaced perp into a different coin and preserves its exact link", () => {
    expect(marketRows("SPCX", [{ ...token, symbol: "SPCX", chain: "hyperliquid", address: "xyz:SPCX" }])[0])
      .toMatchObject({ detailTarget: null, nansenUrl: "https://app.nansen.ai/token-god-mode?chain=hyperliquid&tokenAddress=xyz%3ASPCX&tab=transactions" });
  });
  it("deduplicates chain/address identities but keeps distinct chains and excludes malformed rows", () => {
    const rows = marketRows("ZEC", [token, token, { ...token, chain: "unlisted" },
      { ...token, chain: "../evil" }, { ...token, address: "<bad>" }, { ...token, price: Infinity }]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ chain: "unlisted", detailTarget: null });
  });
  it("uses only the free search request, preserving null metrics", async () => {
    const search = vi.spyOn(nansen, "searchGeneral").mockResolvedValue({ data: { tokens: [{ ...token, volume_24h: null, market_cap: null }], entities: [] }, cached: false, stale: false, storedAt: 0, creditsUsed: 0 });
    const result = await marketCatalog("zec");
    expect(search).toHaveBeenCalledWith("ZEC", "token", 25);
    expect(result.markets[0]).toMatchObject({ volume24hUsd: null, marketCapUsd: null });
    expect(result.errors).toEqual([]);
  });
  it("returns a safe retryable error without leaking upstream responses", async () => {
    vi.spyOn(nansen, "searchGeneral").mockRejectedValue(new Error("secret upstream body"));
    const result = await marketCatalog("ZEC");
    expect(result.markets).toEqual([]);
    expect(result.errors.join(" ")).not.toContain("secret");
    expect(result.errors).toHaveLength(1);
  });
  it("validates route input before searching and rejects foreign origins", async () => {
    const search = vi.spyOn(nansen, "searchGeneral");
    const request = (symbol: string, origin = "http://127.0.0.1:3000") => new Request("http://127.0.0.1:3000/api/markets", {
      method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ symbol }),
    });
    expect((await POST(request("<bad>"))).status).toBe(400);
    expect((await POST(request("ZEC", "https://evil.test"))).status).toBe(403);
    expect(search).not.toHaveBeenCalled();
  });
});
