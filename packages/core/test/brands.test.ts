import { describe, expect, it } from "vitest";
import { CHAIN_LOGOS, chainLogo, NANSEN_LOGO, TRIPWIRE_LOGO, VENUE_LOGOS, venueLogo, VENUE_IDS } from "../src/brands";
import { CHAINS } from "../src/types";

describe("brand logos", () => {
  it("uses only verified bundled chain marks and falls back for newly supported chains", () => {
    for (const chain of Object.keys(CHAIN_LOGOS)) {
      expect(chainLogo(chain)?.file).toMatch(/^logos\/chain-[a-z]+\.svg$/);
      expect(CHAINS).toContain(chain);
    }
    expect(chainLogo("robinhood")).toBeNull();
  });

  it("has a bundled mark for every venue adapter id", () => {
    for (const id of VENUE_IDS) expect(venueLogo(id)?.file).toMatch(/^logos\/[a-z0-9]+\.(svg|png)$/);
    expect(Object.keys(VENUE_LOGOS).sort()).toEqual([...VENUE_IDS].sort());
  });

  it("returns null for unknown ids instead of guessing", () => {
    expect(venueLogo("sushiswap")).toBeNull();
    expect(chainLogo("tron")).toBeNull();
  });

  it("names the Nansen mark", () => {
    expect(NANSEN_LOGO).toEqual({ name: "Nansen", file: "logos/nansen.svg" });
  });

  it("keeps the product identity distinct from the intelligence provider", () => {
    expect(TRIPWIRE_LOGO).toEqual({ name: "Tripwire", file: "logos/tripwire.png" });
    expect(TRIPWIRE_LOGO.file).not.toBe(NANSEN_LOGO.file);
  });
});
