// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { polymarketAdapter } from "../lib/adapters/polymarket";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";
import { uniswapAdapter } from "../lib/adapters/uniswap";

/** `findButton`'s visibility check (`offsetParent`/`getClientRects`) only returns non-empty
 * results for elements attached to a live, rendered document -- an unattached
 * `createHTMLDocument()` fragment always reports invisible. So each fixture is rendered into
 * the shared happy-dom `document` (each test overwrites `document.body`, so fixtures never
 * leak between tests). */
function docWithBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("jupiter anchor", () => {
  it("picks the last visible, enabled button matching /^(swap|place order)$/i", () => {
    const doc = docWithBody(`
      <button>Cancel</button>
      <button disabled>Swap</button>
      <button>Swap</button>
    `);
    const anchor = jupiterAdapter.anchor?.(doc);
    expect(anchor?.textContent?.trim()).toBe("Swap");
    expect(anchor instanceof HTMLButtonElement && anchor.disabled).toBe(false);
  });

  it("skips a disabled button entirely when it's the only match", () => {
    const doc = docWithBody(`<button disabled>Swap</button>`);
    expect(jupiterAdapter.anchor?.(doc)).toBeNull();
  });
});

describe("pumpfun anchor", () => {
  it("matches /place trade|buy/i, case-insensitively", () => {
    const doc = docWithBody(`<button>Sell</button><button>Place Trade</button>`);
    expect(pumpfunAdapter.anchor?.(doc)?.textContent?.trim()).toBe("Place Trade");
  });
});

describe("uniswap anchor", () => {
  it("prefers [data-testid=review-swap] over a generic Swap button", () => {
    const doc = docWithBody(`
      <button>Swap</button>
      <button data-testid="review-swap">Review swap</button>
    `);
    const anchor = uniswapAdapter.anchor?.(doc);
    expect(anchor?.getAttribute("data-testid")).toBe("review-swap");
  });

  it("falls back to /^swap$/i when no review-swap testid is present", () => {
    const doc = docWithBody(`<button>Swap</button>`);
    expect(uniswapAdapter.anchor?.(doc)?.textContent?.trim()).toBe("Swap");
  });

  it("ignores a disabled review-swap button and falls back to the text match", () => {
    const doc = docWithBody(`
      <button data-testid="review-swap" disabled>Review swap</button>
      <button>Swap</button>
    `);
    expect(uniswapAdapter.anchor?.(doc)?.textContent?.trim()).toBe("Swap");
  });
});

describe("hyperliquid side detection", () => {
  it("reads the active side from aria-pressed=true", () => {
    const doc = docWithBody(`
      <div>
        <button aria-pressed="true">Long</button>
        <button aria-pressed="false">Short</button>
        <button>Buy</button>
      </div>
    `);
    const target = hyperliquidAdapter.readTarget(doc, new URL("https://app.hyperliquid.xyz/trade/ETH"));
    expect(target).toMatchObject({ kind: "perp", coin: "ETH", side: "long" });
  });

  it("reads short from aria-pressed=true on the Short toggle", () => {
    const doc = docWithBody(`
      <div>
        <button aria-pressed="false">Long</button>
        <button aria-pressed="true">Short</button>
      </div>
    `);
    const target = hyperliquidAdapter.readTarget(doc, new URL("https://app.hyperliquid.xyz/trade/ETH"));
    expect(target).toMatchObject({ kind: "perp", coin: "ETH", side: "short" });
  });

  it("falls back to the submit button's own text when no toggle is marked selected", () => {
    const doc = docWithBody(`<button>Buy / Long</button>`);
    const target = hyperliquidAdapter.readTarget(doc, new URL("https://app.hyperliquid.xyz/trade/ETH"));
    expect(target).toMatchObject({ kind: "perp", coin: "ETH", side: "long" });
  });

  it("side is undefined when nothing indicates a selection", () => {
    const doc = docWithBody(`<p>no buttons here</p>`);
    const target = hyperliquidAdapter.readTarget(doc, new URL("https://app.hyperliquid.xyz/trade/ETH"));
    expect(target).toEqual({ kind: "perp", coin: "ETH" });
  });

  it("anchor matches /^(buy|sell|long|short)/i", () => {
    const doc = docWithBody(`<button>Cancel</button><button>Long ETH</button>`);
    expect(hyperliquidAdapter.anchor?.(doc)?.textContent?.trim()).toBe("Long ETH");
  });
});

describe("polymarket outcome detection", () => {
  const url = new URL("https://polymarket.com/event/some-event/some-market");

  it("reads the selected Yes toggle inside the trade form", () => {
    const doc = docWithBody(`
      <form>
        <button type="button" aria-pressed="true">Yes 45¢</button>
        <button type="button" aria-pressed="false">No 56¢</button>
        <button type="submit">Trade</button>
      </form>
    `);
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ kind: "prediction", slug: "some-market", outcome: "yes" });
  });

  it("falls back to the buy button's own text: 'Buy No'", () => {
    const doc = docWithBody(`<div><button>Buy No</button></div>`);
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ kind: "prediction", slug: "some-market", outcome: "no" });
  });

  it("ignores Yes/No controls outside the trade form (other markets on an event page)", () => {
    const doc = docWithBody(`
      <section>
        <div class="row"><span>72k</span><button aria-pressed="true">Yes</button><button>No</button></div>
        <div class="row"><span>74k</span><button>Yes</button><button aria-selected="true">No</button></div>
      </section>
      <aside><form><button type="button">Yes</button><button type="button">No</button><button type="submit">Trade</button></form></aside>
    `);
    const target = polymarketAdapter.readTarget(doc, url);
    expect(target).toMatchObject({ kind: "prediction", slug: "some-market" });
    expect(target && "outcome" in target ? target.outcome : undefined).toBeUndefined();
  });

  it("no trade button -> no outcome (never a page-wide guess)", () => {
    const doc = docWithBody(`<div><button aria-pressed="true">Yes</button><button>No</button></div>`);
    const target = polymarketAdapter.readTarget(doc, url);
    expect(target && "outcome" in target ? target.outcome : undefined).toBeUndefined();
  });

  it("anchor matches /^(buy|trade)/i", () => {
    const doc = docWithBody(`<button>Cancel</button><button>Buy No</button>`);
    expect(polymarketAdapter.anchor?.(doc)?.textContent?.trim()).toBe("Buy No");
  });
});
