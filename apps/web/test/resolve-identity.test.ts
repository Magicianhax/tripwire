import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCashtag } from "../lib/intel/resolve";
import { nansen } from "../lib/nansen/endpoints";

vi.mock("../lib/nansen/endpoints", () => ({ nansen: { searchGeneral: vi.fn() } }));
const robinhood = { symbol: "SPCX", name: "SpaceX", chain: "robinhood", address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", volume_24h: 1, market_cap: 1 };
const solana = { ...robinhood, chain: "solana", address: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb", volume_24h: 999999 };

describe("token identity resolution", () => {
  beforeEach(() => vi.resetAllMocks());
  function results(tokens: typeof robinhood[]) {
    vi.mocked(nansen.searchGeneral).mockResolvedValue({ data: { tokens } } as never);
  }
  it("keeps Robinhood SPCX on Robinhood even when Solana has higher volume", async () => {
    results([solana, robinhood]);
    const result = await resolveCashtag("SPCX", "robinhood");
    expect(result.best?.tokenAddress).toBe(robinhood.address);
    expect(result.candidates.map((t) => t.chain)).toEqual(["robinhood"]);
  });
  it("returns no match rather than changing chains", async () => {
    results([solana]);
    expect(await resolveCashtag("SPCX", "robinhood")).toEqual({ best: null, candidates: [] });
  });
  it("does not select among multiple contracts with the same ticker on the chosen chain", async () => {
    results([robinhood, { ...robinhood, address: "0x1111111111111111111111111111111111111111" }]);
    const result = await resolveCashtag("SPCX", "robinhood");
    expect(result.best).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });
  it("still ranks unscoped cashtags for an explicit market browser", async () => {
    results([robinhood, solana]);
    expect((await resolveCashtag("SPCX")).best?.chain).toBe("solana");
  });
});
