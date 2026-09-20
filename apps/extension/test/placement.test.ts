// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dexscreenerAdapter } from "../lib/adapters/dexscreener";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jumperAdapter } from "../lib/adapters/jumper";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import {
  anchorCandidates,
  isInFirstViewport,
  isInVolatileContainer,
  MIN_VISIBLE_PX,
  placementFor,
  type PlacementProbe,
  type Rect,
} from "../lib/adapters/placement";
import { polymarketAdapter } from "../lib/adapters/polymarket";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";
import type { VenueAdapter } from "../lib/adapters/types";
import { uniswapAdapter } from "../lib/adapters/uniswap";

/**
 * Placement: where the verdict is mounted, and why that is the place the eye already is.
 *
 * The user's report is the whole reason this file exists — "on dexscreener positions of banners
 * we are showing are on odd places like someone cannot catch without having good eye". Every
 * assertion below is a condition from `docs/briefs/placement-visibility.md`: the chosen anchor
 * is the expected element, its box sits inside a 1440x900 viewport at the page's default
 * scroll, and it is never a row of a scrolling data grid or a virtualised list.
 *
 * happy-dom has no layout, so geometry is supplied to `placementFor` through a `PlacementProbe`
 * rather than measured. `data-rect="top,left,width,height"` on a fixture element is this file's
 * way of saying "this is where the live page puts it"; the numbers in the venue suites are the
 * ones read off the real sites at 1440x900 on 2026-09-20.
 */

const VIEWPORT = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };

/** Reads a fixture element's declared box; an element with no `data-rect` is unmeasured. */
function declaredRect(el: Element): Rect {
  const raw = el.getAttribute("data-rect");
  if (!raw) return { top: 0, left: 0, width: 0, height: 0 };
  const [top, left, width, height] = raw.split(",").map(Number) as [number, number, number, number];
  return { top, left, width, height };
}

const probe: PlacementProbe = { rect: declaredRect, viewport: () => VIEWPORT };

function docWithBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("isInFirstViewport", () => {
  it("accepts a box at the top of the page", () => {
    expect(isInFirstViewport({ top: 46, left: 1106, width: 334, height: 60 }, VIEWPORT)).toBe(true);
  });

  it("rejects a box below the fold at the default scroll", () => {
    expect(isInFirstViewport({ top: 1205, left: 120, width: 760, height: 29 }, VIEWPORT)).toBe(false);
  });

  it("rejects a box scrolled above the top of the document", () => {
    expect(isInFirstViewport({ top: -40, left: 10, width: 200, height: 20 }, VIEWPORT)).toBe(false);
  });

  it("measures against the document, not the scrolled viewport", () => {
    // Scrolled down 1000px, an element at viewport y=10 is at document y=1010: not somewhere a
    // user arriving at the page would have seen it.
    const scrolled = { ...VIEWPORT, scrollY: 1000 };
    expect(isInFirstViewport({ top: 10, left: 120, width: 300, height: 40 }, scrolled)).toBe(false);
  });

  it(`accepts a box straddling the fold by at least ${MIN_VISIBLE_PX}px and rejects a thinner sliver`, () => {
    expect(isInFirstViewport({ top: 876, left: 0, width: 300, height: 400 }, VIEWPORT)).toBe(true);
    expect(isInFirstViewport({ top: 890, left: 0, width: 300, height: 400 }, VIEWPORT)).toBe(false);
  });

  it("rejects a collapsed box and a box off the right edge", () => {
    expect(isInFirstViewport({ top: 10, left: 10, width: 0, height: 20 }, VIEWPORT)).toBe(false);
    expect(isInFirstViewport({ top: 10, left: 1600, width: 200, height: 20 }, VIEWPORT)).toBe(false);
  });

  it("accepts an unmeasured box, so a layout-less environment falls back to the visibility check", () => {
    expect(isInFirstViewport({ top: 0, left: 0, width: 0, height: 0 }, VIEWPORT)).toBe(true);
  });
});

