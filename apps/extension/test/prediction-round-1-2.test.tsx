// @vitest-environment happy-dom
/**
 * Round 1.2: the prediction card gets a price, a state and an honest PnL column.
 *
 * The figures come from the re-recorded Polymarket fixtures, so a mapper or a render that drops
 * one fails here rather than shipping. Nothing in this round is allowed to invent a zero: every
 * absent field has an assertion that it reads as a dash.
 */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RECORD, sideTotals, type HolderRecord, type PmHolder } from "@tripwire/core";
import { CardSizeContext } from "../lib/ui/card-size";
import type { DepthResponse, PredictionMarket, PredictionPanel } from "../lib/api-types";

vi.mock("../lib/token-logo", () => ({ tokenLogoDataUrl: async () => null }));

const { PredictionBody } = await import("../lib/ui/PredictionBody");

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as T;
const GAMMA = read<Record<string, never>>("gammaMarket") as unknown as Record<string, string & number & boolean>;
const HOLDERS = read<{ data: PmHolder[] }>("pmTopHolders").data;
const BOOKS = read<Record<string, { bids: { price: string; size: string }[]; asks: { price: string; size: string }[] }>>("clobBook");

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
const tab = (c: HTMLDivElement, name: string) => [...c.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.includes(name))!;

/** The recorded Gamma market, mapped the way `toMarket` maps it on the backend. */
const MARKET: PredictionMarket = {
  id: String(GAMMA.id),
  question: String(GAMMA.question),
  slug: String(GAMMA.slug),
  state: "live",
  yesPrice: (Number(GAMMA.bestBid) + Number(GAMMA.bestAsk)) / 2,
  yesPriceSource: "book",
  bestBid: Number(GAMMA.bestBid),
  bestAsk: Number(GAMMA.bestAsk),
  spread: Number(GAMMA.spread),
  lastTradePrice: Number(GAMMA.lastTradePrice),
  oneDayPriceChange: Number(GAMMA.oneDayPriceChange),
  oneWeekPriceChange: null, // Gamma omits it on this market: it must read as a dash.
  liquidityUsd: Number(GAMMA.liquidityNum),
  volumeUsd: Number(GAMMA.volumeNum),
  volume24hUsd: Number(GAMMA.volume24hr),
  volume1wkUsd: Number(GAMMA.volume1wk),
  endDate: String(GAMMA.endDate),
  endDateIso: String(GAMMA.endDateIso),
  startDateIso: String(GAMMA.startDateIso),
  negRisk: Boolean(GAMMA.negRisk),
  clobTokenIds: JSON.parse(String(GAMMA.clobTokenIds)) as string[],
  description: String(GAMMA.description),
  groupItemTitle: String(GAMMA.groupItemTitle),
  eventTitle: "Bitcoin above ? on September 20",
  eventSlug: "bitcoin-above-on-september-20-2026",
  active: true,
  closed: false,
  acceptingOrders: true,
  umaResolutionStatuses: [],
  pricedAtIso: new Date(Date.now() - 120_000).toISOString(),
};

const record = (over: Partial<HolderRecord> = {}): HolderRecord => ({
  ...EMPTY_RECORD,
  pnlUsd: 34_523.67925399999,
  winRate: 0.12186379928315412,
  marketsWon: 68,
  marketsTraded: 558,
  walletAgeDays: 104,
  ...over,
});

