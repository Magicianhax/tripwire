// @vitest-environment happy-dom
/**
 * Round 2.2 — multi-market events and multi-outcome markets, on the card and at the adapter.
 *
 * The fixtures are the ones Round 2.2 recorded for free from Polymarket's public Gamma API:
 * `gammaMarketOutcomes.json` is market 4384973, "Spread: BAL (-8.5)", whose outcomes are
 * `["BAL", "NO"]` — NO is New Orleans, not the no side — and `gammaEvent.json` is the recorded
 * Bitcoin strike ladder, which is what the event picker draws.
 *
 * The rule under all of it: the page decides which market and which outcome is being traded. The
 * card can show the others, and showing them never changes the verdict.
 */
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sideTotals, type PmHolder } from "@tripwire/core";
import { polymarketAdapter } from "../lib/adapters/polymarket";
import { CardSizeContext } from "../lib/ui/card-size";
import type { MarketOption, PredictionMarket, PredictionPanel } from "../lib/api-types";

vi.mock("../lib/token-logo", () => ({ tokenLogoDataUrl: async () => null }));

const { PredictionBody } = await import("../lib/ui/PredictionBody");

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as T;
type Gamma = Record<string, unknown> & { id: string; slug: string; question: string; outcomes: string };
const OUTCOMES_MARKET = read<Gamma>("gammaMarketOutcomes");
const EVENT_MARKETS = read<{ markets: Gamma[] }[]>("gammaEvent")[0]!.markets;
const VENUE_FIXTURES = path.join(process.cwd(), "test", "fixtures", "venues");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
function render(node: React.ReactNode, size: "compact" | "expanded" = "compact"): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<CardSizeContext.Provider value={size}>{node}</CardSizeContext.Provider>));
  return container;
}
const shown = (c: HTMLDivElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const click = (el: Element) => act(() => (el as HTMLElement).click());
const tab = (c: HTMLDivElement, name: string) => [...c.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.includes(name));

const holder = (side: string, size: number, price: number, address: string, pnl: number | null): PmHolder & { key: string; record: { pnlUsd: number | null; winRate: null; marketsWon: null; marketsTraded: null; walletAgeDays: null; settledMarkets: null } | null } => ({
  market_id: "4384973",
  address,
  owner_address: "0x",
  side,
  position_size: size,
  avg_entry_price: price,
  current_price: price,
  unrealized_pnl_usd: 0,
  key: address,
  record: pnl === null ? null : { pnlUsd: pnl, winRate: null, marketsWon: null, marketsTraded: null, walletAgeDays: null, settledMarkets: null },
});

/** The recorded ["BAL", "NO"] market, mapped the way the backend maps it. */
const BAL_NO: string[] = JSON.parse(OUTCOMES_MARKET.outcomes) as string[];
const MARKET: PredictionMarket = {
  id: String(OUTCOMES_MARKET.id),
  question: String(OUTCOMES_MARKET.question),
  slug: String(OUTCOMES_MARKET.slug),
  state: "live",
  outcomes: BAL_NO,
  outcomePrices: (JSON.parse(String(OUTCOMES_MARKET.outcomePrices)) as string[]).map(Number),
  yesPrice: (Number(OUTCOMES_MARKET.bestBid) + Number(OUTCOMES_MARKET.bestAsk)) / 2,
  yesPriceSource: "book",
  bestBid: Number(OUTCOMES_MARKET.bestBid),
  bestAsk: Number(OUTCOMES_MARKET.bestAsk),
  spread: Number(OUTCOMES_MARKET.spread),
  lastTradePrice: Number(OUTCOMES_MARKET.lastTradePrice),
  oneDayPriceChange: null,
  oneWeekPriceChange: null,
  liquidityUsd: Number(OUTCOMES_MARKET.liquidityNum),
  volumeUsd: Number(OUTCOMES_MARKET.volumeNum),
  volume24hUsd: Number(OUTCOMES_MARKET.volume24hr),
  volume1wkUsd: null,
  endDate: String(OUTCOMES_MARKET.endDate),
  endDateIso: null,
  startDateIso: null,
  negRisk: false,
  clobTokenIds: null,
  description: null,
  groupItemTitle: typeof OUTCOMES_MARKET.groupItemTitle === "string" ? OUTCOMES_MARKET.groupItemTitle : null,
  eventTitle: "Saints vs. Ravens",
  eventSlug: "nfl-no-bal-2026-09-20",
  active: true,
  closed: false,
  acceptingOrders: true,
  umaResolutionStatuses: [],
  pricedAtIso: new Date(Date.now() - 60_000).toISOString(),
};

const HOLDERS = [holder("BAL", 100, 0.5, "0xaaa", 1), holder("NO", 300, 0.5, "0xbbb", 1)];

/** A picker row from the recorded strike ladder, mapped the way `toOption` maps it. */
const option = (m: Gamma): MarketOption => ({
  id: String(m.id),
  slug: String(m.slug),
  question: String(m.question),
  groupItemTitle: typeof m.groupItemTitle === "string" ? m.groupItemTitle : null,
  outcomes: JSON.parse(String(m.outcomes)) as string[],
  outcomePrices: (JSON.parse(String(m.outcomePrices)) as string[]).map(Number),
  volume24hUsd: typeof m.volume24hr === "number" ? m.volume24hr : null,
  liquidityUsd: typeof m.liquidityNum === "number" ? m.liquidityNum : null,
  endDate: typeof m.endDate === "string" ? m.endDate : null,
  state: "live",
});
const OPTIONS = EVENT_MARKETS.map(option);

function panelOf(over: Partial<PredictionPanel> = {}): PredictionPanel {
  return {
    market: MARKET,
    holders: HOLDERS,
    sides: sideTotals(HOLDERS, BAL_NO),
    recordsChecked: 2,
    recordsCap: 10,
    trades: null,
    historical: false,
    outcomeIndex: 1,
    targetOutcome: "NO",
    unknownOutcome: null,
    options: null,
    optionsTotal: null,
    eventSlug: MARKET.eventSlug,
    errors: [],
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

describe("2.2 — the card speaks the market's own outcome names", () => {
  it("labels the headline price with outcome 0, never with the word Yes", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    expect(c.querySelector(".tw-pm-outcome")!.textContent).toBe("BAL");
    expect(c.querySelector(".tw-price-now")!.textContent).not.toContain("Yes");
  });

  it("names the outcome set and which one the page has selected", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    const line = [...c.querySelectorAll(".tw-note")].map((n) => n.textContent!).find((t) => t.startsWith("Outcomes:"))!;
    expect(line).toContain("BAL · NO");
    expect(line).toContain("The page has NO selected.");
  });

  it("with nothing selected it says the market is unchecked rather than defaulting to the first outcome", () => {
    const c = render(<PredictionBody panel={panelOf({ outcomeIndex: null, targetOutcome: null })} />);
    const line = [...c.querySelectorAll(".tw-note")].map((n) => n.textContent!).find((t) => t.startsWith("Outcomes:"))!;
    expect(line).toContain("Nothing is selected on the page, so this market is unchecked.");
    expect(line).not.toContain("The page has");
  });

  it("an outcome the market does not list is named, and the card stays unchecked", () => {
    const c = render(<PredictionBody panel={panelOf({ outcomeIndex: null, targetOutcome: null, unknownOutcome: "Over" })} />);
    const line = [...c.querySelectorAll(".tw-note")].map((n) => n.textContent!).find((t) => t.startsWith("Outcomes:"))!;
    expect(line).toContain("The page offered Over, which is not one of them");
  });
});

describe("2.2 — proven winners by outcome", () => {
  it("splits on the market's teams, and mint is the outcome the page is buying", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="winners" />);
    const legend = [...shown(c).querySelectorAll(".tw-longshort-legend span")].map((s) => [s.textContent, s.getAttribute("data-side")]);
    expect(legend).toEqual([
      ["BAL 25%", "short"],
      ["NO 75%", "long"],
    ]);
    expect(shown(c).querySelector(".tw-longshort-bar")!.getAttribute("aria-label")).toBe("Proven winners: BAL 25%, NO 75%");
  });

  it("the sampled-money tiles are named after the outcomes, not Yes and No", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="winners" />);
    const labels = [...shown(c).querySelectorAll(".tw-readouts dt")].map((d) => d.textContent);
    // "Ravens side" reads wrong, so a named outcome is just its name. Round 1.2's Yes/No card
    // keeps "Yes side" and "No side".
    expect(labels).toEqual(["BAL", "NO", "Other sides", "Top 10 share"]);
    expect(shown(c).textContent).not.toContain("Yes side");
    expect(shown(c).textContent).toContain("Not of BAL, and not of the market");
  });

  it("with no outcome selected it asks for one in the market's own words", () => {
    const c = render(<PredictionBody panel={panelOf({ outcomeIndex: null, targetOutcome: null, holders: HOLDERS.map((h) => ({ ...h, record: null })) })} initialTab="winners" />);
    expect(shown(c).textContent).toContain("Select BAL or NO on the page");
  });

  // M-1: zero is a measurement. "—" is the absence of one, and they are different claims.
  it("prints a measured zero on Other sides rather than an unknown dash", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="winners" />);
    const tiles = [...shown(c).querySelectorAll(".tw-readouts dt")].map((d, i) => [d.textContent, [...shown(c).querySelectorAll(".tw-readouts dd")][i]?.textContent]);
    const other = tiles.find(([label]) => label === "Other sides")!;
    // The fixture's holders all sit on a listed outcome, so the unmatched total is a real zero.
    expect(other[1]).not.toBe("—");
    expect(other[1]).toContain("$0");
  });

  it("proven-winner money on a side the market does not list is reported, not folded in", () => {
    const stray = [...HOLDERS, holder("Draw", 1_000, 0.5, "0xccc", 5)];
    const c = render(<PredictionBody panel={panelOf({ holders: stray, sides: sideTotals(stray, BAL_NO) })} initialTab="winners" />);
    expect(shown(c).textContent).toContain("sits on a side this market does not list");
    // The bar itself still only has the two real outcomes.
    expect(shown(c).querySelectorAll(".tw-longshort-bar i").length).toBe(2);
  });
});

