// @vitest-environment happy-dom
/**
 * Round 1.1: the spot card states a price and stops throwing away the token record.
 *
 * Every assertion here is about what the card *renders* from responses it already paid for —
 * no item in this round adds a Nansen call. The recorded fixtures are the source of truth for
 * the figures, so a mapper that silently drops a field fails here rather than shipping.
 */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_VOL24_USD, type Candle, type TokenInfo, type WhoRow } from "@tripwire/core";
import type { SpotPanel } from "../lib/api-types";

// lightweight-charts needs a canvas engine happy-dom does not have. The chart itself is covered
// in evidence-card-v2; what matters here is that the price readout lives *outside* it.
const chartApi = {
  addSeries: vi.fn(() => seriesApi),
  applyOptions: vi.fn(),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  remove: vi.fn(),
};
const seriesApi = { setData: vi.fn(), applyOptions: vi.fn() };
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => chartApi),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), markers: vi.fn(() => []) })),
  AreaSeries: "AreaSeries",
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));
vi.mock("../lib/token-logo", () => ({ tokenLogoDataUrl: async () => null }));

const { SpotBody } = await import("../lib/ui/SpotBody");
const { Chip } = await import("../lib/ui/Chip");
const { chipLabel } = await import("../lib/ui/format");

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
/** The panel the user is actually looking at; every tab stays mounted but hidden. */
const shown = (c: HTMLDivElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
const RECORD = fixture("tokenInformation").data;

/** The recorded WIF token record, mapped exactly as `toTokenInfo` maps it. */
const token: TokenInfo = {
  name: "dogwifhat",
  symbol: "WIF",
  logoUrl: null,
  marketCapUsd: RECORD.token_details.market_cap_usd,
  volume24hUsd: RECORD.spot_metrics.volume_total_usd,
  liquidityUsd: RECORD.spot_metrics.liquidity_usd,
  priceUsd: 0.185,
  fdvUsd: RECORD.token_details.fdv_usd,
  totalHolders: RECORD.spot_metrics.total_holders,
  deploymentDateIso: "2023-11-20T19:22:43.000Z",
  circulatingSupply: RECORD.token_details.circulating_supply,
  totalSupply: RECORD.token_details.total_supply,
  buyVolumeUsd: RECORD.spot_metrics.buy_volume_usd,
  sellVolumeUsd: RECORD.spot_metrics.sell_volume_usd,
  totalBuys: RECORD.spot_metrics.total_buys,
  totalSells: RECORD.spot_metrics.total_sells,
  uniqueBuyers: RECORD.spot_metrics.unique_buyers,
  uniqueSellers: RECORD.spot_metrics.unique_sellers,
};

const blankToken: TokenInfo = Object.fromEntries(Object.keys(token).map((k) => [k, null])) as unknown as TokenInfo;

const candles = (n: number, close = (i: number) => 1 + i * 0.01): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    interval_start: new Date(Date.UTC(2026, 8, 16) + i * 3_600_000).toISOString(),
    open: close(i),
    high: close(i) * 1.02,
    low: close(i) * 0.98,
    close: close(i),
    volume_usd: 1,
  }));

const flow = fixture("flowIntel").data[0] as SpotPanel["flow"];

const panel = (o: Partial<SpotPanel> = {}): SpotPanel => ({
  token,
  flow,
  flowTimeframe: "1d",
  viewFlow: null,
  viewTimeframe: "1d",
  netflow: { h1: 0, h24: -401, d7: -1_220, d30: 536, symbol: "WIF", traders: 14 },
  indicators: null,
  marketCapUsd: token.marketCapUsd,
  topBuyers: null,
  topSellers: null,
  chart: { timeframe: "1d", interval: "15m", candles: candles(24) },
  absorption: 61.4,
  labeledUsd: -9_394,
  labeledWallets: 12,
  postTimeIso: null,
  logoUrl: null,
  errors: [],
  warnings: [],
  ...o,
});

const timeframe = { value: "1d" as const, onChange: () => {}, pending: null };

// --- 1.1.1 The price on the card face -------------------------------------------------------

