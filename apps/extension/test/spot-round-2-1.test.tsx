// @vitest-environment happy-dom
/**
 * Round 1.6 and Round 2.1 — the spot card's market structure, and its sense of sequence and time.
 *
 * The claims that matter here are render claims: whether a divider is drawn, whether a missing
 * field becomes a dash or a zero, whether two sources of "liquidity" can appear under one word,
 * and whether a credit can be spent by anything other than a press. None of those are reachable
 * from a backend test.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepthSection } from "@tripwire/core";
import type { DepthResponse, SpotPanel } from "../lib/api-types";
import flowIntel from "../../../fixtures/nansen/flowIntel.json";

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
  CandlestickSeries: "CandlestickSeries",
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

const { SpotBody, SPOT_TAB_SECTIONS } = await import("../lib/ui/SpotBody");
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
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});
beforeEach(() => vi.clearAllMocks());

const shown = (c: HTMLDivElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const tab = (c: HTMLDivElement, label: string) => [...c.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.startsWith(label))!;
const click = (el: HTMLElement) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

const panel = (over: Partial<SpotPanel> = {}): SpotPanel => ({
  chain: "solana",
  token: {
    name: "dogwifhat",
    symbol: "WIF",
    logoUrl: null,
    marketCapUsd: 197_059_034,
    volume24hUsd: 1_301_814,
    liquidityUsd: 3_698_665,
    priceUsd: 0.1959,
    fdvUsd: 197_392_411,
    totalHolders: 86_022,
    deploymentDateIso: "2023-11-20T19:22:43.000Z",
    circulatingSupply: 998_926_392,
    totalSupply: 998_926_392,
    buyVolumeUsd: null,
    sellVolumeUsd: null,
    totalBuys: null,
    totalSells: null,
    uniqueBuyers: null,
    uniqueSellers: null,
  },
  flow: null,
  flowTimeframe: "1d",
  viewFlow: null,
  netflow: null,
  indicators: null,
  marketCapUsd: 197_059_034,
  topBuyers: null,
  topSellers: null,
  chart: null,
  postTimeIso: null,
  errors: [],
  ...over,
});

const depthOf = (data: Partial<DepthResponse>, loading: DepthSection[] = []) => ({
  data: { credits: 0, skipped: [], ...data } as DepthResponse,
  loading,
  failed: {} as Record<string, string>,
});

const expanded = (node: React.ReactNode) => <CardSizeContext.Provider value="expanded">{node}</CardSizeContext.Provider>;

const structure = {
  pool: { dexId: "orca", pairAddress: "D6Nd", quoteSymbol: "SOL", liquidityUsd: 5_763_077, createdAtIso: "2024-05-18T20:45:47.000Z" },
  priceChangePct: { m5: -0.09, h1: -0.43, h6: -1.76 },
  txns: { m5: { buys: 8, sells: 13 }, h1: { buys: 242, sells: 251 }, h6: { buys: 4527, sells: 3666 } },
  poolCount: 30,
  quoteSidePoolCount: 0,
  droppedPoolCount: 0,
};

const tapeRow = (iso: string, over: Record<string, unknown> = {}) => ({
  timestampIso: iso,
  address: "48bfeMwnP7YYMp8yHspvAh2HwBK7junAeHbZiAHNsofQ",
  label: null,
  action: "buy" as const,
  valueUsd: 1_500,
  tokenAmount: 7_600,
  priceUsd: 0.19,
  txHash: `tx-${iso}`,
  counterSymbol: "SOL",
  ...over,
});

// --- 1.6.1 ------------------------------------------------------------------------------------

describe("1.6.1 Dexscreener market structure on the card face", () => {
  it("never puts two sources of liquidity under one word", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure, errors: [] } })} />));
    const labels = [...shown(c).querySelectorAll("dt")].map((d) => d.textContent);
    expect(labels).toContain("Liquidity (Nansen)");
    expect(labels).toContain("Deepest pool");
    expect(labels).not.toContain("Liquidity");
  });

  it("captions pair age as the pair's, and names the pool count the trade counts are summed over", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure, errors: [] } })} />));
    const text = shown(c).textContent ?? "";
    expect(text).toContain("Pair age");
    expect(text).toMatch(/Pair age is how long that pool has existed, not how long the token has/);
    expect(text).toContain("summed across all");
    // The counts really are the summed ones, not the deepest pool's.
    expect(text).toContain("4,527");
  });

  it("renders no boost, social link or website, whatever the backend sent", () => {
    const withExtras = { ...structure, info: { socials: [{ url: "https://twitter.com/dogwifcoin" }] }, boosts: { active: 500 } };
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure: withExtras as never, errors: [] } })} />));
    const html = shown(c).innerHTML;
    for (const forbidden of ["twitter", "telegram", "boost", "dogwifcoin.org"]) expect(html.toLowerCase()).not.toContain(forbidden);
  });

  it("says there are no pools rather than printing zeroes", () => {
    const empty = { ...structure, pool: null, poolCount: 0, txns: { m5: { buys: null, sells: null }, h1: { buys: null, sells: null }, h6: { buys: null, sells: null } } };
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure: empty, errors: [] } })} />));
    const section = shown(c).querySelector<HTMLElement>('section[aria-label="Market structure"]')!;
    expect(section.textContent).toContain("lists no pools");
    expect(section.textContent).not.toContain("0%");
  });

  // C-1: an unreadable answer and an empty one are two different claims.
  it("says the answer was unreadable, not that there are no pools, when the structure is null", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure: null, errors: [] } })} />));
    const section = shown(c).querySelector<HTMLElement>('section[aria-label="Market structure"]')!;
    const text = section.textContent ?? "";
    expect(text).toMatch(/couldn't be read/);
    expect(text).toContain("Dexscreener");
    // The claim the reviewer found: a token in thirty pools being told it has none.
    expect(text).not.toContain("no pools");
  });

  it("states how many entries it could not read when only part of the answer parsed", () => {
    const partial = { ...structure, droppedPoolCount: 3 };
    const c = render(expanded(<SpotBody panel={panel()} initialTab="risk" depth={depthOf({ spotMarket: { structure: partial, errors: [] } })} />));
    const text = shown(c).querySelector<HTMLElement>('section[aria-label="Market structure"]')!.textContent ?? "";
    expect(text).toMatch(/3 more entries were unreadable/);
  });

  it("costs nothing, so its tab carries no price", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="flow" depth={depthOf({})} />));
    expect(tab(c, "Risk").textContent).not.toMatch(/credit/);
    expect(SPOT_TAB_SECTIONS.risk).toEqual(["spotMarket"]);
  });
});

// --- 2.1 the tape -------------------------------------------------------------------------------

describe("2.1 the trade tape", () => {
  const rows = [tapeRow("2026-09-20T13:13:50Z"), tapeRow("2026-09-20T13:10:00Z"), tapeRow("2026-09-20T13:05:00Z", { action: "sell" as const })];
  const tape = {
    trades: rows,
    spanFromIso: "2026-09-20T13:05:00Z",
    spanToIso: "2026-09-20T13:13:50Z",
    fetched: 100,
    kept: 3,
    minUsd: 100,
    isLastPage: false,
    credits: 1,
    errors: [],
  };

  it("draws the post divider only when the post falls inside the fetched window", () => {
    const inside = render(
      expanded(<SpotBody panel={panel({ postTimeIso: "2026-09-20T13:07:00Z" })} initialTab="tape" depth={depthOf({ spotTape: tape })} />),
    );
    expect(shown(inside).querySelectorAll(".tw-tape-divider").length).toBe(1);

    const older = render(expanded(<SpotBody panel={panel({ postTimeIso: "2026-09-19T09:00:00Z" })} initialTab="tape" depth={depthOf({ spotTape: tape })} />));
    expect(shown(older).querySelectorAll(".tw-tape-divider").length).toBe(0);
    // And it says why, rather than leaving the reader to assume the list is everything since.
    expect(shown(older).textContent).toContain("not the whole run since the post");
  });

  it("draws no divider at all on a venue card, which has no post", () => {
    const c = render(expanded(<SpotBody panel={panel({ postTimeIso: null })} initialTab="tape" depth={depthOf({ spotTape: tape })} />));
    expect(shown(c).querySelectorAll(".tw-tape-divider").length).toBe(0);
    expect(shown(c).textContent).not.toContain("post,");
  });

  it("states the floor, the sample and that the label is the evidence", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="tape" depth={depthOf({ spotTape: tape })} />));
    const text = shown(c).textContent ?? "";
    expect(text).toContain("Every labelled wallet's trade is shown whatever its size");
    expect(text).toContain("The label is the evidence, not the count");
    expect(text).toContain("3 of 100");
  });

  it("says the window is empty rather than showing nothing, and prints its price on the tab", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="tape" depth={depthOf({ spotTape: { ...tape, trades: null, kept: 0 } })} />));
    expect(shown(c).textContent).toContain("no labelled or above-floor trades");
    expect(tab(c, "Tape").textContent).toContain("1 credit");
  });

  it("does not exist in the anchored card, which has no room for it", () => {
    const c = render(<SpotBody panel={panel()} depth={depthOf({})} />);
    expect([...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Flow", "Wallets", "Risk"]);
  });
});

// --- 2.1 Jupiter DCA ------------------------------------------------------------------------------

describe("2.1 Jupiter DCA is Solana-only and is bought by a press", () => {
  const tape = { trades: [tapeRow("2026-09-20T13:10:00Z")], spanFromIso: null, spanToIso: null, fetched: 1, kept: 1, minUsd: 100, isLastPage: true, credits: 1, errors: [] };

  it("offers nothing on an EVM token", () => {
    const c = render(expanded(<SpotBody panel={panel({ chain: "ethereum" })} initialTab="tape" depth={depthOf({ spotTape: tape })} />));
    expect(shown(c).textContent).not.toContain("Jupiter");
  });

  it("spends only on the press, and asks for exactly its own section", () => {
    const asked: DepthSection[][] = [];
    const c = render(
      expanded(<SpotBody panel={panel()} initialTab="tape" depth={depthOf({ spotTape: tape })} onNeedSections={(s) => asked.push(s)} />),
    );
    // Opening the tab asks for the tape and nothing else.
    expect(asked).toEqual([["spotTape"]]);
    const button = [...shown(c).querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("DCA"))!;
    expect(button.textContent).toContain("1 credit");
    click(button);
    expect(asked).toEqual([["spotTape"], ["spotDca"]]);
  });

  it("reports an empty answer as an answer, because the press was paid for", () => {
    const c = render(
      expanded(<SpotBody panel={panel()} initialTab="tape" depth={depthOf({ spotTape: tape, spotDca: { vaults: [], asked: true, credits: 1, errors: [] } })} />),
    );
    expect(shown(c).textContent).toContain("no open Jupiter DCA vaults");
    expect(shown(c).textContent).toContain("That is the usual answer, not a failure");
  });
});

// --- 2.1 winners ------------------------------------------------------------------------------

describe("2.1 the winners tab", () => {
  const winners = {
    winners: [
      { address: "8RSK", label: "top Token Deployer", realizedPnlUsd: 15_308.7, unrealizedPnlUsd: 0, totalPnlUsd: 15_308.7, roiPct: 6.789, holdingAmount: 0, holdingUsd: 0, peakUsd: 58_397, stillHoldingRatio: 0, tradeCount: 28 },
      { address: "9abc", label: null, realizedPnlUsd: 0, unrealizedPnlUsd: 0, totalPnlUsd: 0, roiPct: null, holdingAmount: 100, holdingUsd: 20, peakUsd: 1_959, stillHoldingRatio: 1, tradeCount: 2 },
    ],
    stillHolding: { pct: 3.2, weightUsd: 60_356, counted: 2 },
    isLastPage: false,
    credits: 5,
    errors: [],
  };

  it("prints its price on the tab before it is opened", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="flow" depth={depthOf({})} />));
    expect(tab(c, "Winners").textContent).toContain("5 credits");
  });

  it("says what the still-holding share is weighted by, and over what money", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="winners" depth={depthOf({ spotWinners: winners })} />));
    const text = shown(c).textContent ?? "";
    expect(text).toContain("3.2%");
    expect(text).toContain("Weighted by each wallet's peak position");
  });

  it("renders a missing ROI as a dash, never as zero", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="winners" depth={depthOf({ spotWinners: winners })} />));
    const cells = [...shown(c).querySelectorAll("tbody tr")][1]!.querySelectorAll("td");
    expect(cells[1]!.textContent).toBe("—");
    // The wallet that never sold still shows its own holding ratio, which is a measurement.
    expect(cells[2]!.textContent).toBe("100%");
  });

  it("says so rather than inventing a headline when no holding ratios came back", () => {
    const c = render(
      expanded(<SpotBody panel={panel()} initialTab="winners" depth={depthOf({ spotWinners: { ...winners, stillHolding: null } })} />),
    );
    expect(shown(c).textContent).toContain("no holding ratios for this sample");
    expect(shown(c).textContent).not.toContain("0.0% is still held");
  });
});

// --- 2.1 holders and transfers -----------------------------------------------------------------

describe("2.1 the holders table gains the columns it already paid for", () => {
  const holders = {
    holders: [
      { address: "51yZ", label: null, valueUsd: 25_452_990, tokenAmount: 137_085_684, sharePct: 0.137, change24hPct: 0, change7dPct: 0, change30dPct: 0, totalInflow: 137_085_726, totalOutflow: 41.7 },
      { address: "7Qwe", label: "Token Millionaire", valueUsd: 1_000_000, tokenAmount: 74_200_000, sharePct: 0.07, change24hPct: 0, change7dPct: 7.57, change30dPct: null, totalInflow: 80_000_000, totalOutflow: 0 },
    ],
    top10SharePct: 12.5,
    neverSentOutCount: 1,
    allChange24hZero: true,
    warnings: [],
    isLastPage: false,
    credits: 5,
    errors: [],
  };

  it("adds the 7d and 30d columns in the expanded card only", () => {
    const wide = render(expanded(<SpotBody panel={panel()} initialTab="holders" depth={depthOf({ spotHolders: holders })} />));
    const headers = [...shown(wide).querySelectorAll("thead th")].map((h) => h.textContent);
    expect(headers).toEqual(["Wallet", "Holding", "Value", "Share", "7d", "30d"]);
    const cells = [...shown(wide).querySelectorAll("tbody tr")][1]!.querySelectorAll("td");
    expect(cells[3]!.textContent).toBe("+7.6%");
    // A column Nansen sent nothing for is a dash, not a flat 0%.
    expect(cells[4]!.textContent).toBe("—");
  });

  it("states the 24h measurement rather than writing it into a comment", () => {
    const c = render(expanded(<SpotBody panel={panel()} initialTab="holders" depth={depthOf({ spotHolders: holders })} />));
    const text = shown(c).textContent ?? "";
    expect(text).toContain("reports a 24h balance change of exactly zero");
    expect(text).toContain("have never sent a token out");
  });
});

describe("2.1 transfers state the movement and never the motive", () => {
  const transfers = {
    transfers: [
      { timestampIso: "2026-09-19T20:48:01Z", txHash: "65pD", fromAddress: "8wM4", fromLabel: "Token Millionaire", toAddress: "3Lzm", toLabel: "Token Millionaire", kind: "transfer", amount: 2_969_647, valueUsd: 628_268 },
    ],
    windowHours: 24,
    isLastPage: false,
    credits: 1,
    errors: [],
  };

  /** The transfers sit under the exchange-flow line they explain, so the tab needs a flow row. */
  const withFlow = () => panel({ flow: flowIntel.data[0] as SpotPanel["flow"], viewFlow: flowIntel.data[0] as SpotPanel["flow"] });

  it("is a priced button on a free tab, not a spend on opening it", () => {
    const asked: DepthSection[][] = [];
    const c = render(<SpotBody panel={withFlow()} initialTab="flow" depth={depthOf({})} onNeedSections={(s) => asked.push(s)} />);
    expect(asked).toEqual([]);
    const button = [...c.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("largest transfers"))!;
    expect(button.textContent).toContain("1 credit");
    click(button);
    expect(asked).toEqual([["spotTransfers"]]);
  });

  it("names both wallets and refuses to read a motive into the movement", () => {
    const c = render(<SpotBody panel={withFlow()} initialTab="flow" depth={depthOf({ spotTransfers: transfers })} />);
    const text = c.textContent ?? "";
    expect(text).toContain("it is not a trade and says nothing about intent");
    for (const wrong of ["sold", "dumped", "sell pressure", "deposit to sell"]) expect(text.toLowerCase()).not.toContain(wrong);
  });
});
