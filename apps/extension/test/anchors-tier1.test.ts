// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jumperAdapter } from "../lib/adapters/jumper";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";

/** Realistic-ish venue snippets: the anchor must be the order form's primary action, never a
 * side toggle, a nav tab, or a quick-buy button on a token card. */
function docWithBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const text = (el: HTMLElement | null | undefined) => el?.textContent?.trim();

describe("hyperliquid anchor: toggle vs submit", () => {
  it("skips the Buy/Long and Sell/Short side toggles and picks the order form's submit", () => {
    const doc = docWithBody(`
      <div class="order-form">
        <div role="radiogroup">
          <button role="radio" aria-checked="true">Buy / Long</button>
          <button role="radio" aria-checked="false">Sell / Short</button>
        </div>
        <input aria-label="Size" />
        <button type="submit" data-testid="submit">Buy / Long</button>
      </div>
    `);
    expect(hyperliquidAdapter.anchor?.(doc)?.getAttribute("data-testid")).toBe("submit");
  });

  it("toggles marked with aria-pressed or inside a tablist are never the anchor", () => {
    const doc = docWithBody(`
      <div role="tablist"><button role="tab" aria-selected="true">Long</button><button role="tab">Short</button></div>
      <button aria-pressed="true">Buy</button>
      <button aria-pressed="false">Sell</button>
    `);
    expect(hyperliquidAdapter.anchor?.(doc)).toBeNull();
  });

  it("without a type=submit button, uses the last matching non-toggle button", () => {
    const doc = docWithBody(`
      <button aria-pressed="true">Long</button><button aria-pressed="false">Short</button>
      <button>Place Order</button>
    `);
    expect(text(hyperliquidAdapter.anchor?.(doc))).toBe("Place Order");
  });

  it("side still comes from the selected toggle", () => {
    const doc = docWithBody(`
      <div role="radiogroup"><button role="radio" aria-checked="false">Buy / Long</button><button role="radio" aria-checked="true">Sell / Short</button></div>
      <button type="submit">Sell / Short</button>
    `);
    expect(hyperliquidAdapter.readTarget(doc, new URL("https://app.hyperliquid.xyz/trade/BTC"))).toEqual({ kind: "perp", coin: "BTC", side: "short" });
  });
});

describe("jumper anchor: nav vs button", () => {
  it("ignores nav tabs and links named Exchange/Bridge and picks the form's button", () => {
    const doc = docWithBody(`
      <nav><button>Exchange</button><a href="/bridge"><button>Bridge</button></a></nav>
      <div role="tablist"><button role="tab">Swap</button></div>
      <p><button>Swap history</button></p>
      <form><button type="button" data-testid="primary">Review swap</button></form>
    `);
    expect(jumperAdapter.anchor?.(doc)?.getAttribute("data-testid")).toBe("primary");
  });

  it("requires a whole-label match", () => {
    for (const label of ["Exchange", "Swap", "Bridge", "Review", "Review bridge", "Start swap", "Start bridging"]) {
      const doc = docWithBody(`<main><button>${label}</button></main>`);
      expect(text(jumperAdapter.anchor?.(doc)), label).toBe(label);
    }
    for (const label of ["Swap tokens and more", "Reviewing", "Exchanges"]) {
      const doc = docWithBody(`<main><button>${label}</button></main>`);
      expect(jumperAdapter.anchor?.(doc), label).toBeNull();
    }
  });
});

describe("pump.fun anchor: quick-buy vs trade form", () => {
  it("ignores quick-buy buttons on token cards and picks Place trade", () => {
    const doc = docWithBody(`
      <ul>
        <li><a href="/coin/abc"><span>DOGE2</span><button>Buy</button></a></li>
        <li><article><span>CAT</span><button>buy</button></article></li>
      </ul>
      <div class="trade-form">
        <button>Buy</button><button>Sell</button>
        <input placeholder="0.0 SOL" />
        <button data-testid="place">Place trade</button>
      </div>
    `);
    expect(pumpfunAdapter.anchor?.(doc)?.getAttribute("data-testid")).toBe("place");
  });

  it("accepts an exact Buy inside the trade form (next to its amount input)", () => {
    const doc = docWithBody(`
      <ul><li><a href="/coin/abc"><button>Buy</button></a></li></ul>
      <form><input placeholder="0.0 SOL" /><button type="submit" data-testid="buy">Buy</button></form>
    `);
    expect(pumpfunAdapter.anchor?.(doc)?.getAttribute("data-testid")).toBe("buy");
  });

  it("a card quick-buy alone is never the anchor, nor is 'Buy now' text", () => {
    expect(pumpfunAdapter.anchor?.(docWithBody(`<ul><li><a href="/coin/x"><button>Buy</button></a></li></ul>`))).toBeNull();
    expect(pumpfunAdapter.anchor?.(docWithBody(`<form><input /><button>Buy 0.1 SOL now</button></form>`))).toBeNull();
  });
});

describe("jupiter root URL forms", () => {
  const MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
  const SOL = "So11111111111111111111111111111111111111112";

  it("guards jup.ag/?sell=&buy=", () => {
    const url = new URL(`https://jup.ag/?sell=${SOL}&buy=${MINT}`);
    expect(jupiterAdapter.match(url)).toBe(true);
    expect(jupiterAdapter.readTarget(document, url)).toMatchObject({ kind: "spot", chain: "solana", tokenAddress: MINT });
  });

  it("guards jup.ag/?inputMint=&outputMint=", () => {
    const url = new URL(`https://jup.ag/?inputMint=${SOL}&outputMint=${MINT}`);
    expect(jupiterAdapter.match(url)).toBe(true);
    expect(jupiterAdapter.readTarget(document, url)).toMatchObject({ kind: "spot", chain: "solana", tokenAddress: MINT });
  });

  it("the bare homepage and unrelated paths still don't match", () => {
    expect(jupiterAdapter.match(new URL("https://jup.ag/"))).toBe(false);
    expect(jupiterAdapter.match(new URL(`https://jup.ag/perps?buy=${MINT}`))).toBe(false);
  });
});
