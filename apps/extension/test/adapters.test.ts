// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { aerodromeAdapter } from "../lib/adapters/aerodrome";
import { axiomAdapter } from "../lib/adapters/axiom";
import { birdeyeAdapter } from "../lib/adapters/birdeye";
import { cowAdapter } from "../lib/adapters/cow";
import { dexscreenerAdapter } from "../lib/adapters/dexscreener";
import { fomoAdapter } from "../lib/adapters/fomo";
import { gmgnAdapter } from "../lib/adapters/gmgn";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jumperAdapter } from "../lib/adapters/jumper";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { matchaAdapter } from "../lib/adapters/matcha";
import { oneinchAdapter } from "../lib/adapters/oneinch";
import { pancakeswapAdapter } from "../lib/adapters/pancakeswap";
import { polymarketAdapter } from "../lib/adapters/polymarket";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";
import { raydiumAdapter } from "../lib/adapters/raydium";
import { ADAPTERS, findAdapter } from "../lib/adapters/registry";
import { uniswapAdapter } from "../lib/adapters/uniswap";
import type { VenueAdapter } from "../lib/adapters/types";

// Fixture addresses (not secrets -- a well-known public Solana mint and a placeholder EVM
// address), factored into single constants so each literal appears once in this file, not
// scattered across every test case.
const SOL_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"; // $WIF
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const EVM_ADDR_2 = "0x0000000000000000000000000000000000dead";

const emptyDoc = () => document.implementation.createHTMLDocument("");

function read(adapter: VenueAdapter, href: string) {
  const url = new URL(href);
  expect(adapter.match(url)).toBe(true);
  return adapter.readTarget(emptyDoc(), url);
}