function panelOf(over: Partial<PredictionPanel> = {}): PredictionPanel {
  const holders = HOLDERS.map((h, i) => ({
    ...h,
    key: h.address.toLowerCase(),
    record: i < 10 ? record() : null,
  }));
  return {
    market: MARKET,
    holders,
    sides: sideTotals(HOLDERS),
    recordsChecked: 10,
    recordsCap: 10,
    trades: read<{ data: PredictionPanel["trades"] }>("pmTrades").data,
    historical: false,
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

describe("1.2.1 / 1.2.2 the card states a price, a date and the market's own numbers", () => {
  it("prices Yes off the resting book and says where the number came from", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    expect(c.querySelector(".tw-price-value")!.textContent).toBe("91.8¢");
    expect(c.querySelector(".tw-price-change")!.textContent).toContain("+0.55¢");
    const source = c.querySelector(".tw-price-range")!.textContent!;
    expect(source).toContain("mid of the resting book");
    expect(source).toMatch(/as of .*ago/);
  });

  it("the compact card states six figures: what it costs to get in, how deep it is, when it settles", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    const labels = [...c.querySelectorAll(".tw-market-readouts dt")].map((d) => d.textContent);
    expect(labels).toEqual(["Bid", "Ask", "Spread", "24h volume", "Liquidity", "Resolves"]);
    const text = c.querySelector(".tw-market-readouts")!.textContent!;
    expect(text).toContain("91.1¢"); // bestBid
    expect(text).toContain("92.4¢"); // bestAsk
    expect(text).toContain("1.3¢"); // spread
    expect(text).toContain("$149K"); // 24h volume
    expect(text).toContain("$49.7K"); // liquidity
    // The hour comes from endDate. endDateIso is date-only and would read as midnight.
    expect(text).toContain("Sep 20, 16:00 UTC"); // the year is this one, so it is not spent on a tile
  });

  it("the expanded card states all thirteen, including the ones that would wrap at 440px", () => {
    const c = render(<PredictionBody panel={panelOf()} />, "expanded");
    const labels = [...c.querySelectorAll(".tw-market-readouts dt")].map((d) => d.textContent);
    expect(labels).toEqual([
      "Bid",
      "Ask",
      "Spread",
      "Last trade",
      "24h change",
      "7d change",
      "24h volume",
      "7d volume",
      "Total volume",
      "Liquidity",
      "Opened",
      "Resolves",
      "Multi-outcome",
    ]);
    const text = c.querySelector(".tw-market-readouts")!.textContent!;
    expect(text).toContain("89.8¢"); // last trade
    expect(text).toContain("Sep 13"); // opened: a date-only value keeps no invented hour
    expect(text).not.toContain("Sep 13, 00:00");
  });

  it("a field Gamma omits is a dash, and never a zero", () => {
    const c = render(<PredictionBody panel={panelOf()} />, "expanded");
    const items = [...c.querySelectorAll(".tw-readouts div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]);
    expect(items).toContainEqual(["7d change", "—"]);
    expect(items.find(([l]) => l === "7d change")![1]).not.toBe("0.0¢");
    // And the rest of the card is still there.
    expect(c.querySelector(".tw-price-value")!.textContent).toBe("91.8¢");
  });

  it("a market with no price at all dashes rather than printing 0¢", () => {
    const blind: PredictionMarket = { ...MARKET, yesPrice: null, yesPriceSource: null, bestBid: null, bestAsk: null, spread: null, lastTradePrice: null, oneDayPriceChange: null };
    const c = render(<PredictionBody panel={panelOf({ market: blind })} />);
    expect(c.querySelector(".tw-price-value")!.textContent).toBe("—");
    expect(c.querySelector(".tw-price-range")!.textContent).toContain("price unavailable");
  });

  it("the resolution prose is third-party text behind a disclosure, never markup", () => {
    const hostile = { ...MARKET, description: 'Resolves <img src=x onerror="alert(1)"> if <b>BTC</b> is above.' };
    const c = render(<PredictionBody panel={panelOf({ market: hostile })} />);
    const toggle = c.querySelector<HTMLButtonElement>(".tw-disclosure")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(c.querySelector(".tw-pm-rules-text")).toBeNull();
    click(toggle);
    const prose = c.querySelector(".tw-pm-rules-text")!;
    expect(prose.textContent).toContain("<b>BTC</b>");
    expect(prose.querySelector("img")).toBeNull();
    expect(prose.querySelector("b")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("the market's own label inside its event is shown, because the question does not carry it", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    expect(c.querySelector(".tw-pm-group")!.textContent).toBe("80,000");
  });
});

describe("1.2.3 market state", () => {
  it("a settled market wears a resolved pill and says its evidence is history", () => {
    const c = render(<PredictionBody panel={panelOf({ market: { ...MARKET, state: "resolved", closed: true }, historical: true, recordsChecked: null })} />);
    const pill = c.querySelector(".tw-pm-state")!;
    expect(pill.getAttribute("data-state")).toBe("resolved");
    expect(pill.textContent).toContain("Resolved");
    expect(pill.textContent).toContain("history, not a live read");
    click(tab(c, "Trades"));
    expect(shown(c).textContent).toContain("Trades before settlement");
  });

  it("a paused market is paused, not resolved", () => {
    const c = render(<PredictionBody panel={panelOf({ market: { ...MARKET, state: "paused", acceptingOrders: false } })} />);
    const pill = c.querySelector(".tw-pm-state")!;
    expect(pill.getAttribute("data-state")).toBe("paused");
    expect(pill.textContent).toContain("Not accepting orders".replace("accepting", "taking"));
  });

  it("a live market wears no pill at all", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    expect(c.querySelector(".tw-pm-state")).toBeNull();
  });

  it("an empty UMA status list says nothing rather than 'unresolved'", () => {
    const c = render(<PredictionBody panel={panelOf()} />);
    expect(c.textContent).not.toContain("UMA resolution");
    const withStatus = render(<PredictionBody panel={panelOf({ market: { ...MARKET, umaResolutionStatuses: ["proposed"] } })} />);
    expect(withStatus.textContent).toContain("UMA resolution");
  });
});

describe("1.2.4 the holder PnL column says which PnL it is", () => {
  it("the compact card shows this market's result, with its own header", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="holders" />);
    const head = [...shown(c).querySelectorAll("th")].map((t) => t.textContent);
    expect(head).toEqual(["Wallet", "Side", "Size", "Entry", "PnL here"]);
    const first = [...shown(c).querySelectorAll("tbody tr")][0]!;
    expect(first.querySelectorAll("td")[4]!.textContent).toBe("−$744.52");
    expect(first.querySelectorAll("td")[4]!.getAttribute("data-sign")).toBe("neg");
    expect(shown(c).textContent).toContain("expand the card");
  });

  it("the expanded card adds the current price and the wallet's settled record, under distinct headers", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="holders" />, "expanded");
    const head = [...shown(c).querySelectorAll("th")].map((t) => t.textContent);
    expect(head).toEqual(["Wallet", "Side", "Size", "Entry", "Now", "PnL here", "Settled record"]);
    const first = [...shown(c).querySelectorAll("tbody tr")][0]!;
    const cells = first.querySelectorAll("td");
    expect(cells[3]!.textContent).toBe("2.8¢"); // avg entry
    expect(cells[4]!.textContent).toBe("0.15¢"); // current price, at sub-cent precision
    expect(cells[5]!.textContent).toBe("−$744.52"); // this market
    expect(cells[6]!.textContent).toContain("+$34.5K"); // settled, all markets
    expect(cells[6]!.textContent).toContain("68 of 558 won");
    expect(cells[6]!.textContent).toContain("12%");
  });

  it("a holder with no record shows a dash there, never a zero", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="holders" />, "expanded");
    const rows = [...shown(c).querySelectorAll("tbody tr")];
    expect(rows[19]!.querySelectorAll("td")[6]!.textContent).toBe("—");
  });

  it("every figure is in tabular numerals", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="holders" />, "expanded");
    const first = [...shown(c).querySelectorAll("tbody tr")][0]!;
    for (const i of [2, 3, 4, 5]) expect(first.querySelectorAll("td")[i]!.className).toContain("tw-fig");
    expect(first.querySelectorAll("td")[6]!.querySelector(".tw-fig")).not.toBeNull();
  });
});

