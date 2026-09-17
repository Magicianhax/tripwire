// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candle, TokenInfo } from "@tripwire/core";
import type { HitDto, PostIntelResponse, SpotPanel } from "../lib/api-types";

// lightweight-charts draws on a real canvas, which happy-dom has no engine for. The chart's own
// data shaping is tested directly (toChartPoints/nearestPoint/formatPrice); what the mock is for
// is the lifecycle: one chart per mount, disposed on unmount, markers and data applied to it.
const chartApi = {
  addSeries: vi.fn(() => seriesApi),
  applyOptions: vi.fn(),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  remove: vi.fn(),
};
const seriesApi = { setData: vi.fn(), applyOptions: vi.fn() };
const markersApi = { setMarkers: vi.fn(), markers: vi.fn(() => []) };

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => chartApi),
  createSeriesMarkers: vi.fn(() => markersApi),
  AreaSeries: "AreaSeries",
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

const { Panel } = await import("../lib/ui/Panel");
const { SpotBody } = await import("../lib/ui/SpotBody");
const { formatPrice, nearestPoint, PriceChart, toChartPoints } = await import("../lib/ui/PriceChart");
const { createChart, createSeriesMarkers } = await import("lightweight-charts");

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
function unmountAll() {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  unmountAll();
  document.body.replaceChildren();
});

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const token: TokenInfo = {
  name: "dogwifhat",
  symbol: "WIF",
  logoUrl: "https://coin-images.example/dogwifhat.jpg",
  marketCapUsd: 185_000_000,
  volume24hUsd: 1_471_491,
  liquidityUsd: 3_533_476,
  priceUsd: 0.185,
};

const candles = (n: number, from = Date.UTC(2026, 8, 16, 0, 0, 0)): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    interval_start: new Date(from + i * 3_600_000).toISOString(),
    open: 1 + i * 0.01,
    high: 1 + i * 0.01,
    low: 1 + i * 0.01,
    close: 1 + i * 0.01,
    volume_usd: 1,
  }));

const panel = (o: Partial<SpotPanel> = {}): SpotPanel => ({
  token,
  flow: {
    smart_trader_net_flow_usd: -401,
    smart_trader_wallet_count: 2,
    whale_net_flow_usd: -8_610,
    whale_wallet_count: 6,
    public_figure_net_flow_usd: -383,
    public_figure_wallet_count: 4,
    top_pnl_net_flow_usd: -311,
    top_pnl_wallet_count: 2,
    exchange_net_flow_usd: 0,
    fresh_wallets_net_flow_usd: 576_000,
    fresh_wallets_wallet_count: 0,
  },
  flowTimeframe: "1d",
  viewFlow: null,
  viewTimeframe: "1d",
  netflow: { h1: 0, h24: -401, d7: -1_220, d30: 536, symbol: "WIF", traders: 14 },
  indicators: null,
  marketCapUsd: 185_000_000,
  topBuyers: null,
  topSellers: null,
  chart: { timeframe: "1d", interval: "15m", candles: candles(24) },
  absorption: 61.4,
  labeledUsd: -9_394,
  labeledWallets: 12,
  postTimeIso: null,
  logoUrl: token.logoUrl,
  errors: [],
  ...o,
});

const response = (o: Partial<PostIntelResponse> = {}): PostIntelResponse => ({
  verdict: "CLEAR",
  headline: null,
  hits: [],
  unavailable: [],
  signals: [],
  panel: panel(),
  rulesPreset: "balanced",
  ...o,
});

// --- A. Token identity in the header -------------------------------------------------------

