// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { birdeyeAdapter } from "../lib/adapters/birdeye";
import { chainLabel, isCoveredChainSlug, OTHER_CHAIN_SLUGS, readTokenSymbol } from "../lib/adapters/chains";
import { cowAdapter } from "../lib/adapters/cow";
import { dexscreenerAdapter } from "../lib/adapters/dexscreener";
import { gmgnAdapter } from "../lib/adapters/gmgn";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { matchaAdapter } from "../lib/adapters/matcha";
import { oneinchAdapter } from "../lib/adapters/oneinch";
import { pancakeswapAdapter } from "../lib/adapters/pancakeswap";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";
import { findAdapter } from "../lib/adapters/registry";
import type { TargetGap, VenueAdapter } from "../lib/adapters/types";
import { uniswapAdapter } from "../lib/adapters/uniswap";
import { TIER2_MATCHES } from "../lib/venues";
import { gapHeadline } from "../entrypoints/venues.content/format";

/**
 * Round 1.4: the pages that resolved to nothing, the page that resolved to the wrong thing and
 * spent six credits doing it, and the symbol misread that sent every affected card looking for
 * a token that does not exist.
 */

const SOL_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"; // $WIF
const EVM_ADDR = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const DEGEN_BASE = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";

const emptyDoc = () => document.implementation.createHTMLDocument("");
/** The live document, the way the other anchor suites do it: happy-dom only reports an element
 * as visible inside the document it actually renders. */
function docWithBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

function targetOf(adapter: VenueAdapter, href: string) {
  const url = new URL(href);
  expect(adapter.match(url), `${adapter.id} should match ${href}`).toBe(true);
  return adapter.readTarget(emptyDoc(), url);
}

function gapOf(adapter: VenueAdapter, href: string, doc: Document = emptyDoc()): TargetGap | null {
  const url = new URL(href);
  return adapter.readTarget(doc, url) ? null : (adapter.readGap?.(doc, url) ?? null);
}

/** A selector built from leaves, the way a venue's own component tree builds one. */
function nested(html: string): Element {
  const doc = emptyDoc();
  const host = doc.createElement("div");
  for (const part of html.split("|").filter(Boolean)) {
    const [tag, text] = part.split(":");
    const child = doc.createElement(tag!);
    child.textContent = text ?? "";
    host.append(child);
  }
  return host;
}

