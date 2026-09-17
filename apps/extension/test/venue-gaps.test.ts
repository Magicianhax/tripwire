// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chainLabel, isNativeSymbol, readTokenSymbol } from "../lib/adapters/chains";
import { jumperAdapter } from "../lib/adapters/jumper";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { uniswapAdapter } from "../lib/adapters/uniswap";
import type { TargetGap } from "../lib/adapters/types";
import { gapHeadline, gapKey, guardHeadline } from "../entrypoints/venues.content/format";

/**
 * "Tripwire couldn't check this: no target on this page" was the answer to three different
 * questions, and wrong for all three. These are the replacements: a destination outside
 * coverage names the chain, a native coin says what it is, and a swap form that keeps its
 * tokens out of the URL is read off the page instead.
 */

const FIXTURES = join(process.cwd(), "test", "fixtures", "venues");
const WBTC_BASE = "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const DEGEN_BASE = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";

function load(venue: string): Document {
  document.body.innerHTML = readFileSync(join(FIXTURES, `${venue}.html`), "utf8");
  return document;
}

const gapOf = (adapter: typeof uniswapAdapter, doc: Document, href: string): TargetGap | null => {
  const url = new URL(href);
  return adapter.readTarget(doc, url) ? null : (adapter.readGap?.(doc, url) ?? null);
};