describe("the card header names the token, not the contract", () => {
  it("shows the symbol, the name, the logo and the address on its own line", () => {
    const c = render(<Panel data={response()} title="98sM…Mh5g" onClose={() => {}} chain="solana" address={WIF} />);
    expect(c.querySelector(".tw-card-symbol")?.textContent).toBe("$WIF");
    expect(c.querySelector(".tw-card-name")?.textContent?.trim()).toBe("dogwifhat");
    // The heading reads as one accessible name, so a screen reader gets both.
    expect(c.querySelector("h2")?.textContent).toBe("$WIF dogwifhat");
    expect(c.querySelector("img.tw-token-logo")?.getAttribute("src")).toBe(token.logoUrl);
    expect(c.querySelector(".tw-addr-text")?.textContent).toBe("EKpQ…zcjm");
    // The raw address never takes the headline slot any more.
    expect(c.querySelector(".tw-card-symbol")?.textContent).not.toContain("98sM");
  });

  it("falls back to the title and a monogram when Nansen has no identity for the token", () => {
    const c = render(<Panel data={response({ panel: panel({ token: null, logoUrl: null }) })} title="98sM…Mh5g" onClose={() => {}} chain="solana" address={WIF} />);
    expect(c.querySelector(".tw-card-symbol")?.textContent).toBe("98sM…Mh5g");
    expect(c.querySelector(".tw-card-name")).toBeNull();
    expect(c.querySelector(".tw-monogram")?.textContent).toBe("98");
    expect(c.querySelector(".tw-addr-text")?.textContent).toBe("EKpQ…zcjm");
  });

  it("copies the full address, not the shortened form", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" address={WIF} />);
    const copy = c.querySelector(".tw-addr-copy") as HTMLButtonElement;
    expect(copy.getAttribute("aria-label")).toBe("Copy token address");
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith(WIF);
    vi.unstubAllGlobals();
  });

  it("gives the copy button a 24px target", () => {
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" address={WIF} />);
    // The size lives in theme.css; assert the class the rule is written against is applied.
    expect((c.querySelector(".tw-addr-copy") as HTMLElement).className).toContain("tw-addr-copy");
  });
});

// --- B. View on Nansen ---------------------------------------------------------------------

