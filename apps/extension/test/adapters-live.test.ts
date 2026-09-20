// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hyperliquidAdapter } from "../lib/adapters/hyperliquid";
import { jumperAdapter } from "../lib/adapters/jumper";
import { jupiterAdapter } from "../lib/adapters/jupiter";
import { polymarketAdapter } from "../lib/adapters/polymarket";
import { pumpfunAdapter } from "../lib/adapters/pumpfun";
import { findAdapter } from "../lib/adapters/registry";
import { uniswapAdapter } from "../lib/adapters/uniswap";
import { TIER1_MATCHES } from "../lib/venues";

/**
 * Adapters against markup reconstructed from live captures (docs/VENUE-CHECK.md, 2026-09-17). Each
 * `<venue>.html` fixture keeps only the button structure, text and attributes seen in the logged-out page;
 * the matching `<venue>-<state>.json` files hold the raw structural snapshots. "Connected" cases swap the
 * primary button's label in place, inferred from the same element (testid/class/position), since no wallet
 * was connected during capture.
 */
// Resolved from the package root (vitest runs with cwd = apps/extension): under happy-dom,
// import.meta.url is not this file's URL.
const FIXTURES = join(process.cwd(), "test", "fixtures", "venues");

function load(venue: string): Document {
  document.body.innerHTML = readFileSync(join(FIXTURES, `${venue}.html`), "utf8");
  return document;
}

const byFixture = (name: string) => document.querySelector<HTMLElement>(`[data-fixture="${name}"]`)!;
const fixtureOf = (el: HTMLElement | null | undefined) => el?.getAttribute("data-fixture") ?? null;
const relabel = (name: string, label: string) => {
  byFixture(name).textContent = label;
};

describe("jupiter (live capture)", () => {
  const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
  const SOL = "So11111111111111111111111111111111111111112";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  it("logged out: anchors the form's Connect button, never the header or positions-panel Connect", () => {
    const doc = load("jupiter");
    expect(fixtureOf(jupiterAdapter.anchor?.(doc))).toBe("primary");
  });

  it("connected (inferred): the same form button reading Swap is the anchor", () => {
    const doc = load("jupiter");
    relabel("primary", "Swap");
    expect(fixtureOf(jupiterAdapter.anchor?.(doc))).toBe("primary");
  });

  it("without the form button, header/panel Connect buttons are not anchors", () => {
    const doc = load("jupiter");
    byFixture("primary").remove();
    expect(jupiterAdapter.anchor?.(doc)).toBeNull();
  });

  it("reads the query-string URL Jupiter keeps (the /swap/<in>-<out> path form is rewritten to it)", () => {
    const url = new URL(`https://jup.ag/swap?sell=${SOL}&buy=${WIF}`);
    expect(jupiterAdapter.match(url)).toBe(true);
    expect(jupiterAdapter.readTarget(document, url)).toEqual({ kind: "spot", chain: "solana", tokenAddress: WIF });
    // Observed redirect target after loading /swap/SOL-<WIF>: the site's default pair, read as-is.
    const redirected = new URL(`https://jup.ag/swap?buy=${USDC}&sell=${SOL}`);
    expect(jupiterAdapter.readTarget(document, redirected)).toEqual({ kind: "spot", chain: "solana", tokenAddress: USDC });
  });
});