describe("isInVolatileContainer", () => {
  it("rejects a virtualised list row — DexScreener's transactions pane is Virtuoso", () => {
    const doc = docWithBody(`
      <div data-testid="virtuoso-scroller" data-virtuoso-scroller="true">
        <div data-index="0"><span id="cell">$WIF</span></div>
      </div>`);
    expect(isInVolatileContainer(doc.querySelector("#cell")!)).toBe(true);
  });

  it("rejects a data-grid row and a table cell", () => {
    const doc = docWithBody(`
      <div role="grid"><div role="row"><span id="grid-cell">x</span></div></div>
      <table><tbody><tr><td><span id="table-cell">y</span></td></tr></tbody></table>`);
    expect(isInVolatileContainer(doc.querySelector("#grid-cell")!)).toBe(true);
    expect(isInVolatileContainer(doc.querySelector("#table-cell")!)).toBe(true);
  });

  it("accepts a plain header and a trade button", () => {
    const doc = docWithBody(`<header><h1 id="name">Degen</h1></header><form><button id="go">Swap</button></form>`);
    expect(isInVolatileContainer(doc.querySelector("#name")!)).toBe(false);
    expect(isInVolatileContainer(doc.querySelector("#go")!)).toBe(false);
  });
});

/** A stand-in adapter whose candidates are declared inline, for the ordering rules. */
function fakeAdapter(extra: Partial<VenueAdapter> = {}): VenueAdapter {
  return {
    id: "fake",
    tier: 1,
    match: () => true,
    readTarget: () => null,
    anchor: (doc) => doc.querySelector<HTMLElement>("#trade"),
    overridePhrase: "I AM EXIT LIQUIDITY",
    ...extra,
  };
}

describe("candidate order", () => {
  it("puts the trade button Round 1.4's anchor() finds at the head of every tier-1 list", () => {
    const adapter = fakeAdapter({
      anchorPriority: [{ role: "token-identity", find: (doc) => doc.querySelector<HTMLElement>("#identity") }],
    });
    expect(anchorCandidates(adapter).map((c) => c.role)).toEqual(["trade-button", "token-identity"]);
  });

  it("gives a tier-2 adapter only its declared candidates — it has no trade button to block", () => {
    const adapter = fakeAdapter({ tier: 2, anchor: undefined, anchorPriority: [{ role: "token-identity", find: () => null }] });
    expect(anchorCandidates(adapter).map((c) => c.role)).toEqual(["token-identity"]);
  });

  it("takes the first candidate that exists, is visible and is in the first viewport", () => {
    const doc = docWithBody(`
      <button id="trade" data-rect="1500,900,200,44">Swap</button>
      <header id="identity" data-rect="120,173,1200,58">Degen</header>`);
    const adapter = fakeAdapter({
      anchorPriority: [{ role: "token-identity", find: (d) => d.querySelector<HTMLElement>("#identity") }],
    });
    const placement = placementFor(adapter, doc, undefined, probe);
    expect(placement?.role).toBe("token-identity");
    expect(placement?.element.id).toBe("identity");
  });

  it("skips a candidate inside a scrolling data grid even when it is in the first viewport", () => {
    const doc = docWithBody(`
      <div role="grid"><span id="identity" data-rect="200,120,300,20">$WIF</span></div>
      <header id="page" data-rect="0,0,1440,56">DEX Screener</header>`);
    const adapter = fakeAdapter({
      anchor: undefined,
      anchorPriority: [
        { role: "token-identity", find: (d) => d.querySelector<HTMLElement>("#identity") },
        { role: "page-header", find: (d) => d.querySelector<HTMLElement>("#page") },
      ],
    });
    expect(placementFor(adapter, doc, undefined, probe)?.role).toBe("page-header");
  });

  it("returns null when nothing qualifies, which is what sends the verdict to the dock", () => {
    const doc = docWithBody(`<span id="identity" data-rect="2400,120,300,20">$WIF</span>`);
    const adapter = fakeAdapter({
      anchor: undefined,
      anchorPriority: [{ role: "token-identity", find: (d) => d.querySelector<HTMLElement>("#identity") }],
    });
    expect(placementFor(adapter, doc, undefined, probe)).toBeNull();
  });

  it("puts the strip above a trade button and below a header, unless the candidate says otherwise", () => {
    const doc = docWithBody(`<button id="trade" data-rect="400,900,200,44">Swap</button>`);
    expect(placementFor(fakeAdapter(), doc, undefined, probe)?.place).toBe("before");

    const headerDoc = docWithBody(`<header id="identity" data-rect="120,173,1200,58">Degen</header>`);
    const adapter = fakeAdapter({
      anchor: undefined,
      anchorPriority: [{ role: "token-identity", find: (d) => d.querySelector<HTMLElement>("#identity") }],
    });
    expect(placementFor(adapter, headerDoc, undefined, probe)?.place).toBe("after");
  });
});