describe("1.1.1 the card states the price", () => {
  it("a one-candle window still shows a price and a range, with no change figure", () => {
    const c = render(<SpotBody panel={panel({ chart: { timeframe: "1d", interval: "15m", candles: candles(1) } })} timeframe={timeframe} />);
    const readout = shown(c).querySelector(".tw-price-readout")!;
    expect(readout).not.toBeNull();
    expect(readout.querySelector(".tw-price-value")?.textContent).toBe("$1.00");
    // Below two points the chart itself draws nothing; the price still has to be stated.
    expect(readout.querySelector(".tw-price-change")?.textContent).toContain("—");
    expect(readout.querySelector(".tw-price-range")?.textContent).toContain("$0.9800–$1.0200");
  });

  it("no candles and no recorded price is a dash, never $0.00", () => {
    const c = render(
      <SpotBody panel={panel({ token: blankToken, chart: { timeframe: "1d", interval: "15m", candles: [] } })} timeframe={timeframe} />,
    );
    const readout = shown(c).querySelector(".tw-price-readout")!;
    expect(readout.querySelector(".tw-price-value")?.textContent).toBe("—");
    expect(readout.textContent).not.toContain("$0.00");
    expect(readout.textContent).not.toContain("$0 ");
  });

  it("falls back to the token record's price when the window returned no candles", () => {
    const c = render(<SpotBody panel={panel({ chart: { timeframe: "1d", interval: "15m", candles: null } })} timeframe={timeframe} />);
    expect(shown(c).querySelector(".tw-price-value")?.textContent).toBe("$0.1850");
  });

  it("keeps a memecoin's significant digits rather than rounding to zero", () => {
    const tiny = candles(2, (i) => 0.00000212 * (1 + i));
    const c = render(<SpotBody panel={panel({ chart: { timeframe: "1d", interval: "15m", candles: tiny } })} timeframe={timeframe} />);
    expect(shown(c).querySelector(".tw-price-value")?.textContent).toBe("$0.00000424");
    expect(shown(c).querySelector(".tw-price-change")?.textContent).toContain("+100.00%");
  });
});

// --- 1.1.2 The token record -----------------------------------------------------------------

describe("1.1.2 the token record block", () => {
  it("shows holders, age, FDV and supply from the recorded response", () => {
    const c = render(<SpotBody panel={panel()} initialTab="risk" timeframe={timeframe} />);
    const market = [...shown(c).querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === "Market")!;
    const text = market.textContent ?? "";
    expect(text).toContain("86,022");
    expect(text).toContain("FDV");
    expect(text).toContain("$186M");
    expect(text).toContain("Token age");
    expect(text).toContain("998.9M"); // circulating and total supply
    // The figures it already showed are still there.
    expect(text).toContain("$1.47M");
  });

  it("labels the block with its as-of window: it is a 24h-TTL snapshot", () => {
    const c = render(<SpotBody panel={panel()} initialTab="risk" timeframe={timeframe} />);
    const market = [...shown(c).querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === "Market")!;
    expect(market.querySelector(".tw-note")?.textContent).toMatch(/daily snapshot.*24h/i);
  });

  it("a record with nothing in it renders no Market block at all, not a wall of zeros", () => {
    const c = render(<SpotBody panel={panel({ token: blankToken })} initialTab="risk" timeframe={timeframe} />);
    expect([...shown(c).querySelectorAll("section")].some((s) => s.getAttribute("aria-label") === "Market")).toBe(false);
  });

  it("a partial record dashes the fields it does not have", () => {
    const partial = { ...blankToken, totalHolders: 42 };
    const c = render(<SpotBody panel={panel({ token: partial })} initialTab="risk" timeframe={timeframe} />);
    const market = [...shown(c).querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === "Market")!;
    const tiles = [...market.querySelectorAll(".tw-readouts dd")].map((d) => d.textContent);
    expect(tiles).toContain("42");
    expect(tiles.filter((t) => t === "—").length).toBeGreaterThanOrEqual(6);
    expect(tiles).not.toContain("$0");
  });
});

// --- 1.1.3 The 24h buy/sell split -----------------------------------------------------------

