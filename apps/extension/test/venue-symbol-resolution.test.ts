// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chainlessGap, resolvedFrom } from "../entrypoints/venues.content/resolve-target";
import { gapHeadline } from "../entrypoints/venues.content/format";

/**
 * Round 1.4.9, the second half. Once the Buy badge gives us a chain, the symbol goes to
 * `/api/resolve`. Three things come back and all three used to print the same wrong sentence.
 */

const GIZA_BASE = "0x590830dfdf9a3f68afcdde2694773debdf267774";
const ref = (chain: string, tokenAddress: string) => ({ chain, tokenAddress, symbol: "GIZA", name: "Giza", volume24h: 1, marketCap: 1 }) as never;

describe("a symbol gap the adapter could not put on a chain", () => {
  it("states the limit instead of instructing the user to pick a network", () => {
    const gap = chainlessGap({ kind: "symbol", symbol: "GIZA" });
    expect(gap).toEqual({ kind: "unknown-chain", symbol: "GIZA" });
    expect(gapHeadline(gap)).toBe("Tripwire can't tell which network GIZA is on");
  });

  it("leaves a gap that already has a chain alone", () => {
    const gap = { kind: "symbol", symbol: "GIZA", chainHint: "base" } as const;
    expect(chainlessGap(gap)).toBe(gap);
  });
});

describe("what the backend said about the symbol on that chain", () => {
  it("guards the one token Nansen has, on the chain the page named", () => {
    // Live /api/resolve, 2026-09-20: {symbol:"GIZA", chainHint:"base"} -> exactly this contract,
    // which is the one the Uniswap picker offered under the Base badge.
    expect(resolvedFrom("GIZA", "base", { ok: true, data: { best: ref("base", GIZA_BASE), candidates: [ref("base", GIZA_BASE)] } })).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: GIZA_BASE,
      symbol: "GIZA",
    });
  });

  it("names the ambiguity rather than claiming Nansen has never heard of the token", () => {
    // The backend withholds `best` when a chain hint matches more than one contract: volume
    // does not establish which one the user selected. "Couldn't find GIZA" would be false.
    const out = resolvedFrom("GIZA", "base", { ok: true, data: { best: null, candidates: [ref("base", GIZA_BASE), ref("base", `0x${"a".repeat(40)}`)] } });
    expect(out).toEqual({ kind: "ambiguous-symbol", symbol: "GIZA", chain: "base" });
    expect(gapHeadline(out as never)).toBe("More than one GIZA on Base — Tripwire can't tell which");
  });

  it("says Nansen has nothing only when Nansen really returned nothing", () => {
    expect(resolvedFrom("GIZA", "base", { ok: true, data: { best: null, candidates: [] } })).toBeNull();
  });

  it("never substitutes another chain's token for the one the page named", () => {
    expect(resolvedFrom("GIZA", "base", { ok: true, data: { best: ref("ethereum", GIZA_BASE), candidates: [ref("ethereum", GIZA_BASE)] } })).toBeNull();
  });

  it("keeps the page's answer when the backend is unreachable", () => {
    expect(resolvedFrom("GIZA", "base", { ok: false, status: 0, error: "offline" })).toBeNull();
  });
});
