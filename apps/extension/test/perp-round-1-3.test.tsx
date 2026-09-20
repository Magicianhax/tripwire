// @vitest-environment happy-dom
/**
 * Round 1.3: the perp card stops asserting things that are not true.
 *
 * The item this round opens with is a render bug that no backend test could have caught — a
 * `?? 0` and a `: 50` inside a JSX component — so the guards for it live here, against the
 * component itself.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PerpPosition, PerpScreenerRow, PerpTrade } from "@tripwire/core";
import type { HyperliquidBadge, PerpPanel } from "../lib/api-types";
import clearinghouseState from "../../../fixtures/hyperliquid/clearinghouseState.json";
import positionIntelligence from "../../../fixtures/nansen/positionIntelligence.json";

// The perp Chart tab mounts lightweight-charts, which happy-dom has no canvas engine for.
const chartApi = {
  addSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
  applyOptions: vi.fn(),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  remove: vi.fn(),
};
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => chartApi),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), markers: vi.fn(() => []) })),
  AreaSeries: "AreaSeries",
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

const { PerpBody } = await import("../lib/ui/PerpBody");
const { HyperliquidBody } = await import("../lib/ui/VenueBody");
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
const shown = (c: HTMLDivElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const section = (c: HTMLDivElement, label: string) => shown(c).querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;
const widths = (c: HTMLDivElement, selector: string) =>
  [...c.querySelectorAll<HTMLElement>(selector)].map((el) => el.style.width);

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

const screener = (over: Partial<PerpScreenerRow>): PerpScreenerRow => ({
  token_symbol: "ETH",
  mark_price: 2_450,
  funding: 0.0000125,
  open_interest: 1_000_000,
  current_smart_money_position_longs_usd: null,
  current_smart_money_position_shorts_usd: null,
  smart_money_longs_count: null,
  smart_money_shorts_count: null,
  ...over,
});

const panelOf = (over: Partial<PerpPanel> = {}): PerpPanel => ({
  coin: "ETH",
  mode: "panel",
  screener: null,
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

// --- 1.3.1 -----------------------------------------------------------------------------------

describe("1.3.1 a null Smart Money row reads unknown, not 50/50", () => {
  it("draws no bar at all when Nansen sent no position figures", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}) })} />);
    const block = section(c, "Smart Money long vs short");
    expect(block.querySelector(".tw-longshort-bar")).toBeNull();
    expect(block.textContent).toContain("no Smart Money position figures");
    // The old render put these two on screen beside an even mint-and-red bar.
    expect(block.textContent).not.toContain("$0");
    expect(block.textContent).not.toContain("0 wallets");
  });

  it("draws a real 50/50 for a genuinely balanced market", () => {
    const c = render(
      <PerpBody
        panel={panelOf({
          screener: screener({
            current_smart_money_position_longs_usd: 5_000_000,
            current_smart_money_position_shorts_usd: -5_000_000,
            smart_money_longs_count: 12,
            smart_money_shorts_count: 9,
          }),
        })}
      />,
    );
    const block = section(c, "Smart Money long vs short");
    expect(widths(c, ".tw-longshort-bar i")).toEqual(["50%", "50%"]);
    expect(block.querySelector(".tw-longshort-bar")!.getAttribute("aria-label")).toBe("Smart Money long 50%, short 50%");
    expect(block.textContent).toContain("12 wallets");
  });

  it("draws the skew for a one-sided market", () => {
    const c = render(
      <PerpBody
        panel={panelOf({
          screener: screener({
            current_smart_money_position_longs_usd: 77_577_513,
            current_smart_money_position_shorts_usd: -36_155_132,
            smart_money_longs_count: 56,
            smart_money_shorts_count: 28,
          }),
        })}
      />,
    );
    const [long, short] = widths(c, ".tw-longshort-bar i");
    expect(Number.parseFloat(long!)).toBeCloseTo(68.2, 1);
    expect(Number.parseFloat(short!)).toBeCloseTo(31.8, 1);
    expect(section(c, "Smart Money long vs short").textContent).toContain("56 wallets");
  });

  it("says nobody is positioned rather than drawing an even split over two zeroes", () => {
    const c = render(
      <PerpBody panel={panelOf({ screener: screener({ current_smart_money_position_longs_usd: 0, current_smart_money_position_shorts_usd: 0 }) })} />,
    );
    const block = section(c, "Smart Money long vs short");
    expect(block.querySelector(".tw-longshort-bar")).toBeNull();
    expect(block.textContent).toContain("No Smart Money is positioned");
  });

  it("does not print a wallet count Nansen never sent", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({ current_smart_money_position_longs_usd: 4_000_000 }) })} />);
    const block = section(c, "Smart Money long vs short");
    expect(block.textContent).toContain("Long");
    expect(block.textContent).not.toContain("wallets");
  });
});

// --- 1.3.3 -----------------------------------------------------------------------------------

const cohortRow = positionIntelligence.data[0]!;

describe("1.3.3 three cohorts instead of one", () => {
  it("draws one bar per cohort, each on its own scale", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), cohorts: cohortRow, cohortsAtIso: new Date().toISOString() })} />);
    const block = section(c, "Positioning by cohort");
    expect(block.querySelectorAll(".tw-cohort")).toHaveLength(3);
    expect(block.textContent).toContain("Smart traders");
    expect(block.textContent).toContain("Whales");
    expect(block.textContent).toContain("Public figures");
    const shares = [...block.querySelectorAll(".tw-cohort-share")].map((el) => el.textContent);
    expect(shares).toEqual(["73% long", "54% long", "74% long"]);
    // Each bar is normalised to its own cohort, not to the largest one.
    const bars = [...block.querySelectorAll(".tw-cohort .tw-longshort-bar i:first-child")].map((el) => Number.parseFloat((el as HTMLElement).style.width));
    expect(bars[0]).toBeCloseTo(73.4, 1);
    expect(bars[1]).toBeCloseTo(53.6, 1);
  });

  it("never labels the gross total as net exposure", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), cohorts: cohortRow })} />);
    const block = section(c, "Positioning by cohort");
    // The legend's third figure is the one Nansen calls `*_total_usd`; it is labelled for what
    // it is, and no cell in this section is ever labelled "net".
    const totals = [...block.querySelectorAll(".tw-cohort .tw-longshort-legend .tw-meta")].map((el) => el.textContent);
    expect(totals).toHaveLength(3);
    for (const t of totals) expect(t).toMatch(/^Long \+ short \$/);
    for (const cell of block.querySelectorAll(".tw-cohort span")) expect(cell.textContent).not.toMatch(/net/i);
    expect(block.textContent).toContain("gross exposure rather than a net position");
  });

  it("names the dataset and says the bars are not to scale with each other", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), cohorts: cohortRow, cohortsAtIso: new Date().toISOString() })} />);
    const block = section(c, "Positioning by cohort");
    expect(block.textContent).toContain("Nansen position intelligence");
    expect(block.textContent).toContain("Hyperliquid perps only");
    expect(block.querySelector(".tw-section-aside")!.textContent).toMatch(/^as of /);
  });

  it("renders a cohort with no figures as unknown, never as a 50/50 bar", () => {
    const c = render(
      <PerpBody
        panel={panelOf({
          screener: screener({}),
          cohorts: { ...cohortRow, whale_longs_usd: null, whale_shorts_usd: null, whale_total_usd: null },
        })}
      />,
    );
    const whale = section(c, "Positioning by cohort").querySelectorAll(".tw-cohort")[1]!;
    expect(whale.querySelector(".tw-longshort-bar")).toBeNull();
    expect(whale.textContent).toContain("No figures for this cohort");
  });

  it("says the section is Hyperliquid-only when the call answered with nothing", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}) })} />);
    expect(section(c, "Positioning by cohort").textContent).toContain("Hyperliquid-only");
  });

  it("does not report a chip's unpaid sections as empty answers", () => {
    // The runner carries its cheap chip result into the card while the panel fetch is in
    // flight, so "we did not ask" must not render as "Nansen had nothing".
    const c = render(<PerpBody panel={panelOf({ mode: "chip", screener: screener({}) })} />);
    expect(section(c, "Positioning by cohort").textContent).toContain("loads with the full card");
    expect(section(c, "Opened in the last hour").textContent).toContain("load with the full card");
  });
});

// --- 1.3.4 -----------------------------------------------------------------------------------

const trade = (over: Partial<PerpTrade>): PerpTrade => ({
  trader_address_label: "Smart HL Perps Trader",
  trader_address: "0x25554a80781ee62414c3747e81c3f50157c634b1",
  token_symbol: "ETH",
  side: "Long",
  action: "Reduce",
  value_usd: 12_178.5,
  price_usd: 2_435.7,
  block_timestamp: new Date().toISOString(),
  ...over,
});

describe("1.3.4 the 5-credit trade call finally renders", () => {
  it("lists the positions opened inside the hour", () => {
    const c = render(
      <PerpBody
        panel={panelOf({
          screener: screener({}),
          trades: [trade({ action: "Open", side: "Short", value_usd: 250_000 }), trade({ action: "Reduce" })],
        })}
      />,
    );
    const block = section(c, "Opened in the last hour");
    expect(block.querySelectorAll("li")).toHaveLength(1);
    expect(block.textContent).toContain("Opened short");
    expect(block.textContent).toContain("$250K");
  });

  it("says what it looked at when the hour is empty, rather than showing a blank strip", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), trades: [trade({}), trade({}), trade({})] })} />);
    const block = section(c, "Opened in the last hour");
    expect(block.querySelectorAll("li")).toHaveLength(0);
    expect(block.textContent).toContain("No Smart Money opened a position in the last hour");
    expect(block.textContent).toContain("3 position changes");
    expect(block.textContent).toContain("none of them an open");
  });

  it("names the most recent open when there was one, just not inside the window", () => {
    const old = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), trades: [trade({ action: "Open", block_timestamp: old })] })} />);
    expect(section(c, "Opened in the last hour").textContent).toMatch(/most recent open .*h ago/);
  });

  it("shows a failed strip as a section problem, not as a failed check", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), tradesError: "smart-money/perp-trades: 503" })} />);
    const block = section(c, "Opened in the last hour");
    expect(block.textContent).toContain("smart-money/perp-trades: 503");
  });
});

// --- 1.3.6 / 1.3.7 ---------------------------------------------------------------------------

const position = (i: number): PerpPosition => ({
  address: `0x${i.toString(16).padStart(40, "0")}`,
  address_label: null,
  side: i % 2 === 0 ? "Long" : "Short",
  position_value_usd: 1_000_000 - i,
  leverage: "5x",
  entry_price: 2_000,
  mark_price: 2_450,
  liquidation_price: 2_400 + i,
  upnl_usd: 1_000,
});

describe("1.3.6 the funding chart's title states the window it fetched", () => {
  const funding = Array.from({ length: 48 }, (_, i) => ({ timeMs: Date.now() - (48 - i) * 3_600_000, hourlyRate: 0.00001, per8h: 0.00008, premium: null }));

  it("titles both funding sections with the 48h window, not 'the same window'", () => {
    const depth = { data: { credits: 0, skipped: [], perpMarket: { market: null, book: null, funding, errors: [] } }, loading: [], failed: {} } as never;
    const c = render(<PerpBody panel={panelOf({ screener: screener({}) })} depth={depth} />);
    expect(section(c, "Funding, last 48h")).not.toBeNull();
    expect(c.textContent).not.toContain("Funding over the same window");
    // Both tabs stay mounted, so both titles are in the tree; neither may claim a window it
    // did not fetch.
    expect(c.querySelectorAll('section[aria-label="Funding, last 48h"]')).toHaveLength(2);
  });
});

describe("1.3.7 the ladder says whether it is the whole set", () => {
  const positions = Array.from({ length: 50 }, (_, i) => position(i));

  it("names a truncated page as the largest returned", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), positions, positionsReturned: 50, positionsIsLastPage: false })} initialTab="liquidations" />);
    expect(section(c, "Largest Smart Money positions").querySelector(".tw-section-aside")!.textContent).toBe("6 of the 50 largest returned");
  });

  it("states a complete page plainly", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), positions, positionsReturned: 50, positionsIsLastPage: true })} initialTab="liquidations" />);
    expect(section(c, "Largest Smart Money positions").querySelector(".tw-section-aside")!.textContent).toBe("6 of 50");
  });

  it("claims nothing when the response did not say", () => {
    const c = render(<PerpBody panel={panelOf({ screener: screener({}), positions, positionsReturned: 50, positionsIsLastPage: null })} initialTab="liquidations" />);
    expect(section(c, "Largest Smart Money positions").querySelector(".tw-section-aside")!.textContent).toBe("6 of 50 returned");
  });
});

// --- 1.3.8 -----------------------------------------------------------------------------------

const hlPosition = (coin: string) => {
  const p = clearinghouseState.assetPositions.find((a) => a.position.coin === coin)!.position;
  const size = Math.abs(Number(p.szi));
  const valueUsd = Number(p.positionValue);
  return {
    coin,
    side: Number(p.szi) < 0 ? ("short" as const) : ("long" as const),
    size,
    entryPx: Number(p.entryPx),
    markPx: valueUsd / size,
    liquidationPx: p.liquidationPx === null ? null : Number(p.liquidationPx),
    unrealizedPnlUsd: Number(p.unrealizedPnl),
    leverage: p.leverage.value,
    valueUsd,
    returnOnEquity: Number(p.returnOnEquity),
    cumFundingAllTimeUsd: Number(p.cumFunding.allTime),
    cumFundingSinceOpenUsd: Number(p.cumFunding.sinceOpen),
    maxLeverage: p.maxLeverage,
    marginUsedUsd: Number(p.marginUsed),
  };
};

const hlBadge: Omit<HyperliquidBadge, "link"> = {
  accountValueUsd: Number(clearinghouseState.marginSummary.accountValue),
  marginUsedUsd: Number(clearinghouseState.marginSummary.totalMarginUsed),
  totalNotionalUsd: Number(clearinghouseState.marginSummary.totalNtlPos),
  withdrawableUsd: Number(clearinghouseState.withdrawable),
  maintenanceMarginUsd: Number(clearinghouseState.crossMaintenanceMarginUsed),
  positions: [hlPosition("ETH"), hlPosition("BTC")],
  fills: [],
  fillsRealizedPnlUsd: null,
  fillsWindow: null,
  nansenPerp: null,
  errors: [],
};

const expandedBody = () =>
  render(
    <CardSizeContext.Provider value="expanded">
      <HyperliquidBody badge={hlBadge} />
    </CardSizeContext.Provider>,
  );

describe("1.3.8 the Hyperliquid account fields already on the wire", () => {
  it("renders a negative cumFunding as funding paid, in words", () => {
    const c = expandedBody();
    const eth = c.querySelectorAll("tbody tr")[0]!;
    // −1,763,879.16 since open, −4,886,215.80 all time: both paid, neither shown as a minus
    // sign a reader has to interpret.
    expect(eth.textContent).toContain("$1.76M paid");
    expect(eth.textContent).toContain("$4.89M paid all time");
    expect(eth.textContent).not.toContain("−$1.76M");
  });

  it("gives the configured leverage and the account's own ratio different labels", () => {
    const c = expandedBody();
    // 121,193,987.74 notional over 32,067,508.17 of equity.
    expect(c.textContent).toContain("Account leverage");
    expect([...c.querySelectorAll("dd")].map((d) => d.textContent)).toContain("3.8x");
    // The BTC leg is configured at 30x under a 40x venue ceiling: three numbers, three labels.
    const btc = c.querySelectorAll("tbody tr")[1]!;
    expect(btc.textContent).toContain("Long 30x");
    expect(btc.textContent).toContain("of 40x max");
  });

  it("states the maintenance buffer as a share of equity, never as a liquidation level", () => {
    const c = expandedBody();
    expect(c.textContent).toContain("Above maintenance");
    expect([...c.querySelectorAll("dd")].map((d) => d.textContent)).toContain("83%");
    // The BTC position has no liquidation price at all, so the note has to be on screen.
    expect(c.textContent).toContain("no liquidation price for a cross position");
    expect(c.textContent).toContain("not a distance to a level");
  });

  it("renders ROE as the percentage Hyperliquid's fraction means", () => {
    const c = expandedBody();
    // returnOnEquity −1.7721645674 on the ETH leg.
    expect(c.querySelectorAll("tbody tr")[0]!.textContent).toContain("−177.2% ROE");
    // Compact keeps the uPnL cell to one figure.
    expect(render(<HyperliquidBody badge={hlBadge} />).textContent).not.toContain("ROE");
  });

  it("explains a dash only when a dash is on screen", () => {
    // The recorded wallet's null-liquidation legs sit below the compact card's five rows, so a
    // note about them would explain something the reader cannot see.
    const withLiq = { ...hlBadge, positions: [hlPosition("ETH")] };
    const c = render(<HyperliquidBody badge={withLiq} />);
    expect(c.textContent).not.toContain("no liquidation price for a cross position");
    const withoutLiq = render(<HyperliquidBody badge={{ ...hlBadge, positions: [hlPosition("BTC")] }} />);
    expect(withoutLiq.textContent).toContain("no liquidation price for a cross position");
    // The maintenance sentence only ships beside the tile it is about.
    expect(withoutLiq.textContent).not.toContain("Above maintenance");
  });

  it("keeps the compact card at five columns", () => {
    const c = render(<HyperliquidBody badge={hlBadge} />);
    expect(c.querySelectorAll("thead th")).toHaveLength(5);
    expect(expandedBody().querySelectorAll("thead th")).toHaveLength(6);
    expect(c.textContent).not.toContain("all time");
    // Four account tiles compact, six expanded: the same data, as much of it as fits.
    expect(c.querySelectorAll(".tw-readouts > div")).toHaveLength(4);
    expect(expandedBody().querySelectorAll(".tw-readouts > div")).toHaveLength(6);
  });
});