describe("1.1.3 the 24h buy/sell split", () => {
  it("prints the recorded split, labelled 24h", () => {
    const c = render(<SpotBody panel={panel()} timeframe={timeframe} />);
    const split = [...shown(c).querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === "Buys and sells")!;
    expect(split.querySelector(".tw-section-aside")?.textContent).toBe("24h");
    const text = split.textContent ?? "";
    expect(text).toContain("642"); // unique buyers
    expect(text).toContain("1,641"); // unique sellers
    expect(text).toContain("8,204"); // total buys
    expect(text).toContain("10,497"); // total sells
    expect(text).toContain("$703K");
  });

  it("below the volume floor every figure is a dash and the card says why", () => {
    const quiet = { ...token, volume24hUsd: MIN_VOL24_USD - 1 };
    const c = render(<SpotBody panel={panel({ token: quiet })} timeframe={timeframe} />);
    const split = [...shown(c).querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === "Buys and sells")!;
    const tiles = [...split.querySelectorAll(".tw-readouts dd")].map((d) => d.textContent);
    expect(tiles).toEqual(["—", "—", "—", "—"]);
    expect(split.textContent).not.toContain("642");
    expect(split.querySelector(".tw-note")?.textContent).toMatch(/24h volume/);
  });

  it("a token record with no split at all renders no section rather than an empty one", () => {
    const c = render(<SpotBody panel={panel({ token: { ...token, buyVolumeUsd: null, sellVolumeUsd: null, uniqueBuyers: null, uniqueSellers: null } })} timeframe={timeframe} />);
    expect([...shown(c).querySelectorAll("section")].some((s) => s.getAttribute("aria-label") === "Buys and sells")).toBe(false);
  });
});

// --- 1.1.4 Both sides of every wallet -------------------------------------------------------

describe("1.1.4 both sides of every wallet", () => {
  const buyers = fixture("whoBought").data as WhoRow[];
  const sellers = fixture("whoSold").data as WhoRow[];

  it("the bot row shows its sell side and carries the both-sides tag", () => {
    const c = render(<SpotBody panel={panel({ topBuyers: buyers, topSellers: sellers })} initialTab="wallets" timeframe={timeframe} />);
    const buyRows = [...shown(c).querySelectorAll('.tw-wallet-rows[data-side="buy"] li')];
    const bot = buyRows[1]!;
    // Bought $49.9k, sold $49.8k: a $48.89 net that used to render as a $49.9k buyer.
    expect(bot.querySelector(".tw-row-amount")?.textContent).toContain("$49.9K");
    expect(bot.querySelector(".tw-row-amount-other")?.textContent).toBe("sold $49.8K");
    expect(bot.querySelector(".tw-both-sides")?.textContent).toBe("both sides");
  });

  it("a buy-only wallet shows a reported zero, distinct from a wallet with no figure at all", () => {
    const withNull: WhoRow[] = [
      { ...buyers[0]!, sold_volume_usd: 0 },
      { ...buyers[2]!, sold_volume_usd: null },
    ];
    const c = render(<SpotBody panel={panel({ topBuyers: withNull, topSellers: [] })} initialTab="wallets" timeframe={timeframe} />);
    const rows = [...shown(c).querySelectorAll('.tw-wallet-rows[data-side="buy"] li')];
    expect(rows[0]!.querySelector(".tw-row-amount-other")?.textContent).toBe("sold $0.00");
    expect(rows[0]!.querySelector(".tw-both-sides")).toBeNull();
    // Missing is not zero.
    expect(rows[1]!.querySelector(".tw-row-amount-other")?.textContent).toBe("sold —");
  });

  it("the copy names the sample and does not claim only these wallets round-tripped", () => {
    const c = render(<SpotBody panel={panel({ topBuyers: buyers, topSellers: sellers })} initialTab="wallets" timeframe={timeframe} />);
    const note = shown(c).querySelector(".tw-note")?.textContent ?? "";
    expect(note).toMatch(/not compared/i);
    expect(note).not.toMatch(/\bonly\b/i);
  });

  it("sellers get the mirrored column", () => {
    const c = render(<SpotBody panel={panel({ topBuyers: [], topSellers: sellers })} initialTab="wallets" timeframe={timeframe} />);
    const row = shown(c).querySelector('.tw-wallet-rows[data-side="sell"] li')!;
    expect(row.querySelector(".tw-row-amount-other")?.textContent).toMatch(/^bought /);
  });
});

// --- 1.1.5 The chip says the symbol ---------------------------------------------------------