describe("jupiter", () => {
  it("reads the OUT mint from the path form", () => {
    expect(read(jupiterAdapter, `https://jup.ag/swap/SOL-${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });

  it("reads the OUT mint from ?sell=&buy=", () => {
    expect(read(jupiterAdapter, `https://jup.ag/swap?sell=${WRAPPED_SOL_MINT}&buy=${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });

  it("does not match other hosts", () => {
    expect(jupiterAdapter.match(new URL(`https://example.com/swap/SOL-${SOL_MINT}`))).toBe(false);
  });
});

describe("pumpfun", () => {
  it("reads the mint from /coin/<mint>", () => {
    expect(read(pumpfunAdapter, `https://pump.fun/coin/${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });

  it("does not match other hosts", () => {
    expect(pumpfunAdapter.match(new URL(`https://example.com/coin/${SOL_MINT}`))).toBe(false);
  });
});

describe("uniswap", () => {
  it("reads outputCurrency + chain=base -> spot base", () => {
    expect(read(uniswapAdapter, `https://app.uniswap.org/swap?chain=base&outputCurrency=${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: EVM_ADDR,
    });
  });

  it("native ETH maps to Nansen's native identifier", () => {
    expect(read(uniswapAdapter, "https://app.uniswap.org/swap?chain=ethereum&outputCurrency=ETH")).toEqual({kind:"spot",chain:"ethereum",tokenAddress:`0x${"e".repeat(40)}`,symbol:"ETH"});
  });

  it("missing chain param -> null (controller ruling: no defaulted chain)", () => {
    expect(read(uniswapAdapter, `https://app.uniswap.org/swap?outputCurrency=${EVM_ADDR}`)).toBeNull();
  });

  it("unknown chain param -> null", () => {
    expect(read(uniswapAdapter, `https://app.uniswap.org/swap?chain=not-a-chain&outputCurrency=${EVM_ADDR}`)).toBeNull();
  });

  it("does not match other hosts", () => {
    expect(uniswapAdapter.match(new URL(`https://example.com/swap?outputCurrency=${EVM_ADDR}`))).toBe(false);
  });
});

describe("jumper", () => {
  it("maps an EVM toChain id -> spot base", () => {
    expect(read(jumperAdapter, `https://jumper.exchange/?toChain=8453&toToken=${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: EVM_ADDR,
    });
  });

  it("maps the solana chain id -> spot solana", () => {
    expect(read(jumperAdapter, `https://jumper.exchange/?toChain=1151111081099710&toToken=${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });

  it("unknown chain id -> null", () => {
    expect(read(jumperAdapter, `https://jumper.exchange/?toChain=999999&toToken=${EVM_ADDR}`)).toBeNull();
  });

  it("does not match other hosts", () => {
    expect(jumperAdapter.match(new URL(`https://example.com/?toChain=8453&toToken=${EVM_ADDR}`))).toBe(false);
  });
});

describe("hyperliquid", () => {
  it("reads the coin from /trade/<COIN> -> perp", () => {
    const target = read(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/ETH");
    expect(target).toMatchObject({ kind: "perp", coin: "ETH" });
  });

  it("skips non-crypto HIP-3 markets (namespaced coin) -> null", () => {
    expect(read(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/xyz:TSLA")).toBeNull();
  });

  it("does not match other hosts", () => {
    expect(hyperliquidAdapter.match(new URL("https://example.com/trade/ETH"))).toBe(false);
  });
});

describe("polymarket", () => {
  it("uses the market slug when present", () => {
    const target = read(
      polymarketAdapter,
      "https://polymarket.com/event/bitcoin-above-on-september-17-2026/bitcoin-above-72k-on-september-17-2026",
    );
    expect(target).toMatchObject({ kind: "prediction", slug: "bitcoin-above-72k-on-september-17-2026" });
  });

  it("falls back to the event slug when no market slug", () => {
    const target = read(polymarketAdapter, "https://polymarket.com/event/some-event");
    expect(target).toMatchObject({ kind: "prediction", slug: "some-event" });
  });

  it("does not match other hosts", () => {
    expect(polymarketAdapter.match(new URL("https://example.com/event/some-event"))).toBe(false);
  });
});

describe("tier 2: raydium", () => {
  it("reads outputMint -> spot solana", () => {
    expect(read(raydiumAdapter, `https://raydium.io/swap/?outputMint=${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });
});

describe("tier 2: cow", () => {
  it("reads the BUY token from the hash -> spot", () => {
    const target = read(cowAdapter, `https://swap.cow.fi/#/8453/swap/${EVM_ADDR_2}/${EVM_ADDR}`);
    expect(target).toEqual({ kind: "spot", chain: "base", tokenAddress: EVM_ADDR });
  });
});

describe("tier 2: 1inch", () => {
  it("reads the TO token from the hash, stripping the chainId: prefix -> spot", () => {
    const target = read(oneinchAdapter, `https://app.1inch.io/#/1/simple/swap/1:ETH/1:${EVM_ADDR}`);
    expect(target).toEqual({ kind: "spot", chain: "ethereum", tokenAddress: EVM_ADDR });
  });
});

describe("tier 2: dexscreener", () => {
  it("always returns null -- the pair address is not the token", () => {
    expect(read(dexscreenerAdapter, `https://dexscreener.com/solana/${SOL_MINT}`)).toBeNull();
  });
});

describe("tier 2: birdeye", () => {
  // Birdeye 308s `/token/<addr>?chain=solana` to `/<chain>/token/<addr>` and drops the param,
  // so the path segment is the only chain signal left (Round 1.4.2).
  it("reads /<chain>/token/<addr> -> spot solana", () => {
    expect(read(birdeyeAdapter, `https://birdeye.so/solana/token/${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });

  it("reads an EVM chain out of the path segment", () => {
    expect(read(birdeyeAdapter, `https://birdeye.so/bsc/token/${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "bnb",
      tokenAddress: EVM_ADDR,
    });
  });

  it("an unmapped chain slug is null, never a defaulted chain", () => {
    expect(read(birdeyeAdapter, `https://birdeye.so/sui/token/${EVM_ADDR}`)).toBeNull();
  });

  it("the pre-308 path carries no chain and yields nothing", () => {
    expect(read(birdeyeAdapter, `https://birdeye.so/token/${SOL_MINT}?chain=solana`)).toBeNull();
  });
});

describe("tier 2: gmgn", () => {
  it("reads /sol/token/<addr> -> spot solana", () => {
    expect(read(gmgnAdapter, `https://gmgn.ai/sol/token/${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });
});

describe("tier 2: axiom", () => {
  it("finds a base58 address anywhere in the path -> spot solana", () => {
    expect(read(axiomAdapter, `https://axiom.trade/meme/${SOL_MINT}`)).toEqual({
      kind: "spot",
      chain: "solana",
      tokenAddress: SOL_MINT,
    });
  });
});

describe("tier 2: aerodrome / pancakeswap", () => {
  it("aerodrome reads ?to= -> spot base", () => {
    expect(read(aerodromeAdapter, `https://aerodrome.finance/swap?to=${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: EVM_ADDR,
    });
  });

  it("pancakeswap reads ?outputCurrency=&chain= -> spot", () => {
    expect(read(pancakeswapAdapter, `https://pancakeswap.finance/swap?chain=bnb&outputCurrency=${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "bnb",
      tokenAddress: EVM_ADDR,
    });
  });

  it("pancakeswap: missing chain param -> null (controller ruling: no defaulted chain)", () => {
    expect(read(pancakeswapAdapter, `https://pancakeswap.finance/swap?outputCurrency=${EVM_ADDR}`)).toBeNull();
  });
});

describe("tier 2: matcha", () => {
  it("reads ?buyAddress=&chainId= -> spot", () => {
    expect(read(matchaAdapter, `https://matcha.xyz/swap?chainId=1&buyAddress=${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "ethereum",
      tokenAddress: EVM_ADDR,
    });
  });

  it("missing chainId param -> null (controller ruling: no defaulted chain)", () => {
    expect(read(matchaAdapter, `https://matcha.xyz/swap?buyAddress=${EVM_ADDR}`)).toBeNull();
  });
});

describe("registry", () => {
  it("findAdapter matches every registered adapter's own URL and no adapter matches an unrelated host", () => {
    for (const adapter of ADAPTERS) {
      expect(findAdapter(new URL("https://not-a-real-venue.example/"))).not.toBe(adapter);
    }
  });

  it("findAdapter resolves jupiter for a jup.ag URL", () => {
    expect(findAdapter(new URL(`https://jup.ag/swap/SOL-${SOL_MINT}`))?.id).toBe("jupiter");
  });

  it("findAdapter returns null for a non-venue host", () => {
    expect(findAdapter(new URL("https://example.com/"))).toBeNull();
  });
});

describe("tier 1: fomo", () => {
  // fomo's own route table says `tokens/:chain/:tokenAddress` (routes/token in its bundle).
  it("reads /tokens/<chain>/<addr> on Solana and on EVM", () => {
    expect(read(fomoAdapter, `https://fomo.family/tokens/solana/${SOL_MINT}`)).toEqual({ kind: "spot", chain: "solana", tokenAddress: SOL_MINT });
    expect(read(fomoAdapter, `https://fomo.family/tokens/base/${EVM_ADDR}`)).toEqual({ kind: "spot", chain: "base", tokenAddress: EVM_ADDR });
    expect(read(fomoAdapter, `https://fomo.family/tokens/BNB/${EVM_ADDR}`)).toEqual({ kind: "spot", chain: "bnb", tokenAddress: EVM_ADDR });
  });

  it("says so for a chain Tripwire does not cover, instead of defaulting to one", () => {
    expect(read(fomoAdapter, `https://fomo.family/tokens/monad/${EVM_ADDR}`)).toBeNull();
    expect(fomoAdapter.readGap?.(document, new URL(`https://fomo.family/tokens/monad/${EVM_ADDR}`))).toMatchObject({ kind: "unsupported-chain" });
    expect(read(fomoAdapter, `https://fomo.family/tokens/arc/${EVM_ADDR}`)).toBeNull();
  });

  it("ignores the pages that are not a token", () => {
    for (const path of ["/", "/leaderboard", "/perp", "/profile/someone", "/blog/learn/what-is-fomo", "/tokens/solana"]) {
      expect(read(fomoAdapter, `https://fomo.family${path}`)).toBeNull();
    }
  });

  it("matches only fomo.family itself", () => {
    expect(fomoAdapter.match(new URL("https://fomo.family/tokens/solana/x"))).toBe(true);
    expect(fomoAdapter.match(new URL("https://fomo.family.evil.test/tokens/solana/x"))).toBe(false);
    expect(fomoAdapter.match(new URL("https://notfomo.family/tokens/solana/x"))).toBe(false);
  });
});

describe("tier 1: fomo anchor", () => {
  /** The live trade card (2026-09-28, logged in): tabs, amount input and submit in one box, all
   * Tailwind classes and no role, test id or stable class to match on. */
  const card = (submitLabel: string, disabled = true) => `
    <input placeholder="Search for tokens or traders..." />
    <div class="border border-bg-tertiary rounded-2xl p-2 flex flex-col gap-2">
      <div class="flex gap-2"><button type="button">Buy</button><button type="button">Sell</button><button type="button">Swap settings</button></div>
      <div class="flex flex-col"><input placeholder="0" /></div>
      <button ${disabled ? "disabled" : ""}>${submitLabel}</button>
    </div>`;

  it("anchors the submit button, even before an amount is typed", () => {
    document.body.innerHTML = card("Buy swordcat");
    const anchor = fomoAdapter.anchor?.(document);
    expect(anchor?.textContent).toBe("Buy swordcat");
    // Disabled until an amount is entered: a block that waits for the form to be filled in is a
    // block that arrives after the decision.
    expect((anchor as HTMLButtonElement).disabled).toBe(true);
  });

  it("anchors the Sell submit the same way", () => {
    document.body.innerHTML = card("Sell swordcat", false);
    expect(fomoAdapter.anchor?.(document)?.textContent).toBe("Sell swordcat");
  });

  it("never anchors the Buy|Sell side tabs, which would block the way to Sell", () => {
    document.body.innerHTML = `
      <div class="border rounded-2xl">
        <div class="flex gap-2"><button type="button">Buy</button><button type="button">Sell</button></div>
        <input placeholder="0" />
      </div>`;
    expect(fomoAdapter.anchor?.(document)).toBeNull();
  });

  it("finds nothing when the app is behind its login, so the runner docks instead of blocking blind", () => {
    document.body.innerHTML = `<header><button>Log in</button></header><main><button>Start trading</button></main>`;
    expect(fomoAdapter.anchor?.(document)).toBeNull();
  });
});