describe("1.4.1 hyperliquid: a spot pair is not a perp market", () => {
  it("still reads a single-segment perp coin", () => {
    expect(targetOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/ETH")).toMatchObject({ kind: "perp", coin: "ETH" });
    expect(gapOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/ETH")).toBeNull();
  });

  it("a spot pair yields no perp target, so no perp credits are spent on it", () => {
    // The unanchored regex read `PURR` out of `/trade/PURR/USDC` and spent perp-screener (1)
    // plus tgm/perp-positions (5) per coin per 2 minutes on a market that does not exist.
    expect(targetOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/PURR/USDC")).toBeNull();
  });

  it("names the venue rather than pricing a market that does not exist", () => {
    const gap = gapOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/PURR/USDC");
    expect(gap).toEqual({ kind: "unsupported-chain", label: "Hyperliquid spot", symbol: "PURR" });
    expect(gapHeadline(gap)).toBe("No onchain data for PURR on Hyperliquid spot");
  });

  it("a spot index carries no ticker, so it claims none", () => {
    expect(targetOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/@107")).toBeNull();
    expect(gapOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/@107")).toEqual({ kind: "unsupported-chain", label: "Hyperliquid spot" });
    expect(gapHeadline(gapOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/@107"))).toBe("No onchain data for Hyperliquid spot");
  });

  it("a spot pair still gets an adapter, or the page gets no answer at all", () => {
    expect(findAdapter(new URL("https://app.hyperliquid.xyz/trade/PURR/USDC"))?.id).toBe("hyperliquid");
  });

  it("leaves the HIP-3 namespace ruling alone", () => {
    expect(targetOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/xyz:TSLA")).toBeNull();
    expect(gapOf(hyperliquidAdapter, "https://app.hyperliquid.xyz/trade/xyz:TSLA")).toBeNull();
  });
});

describe("1.4.2 birdeye: after the 308, the path is the only chain signal", () => {
  it("reads the chain and the token out of the path", () => {
    expect(targetOf(birdeyeAdapter, `https://birdeye.so/solana/token/${SOL_MINT}`)).toEqual({ kind: "spot", chain: "solana", tokenAddress: SOL_MINT });
    expect(targetOf(birdeyeAdapter, `https://birdeye.so/base/token/${EVM_ADDR}`)).toEqual({ kind: "spot", chain: "base", tokenAddress: EVM_ADDR });
  });

  it("an unmapped chain slug names the chain instead of defaulting to one", () => {
    const gap = gapOf(birdeyeAdapter, `https://birdeye.so/sui/token/${SOL_MINT}`);
    expect(gap).toEqual({ kind: "unsupported-chain", label: "Sui" });
    expect(gapHeadline(gap)).toBe("No onchain data for Sui");
  });
});

describe("1.4.3 uniswap: an explore page names its own chain", () => {
  it("yields an exact target from /explore/tokens/<chain>/<address>", () => {
    expect(targetOf(uniswapAdapter, `https://app.uniswap.org/explore/tokens/base/${DEGEN_BASE}`)).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: DEGEN_BASE,
    });
  });

  it("never asks the user to select a network on a URL that names one", () => {
    // "Select a network to check DEGEN" on a URL reading `base/0x4ed4…` was the worst class of
    // failure in the set: a confident instruction to do something already done.
    expect(gapOf(uniswapAdapter, `https://app.uniswap.org/explore/tokens/base/${DEGEN_BASE}`)).toBeNull();
    const gap = gapOf(uniswapAdapter, `https://app.uniswap.org/explore/tokens/zksync/${DEGEN_BASE}`);
    expect(gap).toEqual({ kind: "unsupported-chain", label: "zkSync Era" });
    expect(gapHeadline(gap)).not.toMatch(/Select a network/);
  });
});

describe("1.4.4 jupiter: the token page", () => {
  it("matches and reads the mint out of /tokens/<mint>", () => {
    expect(targetOf(jupiterAdapter, `https://jup.ag/tokens/${SOL_MINT}`)).toEqual({ kind: "spot", chain: "solana", tokenAddress: SOL_MINT });
    expect(findAdapter(new URL(`https://jup.ag/tokens/${SOL_MINT}`))?.id).toBe("jupiter");
  });

  it("a path that is not a mint claims nothing", () => {
    expect(targetOf(jupiterAdapter, "https://jup.ag/tokens/SOL")).toBeNull();
    expect(gapOf(jupiterAdapter, "https://jup.ag/tokens/SOL")).toBeNull();
  });

  it("offers no anchor there, so nothing is blocked on an uncaptured form", () => {
    const doc = docWithBody(`<form><input /><button>Swap</button></form>`);
    expect(jupiterAdapter.anchor?.(doc, new URL(`https://jup.ag/tokens/${SOL_MINT}`))).toBeNull();
    // The swap page is unchanged: its captured form still anchors.
    expect(jupiterAdapter.anchor?.(doc, new URL(`https://jup.ag/swap/SOL-${SOL_MINT}`))?.textContent).toBe("Swap");
  });
});

describe("1.4.5 1inch: the host it moved to", () => {
  it("matches 1inch.com and reads the dst token", () => {
    expect(targetOf(oneinchAdapter, `https://1inch.com/swap?src=1:0x${"e".repeat(40)}&dst=1:${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "ethereum",
      tokenAddress: EVM_ADDR,
    });
  });

  it("keeps the old host and its hash route parsing", () => {
    expect(targetOf(oneinchAdapter, `https://app.1inch.io/#/1/simple/swap/1:ETH/1:${EVM_ADDR}`)).toEqual({
      kind: "spot",
      chain: "ethereum",
      tokenAddress: EVM_ADDR,
    });
  });

  it("says nothing about the unverified Solana form rather than something false", () => {
    // 1inch writes `dst=501:<base58>`. 501 is not in EVM_CHAIN_IDS and is unverified; "no
    // onchain data on this network" would be false if it is Solana, which Tripwire covers.
    expect(targetOf(oneinchAdapter, `https://1inch.com/swap?dst=501:${SOL_MINT}`)).toBeNull();
    expect(gapOf(oneinchAdapter, `https://1inch.com/swap?dst=501:${SOL_MINT}`)).toBeNull();
  });

  it("the new host is in the manifest match list (a NEW MV3 host permission)", () => {
    expect(TIER2_MATCHES).toContain("https://1inch.com/*");
    expect(TIER2_MATCHES).toContain("https://app.1inch.io/*");
  });
});

describe("1.4.6 pancakeswap: its own home chain", () => {
  it("reads ?chain=bsc, in any case", () => {
    for (const spelling of ["bsc", "BSC", "Bsc"]) {
      expect(targetOf(pancakeswapAdapter, `https://pancakeswap.finance/swap?chain=${spelling}&outputCurrency=${EVM_ADDR}`)).toEqual({
        kind: "spot",
        chain: "bnb",
        tokenAddress: EVM_ADDR,
      });
    }
  });

  it("still reads the spellings it already read, and still refuses a missing chain", () => {
    expect(targetOf(pancakeswapAdapter, `https://pancakeswap.finance/swap?chain=bnb&outputCurrency=${EVM_ADDR}`)).toMatchObject({ chain: "bnb" });
    expect(targetOf(pancakeswapAdapter, `https://pancakeswap.finance/swap?outputCurrency=${EVM_ADDR}`)).toBeNull();
  });

  it("the other call site of the shared map is untouched: uniswap gains no bsc spelling", () => {
    // pancakeswap has its own map now, so `bsc` never leaks into Uniswap's URL vocabulary.
    expect(targetOf(uniswapAdapter, `https://app.uniswap.org/swap?chain=bsc&outputCurrency=${EVM_ADDR}`)).toBeNull();
    expect(targetOf(uniswapAdapter, `https://app.uniswap.org/swap?chain=bnb&outputCurrency=${EVM_ADDR}`)).toMatchObject({ chain: "bnb" });
  });
});

describe("1.4.7 a symbol read from leaves, not from concatenated text", () => {
  it("an avatar monogram in front of the ticker no longer becomes DDEGEN", () => {
    const el = nested("div:D|span:DEGEN");
    expect(el.textContent).toBe("DDEGEN"); // what textContent still says
    expect(readTokenSymbol(el)).toBe("DEGEN");
  });

  it("reads a lone leaf, a plain node and a one-character symbol standing alone", () => {
    expect(readTokenSymbol(nested("span:USDC"))).toBe("USDC");
    expect(readTokenSymbol({ textContent: "WIF" } as Element)).toBe("WIF");
    expect(readTokenSymbol(nested("span:M"))).toBe("M");
  });

  it("skips a placeholder leaf and keeps looking", () => {
    expect(readTokenSymbol(nested("span:Select token"))).toBeNull();
    expect(readTokenSymbol(nested("span:Select token|span:DEGEN"))).toBe("DEGEN");
    expect(readTokenSymbol(nested(""))).toBeNull();
  });

  it("uniswap's Buy selector reads the ticker out of a nested selector", () => {
    const doc = docWithBody(`<div data-testid="choose-output-token"><div class="logo">D</div><span>DEGEN</span></div>`);
    expect(uniswapAdapter.readGap?.(doc, new URL("https://app.uniswap.org/swap?chain=base"))).toEqual({
      kind: "symbol",
      symbol: "DEGEN",
      chainHint: "base",
    });
  });
});

describe("1.4.8 tier-2 adapters answer with the chain instead of a shrug", () => {
  it("dexscreener names a chain off its own rail", () => {
    expect(gapHeadline(gapOf(dexscreenerAdapter, `https://dexscreener.com/sui/0xabc`))).toBe("No onchain data for Sui");
    expect(gapHeadline(gapOf(dexscreenerAdapter, `https://dexscreener.com/berachain/0xabc`))).toBe("No onchain data for Berachain");
  });

  it("dexscreener stays quiet on a chain it does cover: the pair lookup answers that", () => {
    expect(gapOf(dexscreenerAdapter, `https://dexscreener.com/solana/${SOL_MINT}`)).toBeNull();
  });

  it("gmgn names its uncovered segments", () => {
    expect(gapHeadline(gapOf(gmgnAdapter, "https://gmgn.ai/tron/token/TQ5NMqJjW3jGhmEfN7mHXLqPqKk1oS9Pxr"))).toBe("No onchain data for Tron");
    expect(gapOf(gmgnAdapter, `https://gmgn.ai/sol/token/${SOL_MINT}`)).toBeNull();
  });

  it("pancakeswap names a chain it routes to that Tripwire does not cover", () => {
    expect(gapHeadline(gapOf(pancakeswapAdapter, `https://pancakeswap.finance/swap?chain=aptos&outputCurrency=${EVM_ADDR}`))).toBe("No onchain data for Aptos");
  });

  it("matcha and cow name a numeric id, and fall back to the id itself: both are EVM-only", () => {
    expect(gapHeadline(gapOf(matchaAdapter, `https://matcha.xyz/swap?chainId=59144&buyAddress=${EVM_ADDR}`))).toBe("No onchain data for Linea");
    expect(gapHeadline(gapOf(cowAdapter, `https://swap.cow.fi/#/100/swap/${EVM_ADDR}/${EVM_ADDR}`))).toBe("No onchain data for Gnosis");
    expect(gapHeadline(gapOf(matchaAdapter, `https://matcha.xyz/swap?chainId=987654&buyAddress=${EVM_ADDR}`))).toBe("No onchain data for this token on this network");
  });

  it("never prints a coverage line about a chain Tripwire covers", () => {
    for (const href of [
      `https://pancakeswap.finance/swap?chain=solana&outputCurrency=${SOL_MINT}`,
      `https://matcha.xyz/swap?chainId=8453&buyAddress=${EVM_ADDR}`,
      `https://birdeye.so/base/token/${EVM_ADDR}`,
    ]) {
      const gap = gapOf(href.includes("pancakeswap") ? pancakeswapAdapter : href.includes("matcha") ? matchaAdapter : birdeyeAdapter, href);
      expect(gap, href).not.toMatchObject({ kind: "unsupported-chain" });
    }
  });

  it("names every chain on Dexscreener's live rail, or most of them fall to the generic line", () => {
    // Read from dexscreener.com on 2026-09-20: the chain rail, minus its non-chain links.
    const rail = `abstract algorand apechain aptos arbitrum arc avalanche base beam berachain blast bsc cardano celo
      conflux cronos ethereum fantom flare flowevm fuse hedera hyperevm hyperliquid icp injective ink katana kava linea
      manta mantle megaeth merlinchain metis monad movement multiversx near opbnb optimism plasma polkadot polygon
      pulsechain robinhood scroll seiv2 solana soneium sonic stable stacks starknet stepnetwork story sui telos ton
      tron unichain worldchain xrpl zksync`.split(/\s+/).filter(Boolean);
    const unanswered = rail.filter((slug) => !isCoveredChainSlug(slug) && !OTHER_CHAIN_SLUGS[slug]);
    expect(unanswered).toEqual([]);
  });

  it("chainLabel names a slug as well as an id, so one vocabulary serves every venue", () => {
    expect(chainLabel("sui")).toBe("Sui");
    expect(chainLabel("9270000000000000")).toBe("Sui");
    expect(chainLabel("8453")).toBe("Base");
  });
});

describe("1.4.9 pump.fun: the quick-buy chips are trades", () => {
  const panel = (extra = "") =>
    docWithBody(`
      <section>
        <div role="tablist"><button role="tab">Buy</button><button role="tab">Sell</button></div>
        <div><input /><button aria-pressed="false">Connect wallet to trade</button></div>
        <div role="group" aria-label="Quick buy">
          <button aria-label="Quick buy $25">$25</button>
          <button aria-label="Quick buy $100">$100</button>
        </div>
        <div role="group" aria-label="Quick sell">
          <button aria-label="Quick sell 50%">50%</button>
        </div>
        ${extra}
      </section>`);

  it("names every quick-buy and quick-sell chip, and nothing else", () => {
    const extras = pumpfunAdapter.blockedExtras!(panel(`<button>Share</button>`));
    expect(extras.map((el) => el.getAttribute("aria-label"))).toEqual(["Quick buy $25", "Quick buy $100", "Quick sell 50%"]);
  });

  it("does not take the chips as the anchor: the primary is still the trade form's own action", () => {
    expect(pumpfunAdapter.anchor?.(panel())?.textContent).toBe("Connect wallet to trade");
  });

  it("binds each chip, never the group container that would swallow unrelated clicks", () => {
    const doc = panel();
    for (const el of pumpfunAdapter.blockedExtras!(doc)) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("role")).not.toBe("group");
    }
  });
});