describe("1.1.5 the chip relabels to the token's symbol", () => {
  it("a resolved symbol replaces the short address; a failed lookup leaves it", () => {
    const short = "EKpQ…zcjm";
    expect(chipLabel(short, "WIF")).toEqual({ text: "WIF", isSymbol: true });
    for (const miss of [null, undefined, "", "   "]) expect(chipLabel(short, miss)).toEqual({ text: short, isSymbol: false });
    // Never an unbounded string from a response into the anchor-fitted pill.
    expect(chipLabel(short, "x".repeat(40)).text).toBe(short);
  });

  it("the cashtag is spoken only for a real ticker, never for a contract address", () => {
    const resolved = render(<Chip verdict="CLEAR" symbol="WIF" headline="No flags" expanded={false} onClick={() => {}} />);
    expect(resolved.querySelector(".tw-chip")?.getAttribute("aria-label")).toContain("$WIF");
    const unresolved = render(<Chip verdict="CLEAR" symbol="EKpQ…zcjm" isSymbol={false} headline="No flags" expanded={false} onClick={() => {}} />);
    const label = unresolved.querySelector(".tw-chip")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("contract EKpQ…zcjm");
    expect(label).not.toContain("$EKpQ");
  });

  it("relabelling is an update of the same button, so the anchor cannot move", () => {
    const c = render(<Chip verdict="LOADING" symbol="EKpQ…zcjm" isSymbol={false} headline="" expanded={false} onClick={() => {}} />);
    const before = c.querySelector(".tw-chip")!;
    act(() => roots[roots.length - 1]!.render(<Chip verdict="CLEAR" symbol="WIF" headline="No flags" expanded={false} onClick={() => {}} />));
    expect(c.querySelector(".tw-chip")).toBe(before);
    expect(c.childElementCount).toBe(1);
  });
});

// --- 1.1.6 Exchange net flow ----------------------------------------------------------------

describe("1.1.6 exchange net flow reads at its own polarity", () => {
  it("the recorded negative figure renders as money leaving exchanges", () => {
    const c = render(<SpotBody panel={panel()} timeframe={timeframe} />);
    const line = shown(c).querySelector(".tw-exchange-flow")!;
    expect(line.getAttribute("data-direction")).toBe("out");
    expect(line.textContent).toContain("$127K");
    expect(line.textContent).toContain("left exchanges");
    // Never borrows the cohort rows' wording, and never shows a minus on a number it just
    // described in words.
    expect(line.textContent).not.toContain("−$127K");
  });

  it("is excluded from the symlog bar stack, which is five cohorts plus the labeled total", () => {
    const c = render(<SpotBody panel={panel()} timeframe={timeframe} />);
    const segs = [...shown(c).querySelectorAll(".tw-gauges .tw-seg .tw-seg-label")].map((s) => s.textContent);
    expect(segs).toHaveLength(6);
    expect(segs.join("|")).not.toMatch(/exchange/i);
    expect(shown(c).querySelector(".tw-gauges .tw-exchange-flow")).toBeNull();
  });

  it("a positive figure inverts the sentence and a null one says unavailable", () => {
    const inbound = render(<SpotBody panel={panel({ flow: { ...flow!, exchange_net_flow_usd: 5_000 } })} timeframe={timeframe} />);
    expect(shown(inbound).querySelector(".tw-exchange-flow")?.textContent).toContain("moved onto exchanges");
    const missing = render(<SpotBody panel={panel({ flow: { ...flow!, exchange_net_flow_usd: null } })} timeframe={timeframe} />);
    const text = shown(missing).querySelector(".tw-exchange-flow")?.textContent ?? "";
    expect(text).toMatch(/unavailable/i);
    expect(text).not.toContain("$0");
  });
});

// --- 1.1.7 Flow-intelligence warnings -------------------------------------------------------