describe("jumper: a destination outside coverage", () => {
  const doc = () => load("jumper");

  it("names Bitcoin rather than reporting a failure", () => {
    const gap = gapOf(jumperAdapter, doc(), "https://jumper.xyz/?fromChain=1&toChain=20000000000001&toToken=bitcoin");
    expect(gap).toEqual({ kind: "unsupported-chain", label: "Bitcoin" });
    expect(gapHeadline(gap)).toBe("Tripwire doesn't cover Bitcoin");
  });

  it("names an unsupported EVM chain by its own name", () => {
    expect(gapHeadline(gapOf(jumperAdapter, doc(), `https://jumper.xyz/?toChain=59144&toToken=${WBTC_BASE}`))).toBe("Tripwire doesn't cover Linea");
    expect(gapHeadline(gapOf(jumperAdapter, doc(), `https://jumper.xyz/?toChain=324&toToken=${WBTC_BASE}`))).toBe("Tripwire doesn't cover zkSync Era");
  });

  it("falls back to the chain id when it has no name, rather than to nothing", () => {
    expect(gapHeadline(gapOf(jumperAdapter, doc(), `https://jumper.xyz/?toChain=9999999&toToken=${WBTC_BASE}`))).toBe("Tripwire doesn't cover chain 9999999");
  });

  it("leaves a covered chain alone: the target is checked as before", () => {
    const url = new URL(`https://jumper.xyz/?fromChain=8453&toChain=8453&toToken=${WBTC_BASE}`);
    expect(jumperAdapter.readTarget(doc(), url)).toEqual({ kind: "spot", chain: "base", tokenAddress: WBTC_BASE });
    expect(jumperAdapter.readGap?.(doc(), url)).toBeNull();
  });

  it("calls native ETH what it is", () => {
    const gap = gapOf(jumperAdapter, doc(), "https://jumper.xyz/?toChain=8453&toToken=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    expect(gap).toEqual({ kind: "native-asset", symbol: "ETH" });
    expect(gapHeadline(gap)).toBe("ETH is the chain's native asset — Tripwire checks tokens");
  });

  it("reads the Receive selector when the URL names no token", () => {
    // The fixture's widget has DDEGEN on the Receive side and nothing on the From side.
    expect(gapOf(jumperAdapter, doc(), "https://jumper.xyz/?toChain=8453")).toEqual({ kind: "symbol", symbol: "DDEGEN", chainHint: "base" });
  });
});

describe("uniswap: the swap form, when the URL says nothing", () => {
  const doc = () => load("uniswap");

  it("still prefers the URL when it has one", () => {
    const url = new URL(`https://app.uniswap.org/swap?chain=base&outputCurrency=${DEGEN_BASE}`);
    expect(uniswapAdapter.readTarget(doc(), url)).toEqual({ kind: "spot", chain: "base", tokenAddress: DEGEN_BASE });
    expect(uniswapAdapter.readGap?.(doc(), url)).toBeNull();
  });

  it("reads the Buy token off the form when the URL has no params", () => {
    // The fixture's Buy selector reads DEGEN; the Sell side reads "Select token" and is ignored.
    expect(gapOf(uniswapAdapter, doc(), "https://app.uniswap.org/swap")).toEqual({ kind: "symbol", symbol: "DEGEN" });
  });

  it("takes the chain from the URL when it is there, as a hint for the lookup", () => {
    expect(gapOf(uniswapAdapter, doc(), "https://app.uniswap.org/swap?chain=base")).toEqual({ kind: "symbol", symbol: "DEGEN", chainHint: "base" });
  });

  it("never reads the Sell token", () => {
    const d = doc();
    d.querySelector('[data-testid="choose-input-token"]')!.textContent = "USDC";
    d.querySelector('[data-testid="choose-output-token"]')!.textContent = "Select token";
    expect(gapOf(uniswapAdapter, d, "https://app.uniswap.org/swap")).toBeNull();
    expect(gapHeadline(null)).toBe("Tripwire couldn't check this: no target on this page");
  });

  it("calls native ETH what it is rather than a missing target", () => {
    const d = doc();
    d.querySelector('[data-testid="choose-output-token"]')!.textContent = "ETH";
    const gap = gapOf(uniswapAdapter, d, "https://app.uniswap.org/swap?chain=base");
    expect(gap).toEqual({ kind: "native-asset", symbol: "ETH" });
    expect(gapHeadline(gap)).toBe("ETH is the chain's native asset — Tripwire checks tokens");
  });

  it("treats WETH as the token it is, not as the native coin", () => {
    const d = doc();
    d.querySelector('[data-testid="choose-output-token"]')!.textContent = "WETH";
    expect(gapOf(uniswapAdapter, d, "https://app.uniswap.org/swap?chain=base")).toEqual({ kind: "symbol", symbol: "WETH", chainHint: "base" });
  });

  it("names a chain it does not cover", () => {
    expect(gapHeadline(gapOf(uniswapAdapter, doc(), "https://app.uniswap.org/swap?chain=zksync"))).toBe("Tripwire doesn't cover zksync");
  });
});

describe("jupiter: a symbol where a mint belongs", () => {
  const doc = () => load("jupiter");

  it("checks a real mint as before", () => {
    expect(jupiterAdapter.readTarget(doc(), new URL(`https://jup.ag/swap/SOL-${WIF}`))).toEqual({ kind: "spot", chain: "solana", tokenAddress: WIF });
  });

  it("calls native SOL what it is instead of sending it to the backend", () => {
    const url = new URL("https://jup.ag/swap/USDC-SOL");
    expect(jupiterAdapter.readTarget(doc(), url)).toBeNull();
    const gap = jupiterAdapter.readGap?.(doc(), url);
    expect(gap).toEqual({ kind: "native-asset", symbol: "SOL" });
    expect(gapHeadline(gap)).toBe("SOL is the chain's native asset — Tripwire checks tokens");
  });

  it("asks for another bare symbol to be resolved rather than guarding the word", () => {
    expect(jupiterAdapter.readGap?.(doc(), new URL("https://jup.ag/swap/SOL-JUP"))).toEqual({ kind: "symbol", symbol: "JUP", chainHint: "solana" });
  });
});

describe("a covered chain that Nansen simply had nothing for", () => {
  it("keeps the named-endpoint reason from the backend, not a coverage line", () => {
    const headline = guardHeadline({
      verdict: "UNCHECKED",
      hits: [],
      headline: "Nansen flow data unavailable for this token on base",
    });
    expect(headline).toBe("Tripwire couldn't check this: Nansen flow data unavailable for this token on base");
  });
});

describe("helpers", () => {
  it("names the chains venues route to", () => {
    expect(chainLabel("20000000000001")).toBe("Bitcoin");
    expect(chainLabel("8453")).toBe("Base");
    expect(chainLabel("solana")).toBe("solana");
  });

  it("knows a chain's own coin, and its old spelling", () => {
    expect(isNativeSymbol("eth", "base")).toBe(true);
    expect(isNativeSymbol("MATIC", "polygon")).toBe(true);
    expect(isNativeSymbol("POL", "polygon")).toBe(true);
    expect(isNativeSymbol("ETH", "solana")).toBe(false);
    expect(isNativeSymbol("WETH", "base")).toBe(false);
  });

  it("ignores a token selector that has nothing selected", () => {
    const el = (text: string) => ({ textContent: text }) as Element;
    expect(readTokenSymbol(el("Select token"))).toBeNull();
    expect(readTokenSymbol(el(""))).toBeNull();
    expect(readTokenSymbol(el("USDC"))).toBe("USDC");
    expect(readTokenSymbol(el("usdc on Base"))).toBe("USDC");
  });

  it("tells two gaps apart, so the runner re-renders between them", () => {
    expect(gapKey({ kind: "native-asset", symbol: "ETH" })).not.toBe(gapKey({ kind: "unsupported-chain", label: "Bitcoin" }));
    expect(gapKey(null)).toBe("");
  });
});