/**
 * DexScreener, the venue in the report. Shape and geometry read from the live pair page
 * (`dexscreener.com/solana/<WIF mint>`) at 1440x900 on 2026-09-20: a left nav, a chart panel
 * whose top strip is the trending rail and whose body is a TradingView iframe, and a right data
 * panel headed by the token name, then the pair identity row, then the price readouts. The
 * transactions pane under the chart is a Virtuoso scroller.
 */
const DEXSCREENER_PAIR_PAGE = `
  <nav data-rect="0,0,210,900">Explore</nav>
  <main data-rect="0,210,1230,900">
    <div class="panel" data-rect="0,1106,334,900">
      <header data-rect="0,1106,334,46"><h2 title="dogwifhat">dogwifhat</h2></header>
      <div class="pad" data-rect="46,1106,319,60">
        <div id="pair-header" data-rect="54,1118,295,43">
          <div data-rect="54,1118,295,19"><h2>$WIF<button>Copy token address</button>/SOL</h2></div>
          <div data-rect="76,1177,178,21">
            <ul><li><a href="/solana">Solana</a></li><li><a href="/solana/orca">Orca</a></li></ul>
          </div>
        </div>
      </div>
      <div class="stats" data-rect="234,1118,295,103">Price USD $0.1966</div>
    </div>
    <div class="chart" data-rect="0,210,895,900">
      <div class="trending" data-rect="6,210,845,33">
        <a href="/solana/4r8cimnjwdnoes3fqi1ccpfjygpxazahawphrn3rzenj">#1 JEANPHIL</a>
        <a href="/solana/eyeeg5fzzeigsqv7judxydepnspl382kyvfxaanxvmed">#2 Stryker</a>
      </div>
      <iframe data-rect="46,210,895,539"></iframe>
      <div data-testid="virtuoso-scroller" data-virtuoso-scroller="true" data-rect="600,210,895,300">
        <div data-index="0"><h2>$WIF/SOL decoy row</h2><a href="/solana">Solana</a><a href="/solana/orca">Orca</a></div>
      </div>
    </div>
  </main>`;

describe("dexscreener placement", () => {
  it("anchors the pair identity row at the top of the data panel, and puts the strip under it", () => {
    const doc = docWithBody(DEXSCREENER_PAIR_PAGE);
    const placement = placementFor(dexscreenerAdapter, doc, new URL("https://dexscreener.com/solana/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"), probe);
    expect(placement?.role).toBe("token-identity");
    expect(placement?.element.id).toBe("pair-header");
    // Under the symbol and the chain/dex badges, above the price readouts.
    expect(placement?.place).toBe("after");
  });

  it("lands inside the first viewport at the page's default scroll", () => {
    const doc = docWithBody(DEXSCREENER_PAIR_PAGE);
    const element = placementFor(dexscreenerAdapter, doc, undefined, probe)!.element;
    expect(isInFirstViewport(declaredRect(element), VIEWPORT)).toBe(true);
  });

  it("is never the trending rail, the pairs table or a virtualised transaction row", () => {
    const doc = docWithBody(DEXSCREENER_PAIR_PAGE);
    const element = placementFor(dexscreenerAdapter, doc, undefined, probe)!.element;
    expect(element.closest(".trending")).toBeNull();
    expect(isInVolatileContainer(element)).toBe(false);
    expect(element.closest("[data-virtuoso-scroller]")).toBeNull();
  });

  it("finds nothing on a page with no pair header, so the verdict goes to the dock", () => {
    const doc = docWithBody(`<main><div class="empty"><h2>Token or Pair Not Found</h2></div></main>`);
    expect(placementFor(dexscreenerAdapter, doc, undefined, probe)).toBeNull();
  });

  it("ignores a $-headed row that only exists inside the virtualised pane", () => {
    const doc = docWithBody(`
      <main>
        <div data-virtuoso-scroller="true" data-rect="100,210,895,300">
          <div data-index="0"><h2>$WIF/SOL</h2><a href="/solana">Solana</a><a href="/solana/orca">Orca</a></div>
        </div>
      </main>`);
    expect(placementFor(dexscreenerAdapter, doc, undefined, probe)).toBeNull();
  });
});

/**
 * Uniswap. `/explore/tokens/<chain>/<address>` carries a token identity header
 * (`token-info-container`) and a trade panel (`token-details-swap`), both read off the live page
 * at 1440x900 on 2026-09-20.
 */