describe("pump.fun (live capture)", () => {
  const MINT = "HVWaFa5HTbX3hSju8rGkjVrVcYT1dPUUHBCug45zpump";

  it("logged out: anchors 'Connect wallet to trade' in the rendered trade panel", () => {
    const doc = load("pumpfun");
    expect(fixtureOf(pumpfunAdapter.anchor?.(doc))).toBe("primary");
  });

  it("never anchors the Buy/Sell tabs, quick-buy chips, Sign in, or the holders list", () => {
    const doc = load("pumpfun");
    byFixture("primary").remove();
    expect(pumpfunAdapter.anchor?.(doc)).toBeNull();
  });

  it("sell tab selected: still the same primary button", () => {
    const doc = load("pumpfun");
    byFixture("buy-tab").setAttribute("aria-selected", "false");
    byFixture("sell-tab").setAttribute("aria-selected", "true");
    expect(fixtureOf(pumpfunAdapter.anchor?.(doc))).toBe("primary");
  });

  it.each(["Buy", "Sell", "Place trade", "Buy JAX"])("connected (inferred): primary reading %s", (label) => {
    const doc = load("pumpfun");
    relabel("primary", label);
    expect(fixtureOf(pumpfunAdapter.anchor?.(doc))).toBe("primary");
  });

  it("readTarget from /coin/<mint>", () => {
    expect(pumpfunAdapter.readTarget(document, new URL(`https://pump.fun/coin/${MINT}`))).toEqual({ kind: "spot", chain: "solana", tokenAddress: MINT });
  });
});

describe("uniswap (live capture)", () => {
  const DEGEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";

  it("logged out: anchors review-swap reading 'Get started', not the navbar 'Get started'", () => {
    const doc = load("uniswap");
    const anchor = uniswapAdapter.anchor?.(doc);
    expect(fixtureOf(anchor)).toBe("primary");
    expect(anchor?.textContent?.trim()).toBe("Get started");
  });

  it("connected (inferred): review-swap reading Review", () => {
    const doc = load("uniswap");
    relabel("primary", "Review");
    expect(fixtureOf(uniswapAdapter.anchor?.(doc))).toBe("primary");
  });

  it("readTarget for the captured URL", () => {
    expect(uniswapAdapter.readTarget(document, new URL(`https://app.uniswap.org/swap?chain=base&outputCurrency=${DEGEN}`))).toEqual({ kind: "spot", chain: "base", tokenAddress: DEGEN });
  });
});

describe("jumper (live capture)", () => {
  const DEGEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";

  it("logged out: anchors the widget's 'Connect wallet' transaction button, not the header Connect", () => {
    const doc = load("jumper");
    expect(fixtureOf(jumperAdapter.anchor?.(doc))).toBe("primary");
  });

  it.each(["Review swap", "Exchange", "Start bridging"])("connected (inferred): transaction button reading %s", (label) => {
    const doc = load("jumper");
    relabel("primary", label);
    expect(fixtureOf(jumperAdapter.anchor?.(doc))).toBe("primary");
  });

  it("without the widget button, nothing else anchors", () => {
    const doc = load("jumper");
    byFixture("primary").remove();
    expect(jumperAdapter.anchor?.(doc)).toBeNull();
  });

  it("jumper.exchange redirects to jumper.xyz: both hosts match and parse", () => {
    for (const host of ["jumper.exchange", "jumper.xyz"]) {
      const url = new URL(`https://${host}/?toChain=8453&toToken=${DEGEN}`);
      expect(findAdapter(url)?.id, host).toBe("jumper");
      expect(jumperAdapter.readTarget(document, url)).toEqual({ kind: "spot", chain: "base", tokenAddress: DEGEN });
    }
    expect(TIER1_MATCHES).toContain("https://jumper.xyz/*");
  });
});