describe("2.2 — the event picker", () => {
  const withOptions = (over: Partial<PredictionPanel> = {}) => panelOf({ options: OPTIONS, optionsTotal: OPTIONS.length, ...over });

  it("is a tab on a resolved market, and the tab is absent when there are no siblings", () => {
    const c = render(<PredictionBody panel={withOptions()} />);
    expect(tab(c, "Markets")).toBeTruthy();
    const alone = render(<PredictionBody panel={panelOf()} />);
    expect(tab(alone, "Markets")).toBeUndefined();
  });

  it("draws each market with its prices, volume, liquidity and resolution date", () => {
    const c = render(<PredictionBody panel={withOptions()} initialTab="markets" />);
    const first = shown(c).querySelector(".tw-market-option")!;
    expect(first.querySelector(".tw-market-heading b")!.textContent).toBe(OPTIONS[0]!.groupItemTitle);
    const metrics = [...first.querySelectorAll(".tw-market-metrics dt")].map((d) => d.textContent);
    expect(metrics).toEqual(["24h volume", "Liquidity", "Resolves"]);
    // Prices are named per outcome, so a reader never has to assume which side a number is.
    expect(first.querySelector(".tw-meta")!.textContent).toMatch(/^Yes \d/);
  });

  it("links each row at the page's own market selector, in a new tab", () => {
    const c = render(<PredictionBody panel={withOptions()} initialTab="markets" />);
    const link = shown(c).querySelector<HTMLAnchorElement>(".tw-market-option a")!;
    expect(link.getAttribute("href")).toBe(`https://polymarket.com/event/nfl-no-bal-2026-09-20?marketSlug=${encodeURIComponent(OPTIONS[0]!.slug)}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("says plainly that it is evidence and not a verdict", () => {
    const c = render(<PredictionBody panel={withOptions()} initialTab="markets" />);
    const note = shown(c).textContent!;
    expect(note).toContain("Tripwire checks the market this page has selected");
    expect(note).toContain("this card’s verdict does not change");
    expect(note).toContain("Polymarket’s cached snapshot");
  });

  // M-2: the ambiguous-event branch exists because the page selected nothing, so it cannot
  // explain itself by naming "the market this page has selected".
  it("does not claim a selected market on the branch where nothing is selected", () => {
    const c = render(<PredictionBody panel={panelOf({ market: null, holders: null, sides: null, options: OPTIONS, optionsTotal: OPTIONS.length, eventSlug: "an-event", outcomeIndex: null, targetOutcome: null })} />);
    const note = c.querySelector(".tw-note")!.textContent!;
    expect(note).not.toContain("the market this page has selected");
    expect(note).toContain("hasn’t selected one market");
    expect(note).toContain("Opening one checks it on its own page");
  });

  it("paginates rather than dropping rows, and never draws a 329-row wall", () => {
    const c = render(<PredictionBody panel={withOptions()} initialTab="markets" />);
    expect(shown(c).querySelectorAll(".tw-market-option").length).toBe(3);
    const pager = shown(c).querySelector(".tw-pager")!;
    expect(pager.textContent).toContain(`of ${OPTIONS.length}`);
    click(pager.querySelector('[aria-label="Next page"]')!);
    expect(shown(c).querySelector(".tw-market-heading b")!.textContent).toBe(OPTIONS[3]!.groupItemTitle);
  });

  it("states the total when the backend capped the list", () => {
    const c = render(<PredictionBody panel={withOptions({ optionsTotal: 328 })} initialTab="markets" />);
    expect(shown(c).querySelector(".tw-section-aside")!.textContent).toBe(`${OPTIONS.length} of 328 by 24h volume`);
    expect(shown(c).textContent).toContain(`the ${328 - OPTIONS.length} lowest-volume markets of this event are not listed`);
  });

  it("is the whole body when the slug was an ambiguous event, with no evidence tabs to fake", () => {
    const c = render(<PredictionBody panel={panelOf({ market: null, holders: null, sides: null, options: OPTIONS, optionsTotal: OPTIONS.length, eventSlug: "an-event", outcomeIndex: null, targetOutcome: null })} />);
    expect(c.querySelector('[role="tab"]')).toBeNull();
    expect(c.querySelector(".tw-market-option")).not.toBeNull();
  });

  it("a marketless card with no options keeps its evidence tabs and their empty states", () => {
    const c = render(<PredictionBody panel={panelOf({ market: null, holders: null, sides: null, outcomeIndex: null, targetOutcome: null })} />);
    expect([...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Proven winners", "Holders", "Trades"]);
  });
});

describe("2.2 — the trades tab states the quantity and the price", () => {
  const trades = [{ timestamp: new Date(Date.now() - 60_000).toISOString(), taker_action: "Buy", side: "NO", size: 1_234, price: 0.785, usdc_value: 968.69 }];

  it("renders size at price beside the dollar figure", () => {
    const c = render(<PredictionBody panel={panelOf({ trades })} initialTab="trades" />);
    const row = shown(c).querySelector(".tw-trade-list li")!;
    expect(row.textContent).toContain("Buy NO");
    expect(row.textContent).toContain("1,234 @ 78.5¢");
    expect(row.textContent).toContain("$969");
  });

  it("states the window it is a slice of, never 'the market'", () => {
    const c = render(<PredictionBody panel={panelOf({ trades })} initialTab="trades" />);
    expect(shown(c).textContent).toContain("trades this market returned, newest first");
    expect(shown(c).textContent).toContain("Not the market’s whole tape");
  });
});

describe("2.2 — the adapter reads an outcome it has never seen before", () => {
  // The same fixture-loading harness as adapters-live.test.ts: our own committed capture, not
  // host-page content, and the adapters need a live document to read selection state from.
  function load(): Document {
    document.body.innerHTML = readFileSync(path.join(VENUE_FIXTURES, "polymarket.html"), "utf8");
    return document;
  }
  const byFixture = (name: string) => document.querySelector<HTMLElement>(`[data-fixture="${name}"]`)!;
  /** The live outcome button renders its name and its price as two sibling spans. */
  const rename = (name: string, label: string, price: string) => {
    byFixture(name).replaceChildren();
    for (const text of [label, price]) {
      const outer = document.createElement("span");
      const inner = document.createElement("span");
      inner.textContent = text;
      outer.append(inner);
      byFixture(name).append(outer);
    }
  };
  const url = new URL("https://polymarket.com/event/nfl-no-bal-2026-09-20?marketSlug=nfl-no-bal-2026-09-20-spread-home-8pt5");

  it("reads BAL off the selected control and sets no Yes/No flag", () => {
    const doc = load();
    rename("yes", "BAL", "62¢");
    rename("no", "NO", "38¢");
    expect(polymarketAdapter.readTarget(doc, url)).toEqual({ kind: "prediction", slug: "nfl-no-bal-2026-09-20-spread-home-8pt5", outcomeLabel: "BAL" });
  });

  it("reads NO as the page's word, and never as the legacy no flag", () => {
    const doc = load();
    rename("yes", "BAL", "62¢");
    rename("no", "NO", "38¢");
    byFixture("yes").setAttribute("aria-checked", "false");
    byFixture("yes").setAttribute("data-state", "unchecked");
    byFixture("no").setAttribute("aria-checked", "true");
    byFixture("no").setAttribute("data-state", "checked");
    const target = polymarketAdapter.readTarget(doc, url)!;
    expect(target).toEqual({ kind: "prediction", slug: "nfl-no-bal-2026-09-20-spread-home-8pt5", outcomeLabel: "NO" });
    // This is the whole trap: the flag would have said "the no side" for New Orleans.
    expect("outcome" in target).toBe(false);
  });

  it("keeps the price out of the label, whether it is a sibling span or run onto the text", () => {
    const doc = load();
    rename("yes", "LGD Gaming", "66.5¢");
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ outcomeLabel: "LGD Gaming" });
    byFixture("yes").textContent = "Vitality41¢";
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ outcomeLabel: "Vitality" });
  });

  it("still finds the trade button and the outcome group when neither outcome is Yes or No", () => {
    const doc = load();
    rename("yes", "Ravens", "66¢");
    rename("no", "Saints", "34¢");
    // The group id is gone, so only the `.trading-button` rule can find it.
    document.getElementById("outcome-buttons")!.removeAttribute("id");
    expect(polymarketAdapter.anchor?.(doc)?.getAttribute("data-fixture")).toBe("primary");
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ outcomeLabel: "Ravens" });
  });

  it("never reads the Buy/Sell control as an outcome", () => {
    const doc = load();
    rename("yes", "Ravens", "66¢");
    rename("no", "Saints", "34¢");
    document.getElementById("outcome-buttons")!.removeAttribute("id");
    expect(polymarketAdapter.readTarget(doc, url)).toMatchObject({ outcomeLabel: "Ravens" });
    expect(polymarketAdapter.readTarget(doc, url)).not.toMatchObject({ outcomeLabel: "Buy" });
  });

  it("with nothing selected it reports no outcome at all rather than the first one", () => {
    const doc = load();
    rename("yes", "Ravens", "66¢");
    rename("no", "Saints", "34¢");
    for (const name of ["yes", "no"]) {
      byFixture(name).setAttribute("aria-checked", "false");
      byFixture(name).setAttribute("data-state", "unchecked");
    }
    expect(polymarketAdapter.readTarget(doc, url)).toEqual({ kind: "prediction", slug: "nfl-no-bal-2026-09-20-spread-home-8pt5" });
  });
});
