import { describe, expect, it } from "vitest";
import { CHAIN_LOGOS, chainLogo, NANSEN_LOGO, VENUE_LOGOS, venueLogo, VENUE_IDS } from "../src/brands";
import { CHAINS } from "../src/types";

describe("brand logos", () => {
  it("has a bundled mark for every chain", () => {
    for (const chain of CHAINS) {
      expect(chainLogo(chain)?.file).toMatch(/^logos\/chain-[a-z]+\.svg$/);
    }
    expect(Object.keys(CHAIN_LOGOS).sort()).toEqual([...CHAINS].sort());
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
});