describe("1.2.6 side totals name the sample, never the market", () => {
  it("shows the money on each side and the top ten's share of it", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="winners" />);
    const text = shown(c).textContent!;
    expect(text).toContain("Where the sampled money sits");
    expect(text).toContain("Yes side");
    expect(text).toContain("No side");
    expect(text).toContain("Top 10 share");
    expect(text).toContain("largest tracked holders this market returned");
    expect(text).toContain("not of Yes, and not of the market");
  });

  it("says how many records it bought and what a missing record means", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="winners" />);
    const text = shown(c).textContent!;
    expect(text).toContain("Settled records bought for the");
    expect(text).toContain("counts for nothing, never as a loss");
  });

  it("a sample with nothing priceable renders no side section rather than zeros", () => {
    const c = render(<PredictionBody panel={panelOf({ sides: sideTotals([]) })} initialTab="winners" />);
    expect(shown(c).textContent).not.toContain("Where the sampled money sits");
  });
});

describe("1.2.7 the book tab is free and two-sided", () => {
  const ids = Object.keys(BOOKS);
  const level = (p: string, s: string, cum: number) => ({ price: Number(p), size: Number(s), cumulative: cum });
  const bookFor = (outcome: string, id: string) => {
    const raw = BOOKS[id]!;
    const bids = [...raw.bids].sort((a, b) => Number(b.price) - Number(a.price)).slice(0, 15);
    const asks = [...raw.asks].sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 15);
    let cb = 0;
    let ca = 0;
    return {
      outcome,
      bids: bids.map((l) => level(l.price, l.size, (cb += Number(l.size)))),
      asks: asks.map((l) => level(l.price, l.size, (ca += Number(l.size)))),
      bestBid: Number(bids[0]!.price),
      bestAsk: Number(asks[0]!.price),
      spread: Number(asks[0]!.price) - Number(bids[0]!.price),
    };
  };
  const depth = {
    data: {
      credits: 0,
      skipped: [],
      predictionBook: { books: [bookFor("Yes", ids[0]!), bookFor("No", ids[1]!)], snapshotIso: "2026-09-20T12:00:56.225Z", errors: [] },
    } as unknown as DepthResponse,
    loading: [],
    failed: {},
  };

  it("prints its price as free, not as a credit", () => {
    const c = render(<PredictionBody panel={panelOf()} depth={depth} />, "expanded");
    expect(tab(c, "Book").textContent).toContain("free");
    expect(tab(c, "Book").textContent).not.toContain("credit");
  });

  it("draws both outcomes with both sides and a real spread", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="book" depth={depth} />, "expanded");
    const sections = [...shown(c).querySelectorAll(".tw-section")];
    expect(sections.map((s) => s.querySelector(".tw-section-title span")!.textContent)).toEqual(["Yes", "No"]);
    for (const s of sections) {
      expect(s.querySelector('[data-side="bid"]')!.children.length).toBeGreaterThan(0);
      expect(s.querySelector('[data-side="ask"]')!.children.length).toBeGreaterThan(0);
      expect(s.querySelector(".tw-note")!.textContent).toContain("Spread");
    }
  });

  it("the depth bar is scaled on cumulative size, so it grows away from the touch", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="book" depth={depth} />, "expanded");
    const yes = [...shown(c).querySelectorAll(".tw-section")][0]!;
    const bars = [...yes.querySelectorAll('[data-side="bid"] .tw-book-bar')].map((b) => parseFloat((b as HTMLElement).style.width));
    expect(bars.length).toBeGreaterThan(1);
    for (let i = 1; i < bars.length; i++) expect(bars[i]!).toBeGreaterThan(bars[i - 1]!);
    expect(Math.max(...bars)).toBeLessThanOrEqual(100);
    expect(shown(c).textContent).toContain("resting across the shown bids");
  });

  it("names its source and states that it costs nothing", () => {
    const c = render(<PredictionBody panel={panelOf()} initialTab="book" depth={depth} />, "expanded");
    expect(shown(c).textContent).toContain("Polymarket CLOB");
    expect(shown(c).textContent).toContain("no Nansen credit");
    // The book states its own read time, because the price above it is Gamma's hourly snapshot.
    expect(shown(c).textContent).toMatch(/Book read .*ago/);
    expect(shown(c).textContent).toContain("the two touches can differ");
  });

  it("an empty book on a settled market says so, and does not guess", () => {
    const empty = { data: { credits: 0, skipped: [], predictionBook: { books: null, snapshotIso: null, errors: [] } } as unknown as DepthResponse, loading: [], failed: {} };
    const c = render(<PredictionBody panel={panelOf({ historical: true })} initialTab="book" depth={empty} />, "expanded");
    expect(shown(c).textContent).toContain("This market has settled, so nothing rests on its book.");
    const live = render(<PredictionBody panel={panelOf()} initialTab="book" depth={empty} />, "expanded");
    expect(shown(live).textContent).toContain("Nothing is resting on this market’s book right now.");
  });
});
