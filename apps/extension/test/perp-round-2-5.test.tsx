// @vitest-environment happy-dom
/**
 * Round 2.5: perp depth.
 *
 * Four of the six items here are render rules that no backend test can reach — a column that
 * exists only in the expanded card, a countdown that has to come from the reader's clock rather
 * than from a cached response, a cap line that must stay silent on a null, and two priced
 * buttons that must not fire until they are pressed.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OiHistorySeries, PerpPosition, PerpScreenerRow, PerpVenueQuote } from "@tripwire/core";
import type { DepthResponse, PerpLadderResponse, PerpPanel, PerpWinRateResponse } from "../lib/api-types";
import cohortLadder from "../../../fixtures/nansen/perpPositionsCohort.json";

const perpLadder = vi.fn();
const perpWinRate = vi.fn();
vi.mock("../lib/api", () => ({ perpLadder: (...a: unknown[]) => perpLadder(...a), perpWinRate: (...a: unknown[]) => perpWinRate(...a) }));

// The perp Chart tab mounts lightweight-charts, which happy-dom has no canvas engine for.
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  })),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), markers: vi.fn(() => []) })),
  AreaSeries: "AreaSeries",
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

const { PerpBody } = await import("../lib/ui/PerpBody");
const { CardSizeContext } = await import("../lib/ui/card-size");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}
const expanded = (node: React.ReactNode) => render(<CardSizeContext.Provider value="expanded">{node}</CardSizeContext.Provider>);
const shown = (c: HTMLDivElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const section = (c: HTMLDivElement, label: string) => shown(c).querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;
const button = (c: HTMLDivElement, text: string) =>
  [...c.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text))!;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const winRateButton = (c: HTMLDivElement) => [...c.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Win rate"))!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

const screener = (over: Partial<PerpScreenerRow> = {}): PerpScreenerRow => ({
  token_symbol: "ETH",
  mark_price: 2_450,
  funding: 0.0000125,
  open_interest: 1_000_000,
  current_smart_money_position_longs_usd: 5_000_000,
  current_smart_money_position_shorts_usd: -2_000_000,
  smart_money_longs_count: 12,
  smart_money_shorts_count: 4,
  ...over,
});

const panelOf = (over: Partial<PerpPanel> = {}): PerpPanel => ({
  coin: "ETH",
  mode: "panel",
  screener: screener(),
  positions: null,
  positionsIsLastPage: null,
  positionsReturned: null,
  trades: null,
  cohorts: null,
  cohortsAtIso: null,
  tradesError: null,
  cohortsError: null,
  errors: [],
  ...over,
});

const position = (over: Partial<PerpPosition> = {}): PerpPosition => ({
  address: "0x1111111111111111111111111111111111111111",
  address_label: "Smart trader",
  side: "Long",
  position_value_usd: 1_000_000,
  position_size: 400,
  leverage: "5X",
  leverage_type: "cross",
  entry_price: 2_300,
  mark_price: 2_450,
  liquidation_price: 2_200,
  funding_usd: 0,
  upnl_usd: 10_000,
  ...over,
});

const venue = (over: Partial<PerpVenueQuote> = {}): PerpVenueQuote => ({
  venue: "binance",
  symbol: "ETHUSDT",
  markPrice: 2_450,
  funding: { raw: 0.0000482, intervalHours: 8, per8h: 0.0000482, annualPct: 5.3 },
  openInterestUsd: 5_600_000_000,
  volume24hUsd: 6_300_000_000,
  longAccountShare: 0.54,
  indexPrice: 2_451.42,
  basisBps: -3.9,
  nextFundingMs: null,
  fundingCap: null,
  error: null,
  ...over,
});

const depthWith = (over: Partial<DepthResponse>): { data: DepthResponse; loading: never[]; failed: Record<string, string> } => ({
  data: { credits: 0, skipped: [], ...over } as DepthResponse,
  loading: [],
  failed: {},
});

const oiSeries = (points: { timeMs: number; oiUsd: number }[]): OiHistorySeries => ({ venue: "binance", symbol: "ETHUSDT", period: "5m", points });

// --- 2.5.1 the basis column -----------------------------------------------------------------

describe("2.5.1 one new column, and only where there is room for it", () => {
  const venues = { rows: [venue(), venue({ venue: "dydx", symbol: "ETH-USD", basisBps: null, indexPrice: null })], unmapped: [], errors: [] };

  it("keeps the compact card at the six columns it already had", () => {
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: venues })} />);
    const headers = [...section(c, "Funding & OI across venues").querySelectorAll("thead th")].map((h) => h.textContent);
    expect(headers).toEqual(["Venue", "Funding 8h", "Annualised", "Open interest", "24h volume", "Long accts"]);
  });

  it("adds Basis only in the expanded card, and leaves the venues that publish one price blank", () => {
    const c = expanded(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: venues })} />);
    const table = section(c, "Funding & OI across venues");
    expect([...table.querySelectorAll("thead th")].map((h) => h.textContent)).toContain("Basis bps");
    const cells = [...table.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[2]!.textContent);
    // Binance: −3.9 bps against its own index. dYdX: an oracle with no mark, so a dash.
    expect(cells[0]).toBe("−3.9");
    expect(cells[1]).toBe("—");
    // The note names what the number is measured against, per venue.
    expect(table.textContent).toContain("mark against each venue");
    expect(table.textContent).toContain("OKX and dYdX publish only one of the two");
  });

  it("does not print a 24h change column at all", () => {
    // Deliberate: the coin moves the same on every venue, so five near-identical cells would be
    // noise in a table that is already six columns wide, and the card states it once elsewhere.
    const c = expanded(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: venues })} />);
    expect([...section(c, "Funding & OI across venues").querySelectorAll("thead th")].map((h) => h.textContent)).not.toContain("24h change");
  });
});

// --- 2.5.2 the funding countdown --------------------------------------------------------------

describe("2.5.2 the funding countdown", () => {
  it("counts down beside the venue's own interval", () => {
    // A half-minute of headroom, so the assertion is about the label and not about how long
    // the render took: the countdown floors, as it must, rather than rounding a minute up.
    const rows = [venue({ nextFundingMs: Date.now() + 2 * 3_600_000 + 30 * 60_000 + 30_000 })];
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: { rows, unmapped: [], errors: [] } })} />);
    expect(section(c, "Funding & OI across venues").querySelector(".tw-venue-interval")!.textContent).toBe("8h · in 2h 30m");
  });

  it("says nothing for a venue that does not publish one", () => {
    const rows = [venue({ venue: "dydx", symbol: "ETH-USD", nextFundingMs: null, funding: { raw: 0, intervalHours: 1, per8h: 0, annualPct: 0 } })];
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: { rows, unmapped: [], errors: [] } })} />);
    // The interval is still stated; the countdown is simply absent, not guessed from the hour.
    expect(section(c, "Funding & OI across venues").querySelector(".tw-venue-interval")!.textContent).toBe("1h");
  });

  it("mentions a funding cap only when the rate is actually near it", () => {
    const near = venue({ venue: "bybit", symbol: "ETHUSDT", funding: { raw: 0.003, intervalHours: 8, per8h: 0.003, annualPct: 328 }, fundingCap: { lower: -0.00333, upper: 0.00333 } });
    const far = venue({ venue: "okx", symbol: "ETH-USDT-SWAP", funding: { raw: 0.0000479, intervalHours: 8, per8h: 0.0000479, annualPct: 5.2 }, fundingCap: { lower: -0.0075, upper: 0.0075 } });
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: { rows: [near, far], unmapped: [], errors: [] } })} />);
    const caps = [...section(c, "Funding & OI across venues").querySelectorAll(".tw-venue-cap")].map((e) => e.textContent);
    expect(caps).toEqual(["90% of its 0.333% cap"]);
  });
});

// --- 2.5.3 open interest over time --------------------------------------------------------------

describe("2.5.3 open interest over time names the venue that published it", () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ timeMs: Date.UTC(2026, 8, 20, 0) + i * 2 * 3_600_000, oiUsd: 5_000_000_000 + i * 50_000_000 }));

  it("draws the series with Binance's name, symbol and bucket size on it", () => {
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: { rows: [venue()], unmapped: [], errors: [], oiHistory: oiSeries(points) } })} />);
    const block = section(c, "Open interest over time");
    expect(block.textContent).toContain("Binance ETHUSDT, 5m buckets");
    expect(block.textContent).toContain("over 22h");
    expect(block.textContent).toContain("+11.0%");
    expect(block.textContent).toContain("one venue’s open interest rather than the table’s");
  });

  it("is absent rather than empty when the statistics host did not answer", () => {
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpVenues: { rows: [venue()], unmapped: [], errors: [], oiHistory: null } })} />);
    expect(shown(c).querySelector('section[aria-label="Open interest over time"]')).toBeNull();
  });
});

// --- 2.5.4 the open-interest cap -----------------------------------------------------------------

describe("2.5.4 the open-interest cap is a line, never a block and never a reassurance", () => {
  const market = {
    market: {
      coin: "ETH",
      markPrice: 2_450,
      oraclePrice: 2_451,
      midPrice: 2_450,
      premiumPct: -0.05,
      fundingHourly: 0.0000125,
      fundingPer8h: 0.0001,
      fundingAnnualPct: 10,
      openInterestCoins: 100,
      openInterestUsd: 250_000,
      dayVolumeUsd: 1_000_000,
      dayChangePct: 1.7,
      maxLeverage: 25,
    },
    book: null,
    funding: null,
    errors: [],
  };

  it("states the venue's own list when the coin is on it", () => {
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpMarket: { ...market, atOpenInterestCap: true } })} />);
    const note = section(c, "The market right now").querySelector(".tw-warnline")!;
    expect(note.textContent).toContain("open-interest cap");
    expect(note.textContent).toContain("orders that reduce it still go through");
    expect(note.textContent).toContain("not a Tripwire verdict");
  });

  it("says nothing at all when the list does not name it, and nothing when the list could not be read", () => {
    for (const atOpenInterestCap of [false, null, undefined]) {
      const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpMarket: { ...market, atOpenInterestCap } })} />);
      expect(section(c, "The market right now").querySelector(".tw-warnline")).toBeNull();
    }
  });

  it("states where Hyperliquid's leverage ceiling steps down, and nothing for a flat table", () => {
    const tiers = [
      { lowerBoundUsd: 0, maxLeverage: 25 },
      { lowerBoundUsd: 20_000_000, maxLeverage: 10 },
    ];
    const c = render(<PerpBody panel={panelOf()} depth={depthWith({ perpMarket: { ...market, market: { ...market.market, marginTiers: tiers } } })} />);
    const block = section(c, "The market right now");
    expect(block.textContent).toContain("steps down with position size");
    expect(block.textContent).toContain("25x up to $20M, then 10x");

    const flat = render(<PerpBody panel={panelOf()} depth={depthWith({ perpMarket: { ...market, market: { ...market.market, marginTiers: [{ lowerBoundUsd: 0, maxLeverage: 25 }] } } })} />);
    expect(section(flat, "The market right now").textContent).not.toContain("steps down");
  });
});

// --- 2.5.6 the cohort ladder ------------------------------------------------------------------------

describe("2.5.6 the liquidation ladder for another cohort is a press, not a tab", () => {
  const panel = panelOf({ positions: [position()], positionsIsLastPage: false });

  it("spends nothing on opening the tab, and prints the price of each cohort that would", () => {
    const c = render(<PerpBody panel={panel} initialTab="liquidations" />);
    expect(perpLadder).not.toHaveBeenCalled();
    const picker = shown(c).querySelector(".tw-cohort-picker")!;
    expect(picker.textContent).toContain("All traders (5 credits)");
    expect(picker.textContent).toContain("Whales (5 credits)");
    expect(picker.textContent).toContain("Public figures (5 credits)");
    // Smart Money is the page the panel already bought, so it carries no price.
    expect(picker.querySelector('[aria-pressed="true"]')!.textContent).toBe("Smart Money");
  });

  it("buys one cohort on one press, and draws it under its own name", async () => {
    const rows = (cohortLadder as { data: PerpPosition[] }).data;
    const answer: PerpLadderResponse = { cohort: "all_traders", positions: rows, isLastPage: false, returned: rows.length, credits: 5, errors: [] };
    perpLadder.mockResolvedValue({ ok: true, data: answer });
    const c = render(<PerpBody panel={panel} initialTab="liquidations" />);

    await act(async () => {
      button(c, "All traders").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(perpLadder).toHaveBeenCalledTimes(1);
    expect(perpLadder).toHaveBeenCalledWith("ETH", "all_traders");
    expect(section(c, "Liquidation ladder").textContent).toContain("All traders, mark ±15%");
    expect(shown(c).textContent).toContain("Largest All traders positions");
    // The verdict did not move with the picker, and the card says so.
    expect(shown(c).textContent).toContain("still read Smart Money");
    expect(shown(c).textContent).toContain("different label in each page");
  });

  it("does not ask twice for a cohort it already paid for", async () => {
    const answer: PerpLadderResponse = { cohort: "whale", positions: [position({ address_label: "Whale" })], isLastPage: true, returned: 1, credits: 5, errors: [] };
    perpLadder.mockResolvedValue({ ok: true, data: answer });
    const c = render(<PerpBody panel={panel} initialTab="liquidations" />);
    await act(async () => void button(c, "Whales").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    click(button(c, "Smart Money"));
    await act(async () => void button(c, "Whales").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(perpLadder).toHaveBeenCalledTimes(1);
  });

  it("reports a failed cohort in its own section and keeps the ladder it had", async () => {
    perpLadder.mockResolvedValue({ ok: false, error: "Nansen timed out" });
    const c = render(<PerpBody panel={panel} initialTab="liquidations" />);
    await act(async () => void button(c, "All traders").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(section(c, "Liquidation ladder").textContent).toContain("Nansen timed out");
    // Still on the ladder the panel already had, rather than on an empty one.
    expect(shown(c).textContent).toContain("Largest Smart Money positions");
  });
});

// --- 2.5.7 the win rate --------------------------------------------------------------------------

describe("2.5.7 a trader's win rate is one click on one row", () => {
  const traders = {
    leaderboard: [
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "HL Perps Whale", side: "Long", realizedPnlUsd: 12_032_490, unrealizedPnlUsd: 0, totalPnlUsd: 12_032_490, positionValueUsd: 0, holdingAmount: 0, roiPct: 7.1, tradeCount: 4_593 },
    ],
    trades: [],
    topAccounts: [],
    topAccountsHere: 0,
    credits: 11,
    errors: [],
  };
  const depth = depthWith({ perpTraders: traders as DepthResponse["perpTraders"] });

  it("is not offered at all in the compact card, where the table is already six columns", () => {
    const c = render(<PerpBody panel={panelOf()} initialTab="traders" depth={depth} />);
    expect(shown(c).textContent).not.toContain("Win rate");
  });

  it("states its price, spends nothing until pressed, and then states the denominator", async () => {
    const answer: PerpWinRateResponse = {
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      winRate: 0.4143302926,
      closedTrades: 585_166,
      winningTrades: 242_452,
      realizedPnlUsd: -30_386_951,
      realizedPnlPct: -3.12,
      tradedCoinCount: 38,
      windowDays: 30,
      credits: 1,
      error: null,
    };
    perpWinRate.mockResolvedValue({ ok: true, data: answer });
    const c = expanded(<PerpBody panel={panelOf()} initialTab="traders" depth={depth} />);
    // Inside a table cell the column header carries the noun, so the button carries the price
    // and its accessible name: a three-line button in twelve rows is a width problem of its own.
    const ask = [...c.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Win rate"))!;
    expect(ask.textContent).toContain("1 credit");
    expect(ask.getAttribute("aria-label")).toBe("Win rate for this trader, 1 credit");
    expect(perpWinRate).not.toHaveBeenCalled();

    await act(async () => void winRateButton(c).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(perpWinRate).toHaveBeenCalledTimes(1);
    // A percentage on its own is not a fact about a strategy: the count rides with it, and so
    // does the window, which is the leaderboard's own 30 days.
    expect(shown(c).textContent).toContain("41.4%");
    expect(shown(c).textContent).toContain("585,166 closed · 30d");
  });

  it("says so when Nansen has no win rate for the trader, rather than printing 0%", async () => {
    perpWinRate.mockResolvedValue({
      ok: true,
      data: { address: "0xa", winRate: null, closedTrades: null, winningTrades: null, realizedPnlUsd: null, realizedPnlPct: null, tradedCoinCount: null, windowDays: 30, credits: 1, error: null },
    });
    const c = expanded(<PerpBody panel={panelOf()} initialTab="traders" depth={depth} />);
    await act(async () => void winRateButton(c).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(shown(c).textContent).toContain("no win rate for this trader");
    expect(shown(c).textContent).not.toContain("0.0%");
  });
});