describe("hyperliquid (live capture)", () => {
  const url = new URL("https://app.hyperliquid.xyz/trade/ETH");

  function selectShort() {
    byFixture("slider").classList.replace("left", "right");
    byFixture("long-label").classList.remove("left");
    byFixture("short-label").classList.add("right");
  }

  it("logged out: anchors the order form's Connect button, not the header Connect", () => {
    const doc = load("hyperliquid");
    expect(fixtureOf(hyperliquidAdapter.anchor?.(doc))).toBe("primary");
  });

  it("connected (inferred): the same button reading Place Order / Enable Trading", () => {
    for (const label of ["Place Order", "Enable Trading"]) {
      const doc = load("hyperliquid");
      relabel("primary", label);
      expect(fixtureOf(hyperliquidAdapter.anchor?.(doc)), label).toBe("primary");
    }
  });

  it("without the order-form button, the header Connect is not an anchor", () => {
    const doc = load("hyperliquid");
    byFixture("primary").remove();
    expect(hyperliquidAdapter.anchor?.(doc)).toBeNull();
  });

  it("reads long from the div toggle's 'left' class token", () => {
    const doc = load("hyperliquid");
    expect(hyperliquidAdapter.readTarget(doc, url)).toEqual({ kind: "perp", coin: "ETH", side: "long" });
  });

  it("reads short after the captured toggle to Sell / Short", () => {
    const doc = load("hyperliquid");
    selectShort();
    expect(hyperliquidAdapter.readTarget(doc, url)).toEqual({ kind: "perp", coin: "ETH", side: "short" });
    expect(fixtureOf(hyperliquidAdapter.anchor?.(doc))).toBe("primary");
  });

  it("no selection marker -> side undefined, never a guess", () => {
    const doc = load("hyperliquid");
    byFixture("slider").classList.remove("left");
    byFixture("long-label").classList.remove("left");
    expect(hyperliquidAdapter.readTarget(doc, url)).toEqual({ kind: "perp", coin: "ETH" });
  });
});

describe("polymarket (live capture)", () => {
  const EVENT = "friedrich-merz-out-as-chancellor-of-germany-before-2027";
  const MARKET = "friedrich-merz-out-as-chancellor-of-germany-before-2027";
  const marketUrl = new URL(`https://polymarket.com/event/${EVENT}/${MARKET}`);

  function selectNo() {
    for (const [name, on] of [["yes", false], ["no", true]] as const) {
      byFixture(name).setAttribute("aria-checked", String(on));
      byFixture(name).setAttribute("data-state", on ? "checked" : "unchecked");
    }
  }

  it("logged out: anchors the trade form's Trade button, not the Buy radio or the rows' Buy Yes/No", () => {
    const doc = load("polymarket");
    expect(fixtureOf(polymarketAdapter.anchor?.(doc))).toBe("primary");
  });

  it("connected (inferred): the .trading-button reading Buy Yes", () => {
    const doc = load("polymarket");
    byFixture("primary").textContent = "Buy Yes";
    expect(fixtureOf(polymarketAdapter.anchor?.(doc))).toBe("primary");
  });

  it("reads Yes from the checked outcome radio ('Yes21¢')", () => {
    const doc = load("polymarket");
    expect(polymarketAdapter.readTarget(doc, marketUrl)).toEqual({ kind: "prediction", slug: MARKET, outcomeLabel: "Yes", outcome: "yes" });
  });

  it("reads No after the captured toggle to No", () => {
    const doc = load("polymarket");
    selectNo();
    expect(polymarketAdapter.readTarget(doc, marketUrl)).toEqual({ kind: "prediction", slug: MARKET, outcomeLabel: "No", outcome: "no" });
  });

  it("event page without a market slug: event slug (backend decides single-market vs Pick a market)", () => {
    const doc = load("polymarket");
    expect(polymarketAdapter.readTarget(doc, new URL(`https://polymarket.com/event/${EVENT}`))).toEqual({ kind: "prediction", slug: EVENT, outcomeLabel: "Yes", outcome: "yes" });
  });

  it("event page with ?marketSlug= (links on polymarket.com use this form)", () => {
    const doc = load("polymarket");
    selectNo();
    const slug = "will-there-be-no-change-in-fed-interest-rates-after-the-october-2026-meeting-20260617190324031";
    const url = new URL(`https://polymarket.com/event/fed-decision-in-october-20260617190323537?marketSlug=${slug}`);
    expect(polymarketAdapter.match(url)).toBe(true);
    expect(polymarketAdapter.readTarget(doc, url)).toEqual({ kind: "prediction", slug, outcomeLabel: "No", outcome: "no" });
  });

  it("without the trade button, the rows' Buy Yes/No and the Buy radio are not anchors", () => {
    const doc = load("polymarket");
    byFixture("primary").remove();
    expect(polymarketAdapter.anchor?.(doc)).toBeNull();
  });
});