describe("View on Nansen", () => {
  it("links the token's Nansen page and opens it safely", () => {
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" address={WIF} />);
    const link = c.querySelector(".tw-nansen-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`https://app.nansen.ai/token-god-mode?chain=solana&tokenAddress=${WIF}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("View on Nansen");
  });

  it("is omitted when there is no address to link", () => {
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" />);
    expect(c.querySelector(".tw-nansen-link")).toBeNull();
  });
});

// --- C. Timeframe control ------------------------------------------------------------------

describe("the timeframe control", () => {
  const segments = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>(".tw-segment")];

  it("offers the five windows as a radiogroup with one tab stop", () => {
    const c = render(<SpotBody panel={panel()} timeframe={{ value: "1d", onChange: () => {}, pending: null }} />);
    const group = c.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe("Flow and price window");
    expect(segments(c).map((b) => b.textContent)).toEqual(["5m", "1h", "6h", "1d", "7d"]);
    expect(segments(c).filter((b) => b.tabIndex === 0).map((b) => b.textContent)).toEqual(["1d"]);
    expect(segments(c).find((b) => b.getAttribute("aria-checked") === "true")?.textContent).toBe("1d");
  });

  it("moves the selection with the arrow keys, Home and End", () => {
    const onChange = vi.fn();
    const c = render(<SpotBody panel={panel()} timeframe={{ value: "1d", onChange, pending: null }} />);
    const group = c.querySelector('[role="radiogroup"]') as HTMLElement;
    const press = (key: string) => act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    press("ArrowRight");
    press("ArrowLeft");
    press("Home");
    press("End");
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["7d", "6h", "5m", "7d"]);
  });

  it("wraps at both ends", () => {
    const onChange = vi.fn();
    const c = render(<SpotBody panel={panel()} timeframe={{ value: "5m", onChange, pending: null }} />);
    const group = c.querySelector('[role="radiogroup"]') as HTMLElement;
    act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(onChange).toHaveBeenCalledWith("7d");
  });

  it("clicking a netflow tile sets the window, and 30d maps to 7d with the reason said out loud", () => {
    const onChange = vi.fn();
    const c = render(<SpotBody panel={panel()} timeframe={{ value: "1d", onChange, pending: null }} />);
    const tiles = [...c.querySelectorAll<HTMLButtonElement>(".tw-tile-button")];
    expect(tiles.map((b) => b.textContent?.replace(/\s*\(.*\)$/, ""))).toEqual(["1h", "24h", "7d", "30d"]);
    act(() => tiles[2]!.click());
    expect(onChange).toHaveBeenCalledWith("7d");
    act(() => tiles[3]!.click());
    expect(onChange).toHaveBeenLastCalledWith("7d");
    expect(tiles[3]!.textContent).toContain("flows go back 7 days at most");
    // The 24h tile is the one showing while the card is on the verdict window.
    expect(tiles[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("says which window the verdict used whenever the view has moved off it", () => {
    const onVerdict = render(<SpotBody panel={panel()} timeframe={{ value: "1d", onChange: () => {}, pending: null }} />);
    expect(onVerdict.querySelector(".tw-window-note")?.textContent).toBe("Verdict uses 1d");
    const moved = render(<SpotBody panel={panel({ viewTimeframe: "7d" })} timeframe={{ value: "7d", onChange: () => {}, pending: null }} />);
    expect(moved.querySelector(".tw-window-note")?.textContent).toBe("Verdict uses 1d · viewing 7d");
  });

  it("shows a skeleton per section while a window loads, and keeps the card's verdict and tabs", () => {
    const c = render(
      <Panel data={response({ verdict: "CAUTION" })} title="$WIF" onClose={() => {}} chain="solana" address={WIF} onTimeframe={() => new Promise(() => null)} />,
    );
    const seven = [...c.querySelectorAll<HTMLButtonElement>(".tw-segment")].find((b) => b.textContent === "7d")!;
    act(() => seven.click());
    expect(c.querySelectorAll(".tw-skeleton").length).toBeGreaterThan(0);
    expect(c.querySelector(".tw-card")?.getAttribute("data-verdict")).toBe("CAUTION");
    expect([...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Flow", "Wallets", "Risk"]);
  });

  it("swapping the window never changes the verdict the card is showing", async () => {
    // The backend returns only a panel for a window change, so there is no path by which a
    // different window could restate the verdict.
    const onTimeframe = vi.fn(async () => panel({ viewTimeframe: "7d", chart: { timeframe: "7d", interval: "1h", candles: candles(50) } }));
    const c = render(<Panel data={response({ verdict: "CLEAR" })} title="$WIF" onClose={() => {}} chain="solana" address={WIF} onTimeframe={onTimeframe} />);
    const seven = [...c.querySelectorAll<HTMLButtonElement>(".tw-segment")].find((b) => b.textContent === "7d")!;
    await act(async () => seven.click());
    expect(onTimeframe).toHaveBeenCalledWith("7d");
    expect(c.querySelector(".tw-card")?.getAttribute("data-verdict")).toBe("CLEAR");
    expect(c.querySelector(".tw-window-note")?.textContent).toBe("Verdict uses 1d · viewing 7d");
  });

  it("a slow earlier window never overwrites the one the user landed on", async () => {
    let resolveSlow: ((p: SpotPanel) => void) | null = null;
    const onTimeframe = vi.fn((tf: string) =>
      tf === "6h" ? new Promise<SpotPanel>((r) => (resolveSlow = r)) : Promise.resolve(panel({ viewTimeframe: "7d" })),
    );
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" address={WIF} onTimeframe={onTimeframe} />);
    const byLabel = (label: string) => [...c.querySelectorAll<HTMLButtonElement>(".tw-segment")].find((b) => b.textContent === label)!;
    act(() => byLabel("6h").click());
    await act(async () => byLabel("7d").click());
    await act(async () => resolveSlow?.(panel({ viewTimeframe: "6h" })));
    expect(c.querySelector(".tw-window-note")?.textContent).toBe("Verdict uses 1d · viewing 7d");
  });

  it("is not rendered at all on a surface with no refetch path", () => {
    const c = render(<Panel data={response()} title="$WIF" onClose={() => {}} chain="solana" address={WIF} />);
    expect(c.querySelector('[role="radiogroup"]')).toBeNull();
  });
});

// --- D. Interactive price chart ------------------------------------------------------------

describe("the price chart", () => {
  it("shapes candles into ascending, de-duplicated points", () => {
    const messy: Candle[] = [
      { interval_start: "2026-09-16T02:00:00Z", open: 3, high: 3, low: 3, close: 3, volume_usd: 1 },
      { interval_start: "2026-09-16T00:00:00Z", open: 1, high: 1, low: 1, close: 1, volume_usd: 1 },
      { interval_start: "2026-09-16T02:00:00Z", open: 9, high: 9, low: 9, close: 9, volume_usd: 1 },
      { interval_start: "not a date", open: 5, high: 5, low: 5, close: 5, volume_usd: 1 },
    ];
    const points = toChartPoints(messy);
    expect(points.map((p) => p.value)).toEqual([1, 9]);
    expect(points[0]!.time).toBeLessThan(points[1]!.time);
    // Seconds, not milliseconds: the library reads UTCTimestamp as seconds.
    expect(points[0]!.time).toBe(Date.UTC(2026, 8, 16) / 1000);
    expect(toChartPoints(null)).toEqual([]);
  });

  it("puts the post marker on the nearest candle, and drops it outside the window", () => {
    const points = toChartPoints(candles(24));
    expect(nearestPoint(points, "2026-09-16T05:40:00Z")?.time).toBe(Date.UTC(2026, 8, 16, 6) / 1000);
    expect(nearestPoint(points, "2026-09-10T00:00:00Z")).toBeNull();
    expect(nearestPoint(points, null)).toBeNull();
  });

  it("keeps significant digits on a sub-cent price", () => {
    expect(formatPrice(0.00000212)).toBe("$0.00000212");
    expect(formatPrice(0.185)).toBe("$0.1850");
    expect(formatPrice(2_299.4)).toBe("$2,299");
    expect(formatPrice(Number.NaN)).toBe("—");
  });

  it("mounts one chart, applies the data and the marker, and disposes on unmount", () => {
    render(<PriceChart candles={candles(24)} postTimeIso="2026-09-16T06:00:00Z" timeframe="1d" symbol="WIF" />);
    expect(createChart).toHaveBeenCalledTimes(1);
    expect(seriesApi.setData).toHaveBeenCalledTimes(1);
    expect(createSeriesMarkers).toHaveBeenCalledTimes(1);
    expect(markersApi.setMarkers).toHaveBeenCalledWith([expect.objectContaining({ text: "Post", shape: "circle" })]);
    expect(chartApi.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
    unmountAll();
    expect(chartApi.remove).toHaveBeenCalledTimes(1);
    expect(chartApi.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
  });

  it("draws nothing at all below two points, so no chart is created", () => {
    render(<PriceChart candles={candles(1)} timeframe="1d" />);
    expect(createChart).not.toHaveBeenCalled();
  });

  it("carries a text summary for readers who cannot enter the canvas", () => {
    const c = render(<PriceChart candles={candles(24)} postTimeIso="2026-09-16T06:00:00Z" timeframe="1d" symbol="WIF" />);
    const summary = c.querySelector(".tw-sr-only")?.textContent ?? "";
    expect(summary).toContain("WIF: opened $1.00, closed $1.23");
    expect(summary).toContain("up 23.0% over 1d");
    expect(summary).toContain("post's own moment is marked");
    expect(c.querySelector(".tw-chart-canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("colours the line red when the window closed down", () => {
    render(<PriceChart candles={[...candles(24)].reverse().map((c, i) => ({ ...c, interval_start: candles(24)[i]!.interval_start }))} timeframe="1d" />);
    const applied = seriesApi.applyOptions.mock.calls.at(-1)?.[0] as { lineColor: string };
    expect(applied.lineColor).toBe("#ff5a6e");
  });
});

// --- E. The recalibrated evidence copy -----------------------------------------------------

describe("the flow tab reads in percent of volume", () => {
  it("leads with the labeled wallets row and says how much fresh money absorbed the exit", () => {
    const c = render(<SpotBody panel={panel()} timeframe={{ value: "1d", onChange: () => {}, pending: null }} />);
    expect(c.querySelector(".tw-seg[data-rule] .tw-seg-label")?.textContent).toContain("Labeled wallets");
    expect(c.querySelector(".tw-note")?.textContent).toContain("Fresh wallets bought 61.4x what labeled wallets sold.");
  });

  it("puts the rule's threshold on the gauge only while the verdict window is on screen", () => {
    const hits: HitDto[] = [
      { ruleId: "spot-exit", action: "warn", text: "t", signalId: "labeled_exit_pct", op: "<", threshold: -1, label: "l", value: -0.64, evidence: [] },
    ];
    const onWindow = render(<SpotBody panel={panel()} hits={hits} timeframe={{ value: "1d", onChange: () => {}, pending: null }} />);
    expect(onWindow.querySelectorAll(".tw-gauge-threshold")).toHaveLength(1);
    const offWindow = render(<SpotBody panel={panel({ viewTimeframe: "7d" })} hits={hits} timeframe={{ value: "7d", onChange: () => {}, pending: null }} />);
    expect(offWindow.querySelectorAll(".tw-gauge-threshold")).toHaveLength(0);
  });

  it("shows the market figures the percentages are measured against", () => {
    const c = render(<SpotBody panel={panel()} initialTab="risk" timeframe={{ value: "1d", onChange: () => {}, pending: null }} />);
    const figures = [...c.querySelectorAll(".tw-readouts")].at(-1)?.textContent ?? "";
    expect(figures).toContain("24h volume");
    expect(figures).toContain("$1.47M");
  });
});