describe("1.1.7 warnings render as captions, not as failures", () => {
  const warnings = fixture("flowIntel").warnings as string[];

  it("each warning sits under the row it is about and never in the error list", () => {
    const c = render(<SpotBody panel={panel({ warnings })} timeframe={timeframe} />);
    const captions = [...shown(c).querySelectorAll(".tw-seg-warning")].map((p) => p.textContent);
    expect(captions).toHaveLength(2);
    expect(captions.join(" ")).toContain("fresh_wallets_wallet_count");
    // The fresh-wallets warning is inside the gauge stack, beside the row it limits.
    expect(shown(c).querySelector(".tw-gauges .tw-seg-warning")?.textContent).toContain("fresh_wallets");
    // Not an outage.
    expect(shown(c).querySelector(".tw-errors")).toBeNull();
    expect(shown(c).textContent).not.toContain("Unavailable:");
  });

  it("a warning we cannot place still renders, under the section", () => {
    const c = render(<SpotBody panel={panel({ warnings: ["windows beyond 7d are not supported"] })} timeframe={timeframe} />);
    expect(shown(c).querySelector(".tw-seg-warning")?.textContent).toBe("windows beyond 7d are not supported");
    expect(shown(c).querySelector(".tw-gauges .tw-seg-warning")).toBeNull();
  });

  it("no warnings means no captions at all", () => {
    const c = render(<SpotBody panel={panel()} timeframe={timeframe} />);
    expect(shown(c).querySelectorAll(".tw-seg-warning")).toHaveLength(0);
  });
});

// --- 1.1.8 Indicators ------------------------------------------------------------------------

describe("1.1.8 indicators show what the 5 credits already bought", () => {
  const live = fixture("indicators");
  const indicators: NonNullable<SpotPanel["indicators"]> = [...live.risk_indicators, ...live.reward_indicators].map(
    (i: { indicator_type: string; score: string; signal_percentile: number; signal: number; last_trigger_on: string }) => ({
      type: i.indicator_type,
      score: i.score,
      percentile: i.signal_percentile,
      signal: i.signal,
      lastTriggerIso: i.last_trigger_on === "1970-01-01" ? null : `${i.last_trigger_on}T00:00:00.000Z`,
    }),
  );

  const riskTab = () => shown(render(<SpotBody panel={panel({ indicators })} initialTab="risk" timeframe={timeframe} />));
  const section = (root: HTMLElement, label: string) => [...root.querySelectorAll("section")].find((s) => s.getAttribute("aria-label") === label)!;

  it("groups on the score vocabulary, not on the array the row arrived in", () => {
    const tab = riskTab();
    const severity = section(tab, "Risk indicators").textContent ?? "";
    const direction = section(tab, "Directional signals").textContent ?? "";
    // cex-flows is a risk_indicator scored `high`: severity.
    expect(severity).toContain("cex-flows");
    expect(severity).toContain("btc-reflexivity");
    // price-momentum is a reward_indicator scored `bearish`: direction, not severity.
    expect(direction).toContain("price-momentum");
    expect(severity).not.toContain("price-momentum");
    expect(direction).not.toContain("cex-flows");
  });

  it("the epoch last_trigger_on renders unknown, never an age", () => {
    const tab = riskTab();
    const cex = [...section(tab, "Risk indicators").querySelectorAll("li")].find((li) => li.textContent?.includes("cex-flows"))!;
    expect(cex.textContent).toContain("last fired unknown");
    expect(cex.textContent).not.toMatch(/years? ago/);
    expect(cex.querySelector("time")).toBeNull();
    const btc = [...section(tab, "Risk indicators").querySelectorAll("li")].find((li) => li.textContent?.includes("btc-reflexivity"))!;
    expect(btc.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-15T00:00:00.000Z");
  });

  it("the percentile is labelled as a peer ranking, not as severity", () => {
    const cex = [...riskTab().querySelectorAll("li")].find((li) => li.textContent?.includes("cex-flows"))!;
    expect(cex.textContent).toContain("88th");
    expect(cex.textContent).toContain("percentile of comparable tokens");
  });

  it("a directional score never borrows the severity pill's alarm colour", () => {
    const tab = riskTab();
    const bullish = [...section(tab, "Directional signals").querySelectorAll(".tw-score")].find((s) => s.textContent === "bullish")!;
    expect(bullish.getAttribute("data-score")).toBe("bullish");
    expect(bullish.getAttribute("data-level")).toBeNull();
    const high = [...section(tab, "Risk indicators").querySelectorAll(".tw-score")].find((s) => s.textContent === "high")!;
    expect(high.getAttribute("data-level")).toBe("high");
  });

  it("no indicators at all keeps the empty state and adds no directional section", () => {
    const tab = shown(render(<SpotBody panel={panel()} initialTab="risk" timeframe={timeframe} />));
    expect(section(tab, "Risk indicators").textContent).toContain("No medium or high risk indicators.");
    expect([...tab.querySelectorAll("section")].some((s) => s.getAttribute("aria-label") === "Directional signals")).toBe(false);
  });
});