describe("uniswap placement", () => {
  const EXPLORE = new URL("https://app.uniswap.org/explore/tokens/base/0x4ed4e862860bed51a9570b96d89af5e1b0efefed");

  it("prefers the trade button when the form has one", () => {
    const doc = docWithBody(`
      <div data-testid="token-info-container" data-rect="173,120,1200,58">Degen DEGEN</div>
      <div data-testid="token-details-swap" data-rect="284,960,360,377">
        <button data-testid="review-swap" data-rect="600,977,326,50">Review</button>
      </div>`);
    const placement = placementFor(uniswapAdapter, doc, EXPLORE, probe);
    expect(placement?.role).toBe("trade-button");
    expect(placement?.element.getAttribute("data-testid")).toBe("review-swap");
  });

  it("falls back to the trade panel when the form has no enabled primary", () => {
    const doc = docWithBody(`
      <div data-testid="token-info-container" data-rect="173,120,1200,58">Degen DEGEN</div>
      <div data-testid="token-details-swap" data-rect="284,960,360,377">
        <button disabled data-rect="600,977,326,50">Review</button>
      </div>`);
    const placement = placementFor(uniswapAdapter, doc, EXPLORE, probe);
    expect(placement?.role).toBe("trade-panel-header");
    expect(placement?.element.getAttribute("data-testid")).toBe("token-details-swap");
  });

  it("falls back to the token identity header when there is no trade panel at all", () => {
    const doc = docWithBody(`<div data-testid="token-info-container" data-rect="173,120,1200,58">Degen DEGEN</div>`);
    const placement = placementFor(uniswapAdapter, doc, EXPLORE, probe);
    expect(placement?.role).toBe("token-identity");
    expect(placement?.element.getAttribute("data-testid")).toBe("token-info-container");
  });
});

/**
 * The remaining tier-1 venues declare no fallback anchors: their trade button is the primary
 * placement, and a fallback selector for a page shape this repo has no capture of would be a
 * guess. What is asserted here is the brief's condition — the chosen anchor is the trade button
 * and its box is inside a 1440x900 viewport at the default scroll.
 */
describe("tier-1 venues anchor their own trade button, inside the first viewport", () => {
  const cases: { adapter: VenueAdapter; html: string; url: string; expected: string }[] = [
    {
      adapter: jupiterAdapter,
      url: "https://jup.ag/swap/SOL-EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
      html: `<form data-rect="200,520,400,420"><input /><button id="go" data-rect="700,520,400,48">Swap</button></form>`,
      expected: "go",
    },
    {
      adapter: pumpfunAdapter,
      url: "https://pump.fun/coin/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
      html: `<div data-rect="120,980,360,400"><input /><button id="go" data-rect="390,980,360,44">Place Trade</button></div>`,
      expected: "go",
    },
    {
      adapter: jumperAdapter,
      url: "https://jumper.xyz/",
      html: `<div data-rect="120,520,416,600"><button id="go" class="button-transaction" data-rect="560,536,384,48">Review Bridge</button></div>`,
      expected: "go",
    },
    {
      adapter: hyperliquidAdapter,
      url: "https://app.hyperliquid.xyz/trade/ETH",
      html: `<div data-rect="120,1100,300,600"><input /><button id="go" data-rect="620,1116,268,40">Place Order</button></div>`,
      expected: "go",
    },
    {
      adapter: polymarketAdapter,
      url: "https://polymarket.com/event/some-market",
      html: `<div data-rect="120,980,340,400"><input /><button id="go" data-rect="470,996,308,48">Buy Yes</button></div>`,
      expected: "go",
    },
  ];

  for (const { adapter, html, url, expected } of cases) {
    it(`${adapter.id}: the trade button, in the first viewport`, () => {
      const doc = docWithBody(html);
      const placement = placementFor(adapter, doc, new URL(url), probe);
      expect(placement?.role).toBe("trade-button");
      expect(placement?.element.id).toBe(expected);
      expect(placement?.place).toBe("before");
      expect(isInFirstViewport(declaredRect(placement!.element), VIEWPORT)).toBe(true);
    });
  }

  it("sends a trade button that is below the fold to the dock rather than mounting out of sight", () => {
    const doc = docWithBody(`<form data-rect="1400,520,400,420"><input /><button id="go" data-rect="1900,520,400,48">Swap</button></form>`);
    expect(placementFor(jupiterAdapter, doc, new URL("https://jup.ag/swap/SOL-x"), probe)).toBeNull();
  });
});
