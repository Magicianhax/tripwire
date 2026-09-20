// @vitest-environment happy-dom
//
// Round 1.5 — the wallet card: one dead code path, four free fields, two lazy additions.
// Brief: docs/IMPROVEMENT-PLAN.md §2, Round 1.5 (1.5.1–1.5.7).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PolymarketBadge, WalletDefiResponse, WalletLensResponse, WalletUnrealizedResponse } from "../lib/api-types";
import { WalletCard } from "../lib/ui/WalletCard";
import { PolymarketBody } from "../lib/ui/VenueBody";

const EVM = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
const ref = { kind: "evm", query: EVM } as const;

function mountNode(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const lens = (over: Partial<WalletLensResponse> = {}): WalletLensResponse => ({
  input: EVM,
  resolved: true,
  address: EVM,
  chainGuess: "arbitrum",
  name: null,
  label: null,
  portfolio: {
    totalUsd: 41_000,
    tokenCount: 12,
    chains: ["hyperevm", "arbitrum"],
    chainHoldings: [
      { chain: "hyperevm", valueUsd: 24_096 },
      { chain: "arbitrum", valueUsd: 2_306 },
    ],
    holdings: [{ symbol: "HYPE", name: "HYPE", chain: "arbitrum", tokenAddress: EVM, amount: 248.5, valueUsd: 20_519 }],
  },
  pnl: {
    realizedPnlUsd: 19_460.94,
    realizedPnlPercent: 0.0023448,
    winRate: 0.8,
    tradeCount: 160,
    tokenCount: 10,
    windowDays: 90,
    topPnlTokens: [
      { symbol: "LIT", chain: "ethereum", tokenAddress: EVM, realizedPnlUsd: 27_931.24, realizedRoi: 0.0071355 },
      { symbol: "ASTER", chain: "bsc", tokenAddress: EVM, realizedPnlUsd: -8_432.27, realizedRoi: null },
    ],
  },
  hyperliquid: null,
  polymarket: null,
  nansenUrl: `https://app.nansen.ai/profiler?address=${EVM}&chain=arbitrum`,
  sources: ["Nansen Profiler"],
  credits: 5,
  message: null,
  errors: [],
  ...over,
});

const text = (container: HTMLElement) => container.textContent ?? "";
const findButton = (container: HTMLElement, match: RegExp) => [...container.querySelectorAll("button")].find((b) => match.test(b.textContent ?? "")) ?? null;
const openView = (container: HTMLElement, label: string) => {
  const radio = [...container.querySelectorAll('[role="radio"]')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
  act(() => radio!.click());
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("1.5.1 — the label line", () => {
  it("no longer offers an entity match it can never have, and names the call that can answer", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} onLoadDefi={async () => {}} />);
    expect(text(container)).toContain("Nansen names a wallet from its DEX trades");
    expect(text(container)).not.toContain("Open Nansen for the full profile");
    root.unmount();
  });

  it("a paid answer with no label leaves the empty state, and says which chain was asked", () => {
    const defi: WalletDefiResponse = { address: EVM, defi: null, label: null, labelChain: "hyperevm", credits: 2, errors: [] };
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} defi={defi} onLoadDefi={async () => {}} />);
    expect(text(container)).toContain("No Nansen trade label for this wallet on hyperevm");
    root.unmount();
  });

  it("a label that did come back reads as the Nansen label, wherever it was bought", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens({ label: { text: "Jump Trading", kind: "fund", tags: [] } })} error={null} onClose={() => {}} onLoadDefi={async () => {}} />,
    );
    expect(text(container)).toContain("Nansen label:");
    expect(text(container)).toContain("Jump Trading");
    root.unmount();
  });
});

describe("1.5.2 — realized ROI", () => {
  it("prints the wallet's ROI beside its money, without rounding a real return to zero", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    openView(container, "Performance");
    // 0.0023448 is +0.23%. Whole-percent rounding would print "0%" for a +$19.5K year.
    expect(text(container)).toContain("+$19.5K");
    expect(text(container)).toContain("+0.23%");
    expect(text(container)).not.toMatch(/Realized ROI[^%]*0%/);
    root.unmount();
  });

  it("puts each row's own ROI beside its PnL, and a row without one keeps its money", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    openView(container, "Performance");
    const rows = [...container.querySelectorAll(".tw-pnl-chart-row")];
    expect(text(rows[0] as HTMLElement)).toContain("+0.71%");
    expect(text(rows[1] as HTMLElement)).toContain("−$8.43K");
    expect(text(rows[1] as HTMLElement)).not.toContain("%");
    root.unmount();
  });
});

describe("1.5.3 — the chain split", () => {
  it("is a view of the one allocation chart, not a second chart beside it", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    expect(container.querySelectorAll(".tw-allocation").length).toBe(1);
    expect(text(container)).toContain("HYPE");
    openView(container, "By chain");
    expect(container.querySelectorAll(".tw-allocation").length).toBe(1);
    expect(text(container)).toContain("hyperevm");
    root.unmount();
  });

  it("says so rather than drawing an empty chart when no chain split came back", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens({ portfolio: { totalUsd: 0, tokenCount: 0, chains: [], chainHoldings: [], holdings: [] } })} error={null} onClose={() => {}} />,
    );
    openView(container, "By chain");
    expect(text(container)).toContain("No chain split returned");
    root.unmount();
  });
});

describe("1.5.6 — DeFi holdings", () => {
  it("does not fire on card open, or on a view change, and prints its price first", () => {
    const onLoadDefi = vi.fn(async () => {});
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} onLoadDefi={onLoadDefi} />);
    expect(onLoadDefi).not.toHaveBeenCalled();
    // The view switcher is arrow-key navigable: spending on activation would be a credit a keypress.
    openView(container, "Performance");
    openView(container, "Summary");
    expect(onLoadDefi).not.toHaveBeenCalled();

    const button = findButton(container, /Check DeFi and label/);
    expect(button?.textContent).toContain("(2 credits)");
    act(() => button!.click());
    expect(onLoadDefi).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("an empty answer is unchecked, never $0, and never a balance claim", () => {
    const defi: WalletDefiResponse = {
      address: EVM,
      defi: { totalValueUsd: 0, totalAssetsUsd: 0, totalDebtsUsd: 0, totalRewardsUsd: 0, tokenCount: 0, protocolCount: 0, reportedNone: true },
      label: null,
      labelChain: "ethereum",
      credits: 2,
      errors: [],
    };
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} defi={defi} onLoadDefi={async () => {}} />);
    const section = container.querySelector('[aria-label="DeFi positions"]') as HTMLElement;
    expect(text(section)).toContain("no DeFi positions");
    expect(text(section)).toContain("not a balance of $0");
    expect(text(section)).not.toContain("DeFi value");
    root.unmount();
  });

  it("shows DeFi beside the token portfolio, never summed into it, with debts on their own line", () => {
    const defi: WalletDefiResponse = {
      address: EVM,
      defi: { totalValueUsd: 125_000, totalAssetsUsd: 200_000, totalDebtsUsd: 75_000, totalRewardsUsd: 1_200, tokenCount: 7, protocolCount: 3, reportedNone: false },
      label: null,
      labelChain: "ethereum",
      credits: 2,
      errors: [],
    };
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} defi={defi} onLoadDefi={async () => {}} />);
    const body = text(container);
    // The token portfolio is unchanged: $41K, not $166K.
    expect(body).toContain("$41K");
    expect(body).toContain("$125K");
    expect(body).not.toContain("$166K");
    const section = text(container.querySelector('[aria-label="DeFi positions"]') as HTMLElement);
    expect(section).toContain("Borrowed");
    expect(section).toContain("$75K");
    expect(section).toContain("receipt tokens appear in both");
    root.unmount();
  });
});

describe("1.5.7 — unrealized PnL and cost basis", () => {
  const unrealized: WalletUnrealizedResponse = {
    address: EVM,
    windowDays: 90,
    credits: 1,
    truncated: false,
    errors: [],
    rows: [
      { symbol: "ETH", unrealizedPnlUsd: 104.29, unrealizedRoi: 0.3702, costBasisUsd: 1880.5, holdingUsd: 386.46, holdingAmount: 0.15, avgSoldPriceUsd: 1828.79, buys: 13, sells: 3 },
      { symbol: "BNB", unrealizedPnlUsd: 65.91, unrealizedRoi: 0.2124, costBasisUsd: 620.88, holdingUsd: 376.17, holdingAmount: 0.5, avgSoldPriceUsd: null, buys: 0, sells: 0 },
      { symbol: "ETH", unrealizedPnlUsd: null, unrealizedRoi: null, costBasisUsd: null, holdingUsd: null, holdingAmount: null, avgSoldPriceUsd: null, buys: null, sells: null },
    ],
  };

  it("waits for its own priced button, inside the Performance view", () => {
    const onLoad = vi.fn(async () => {});
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} onLoadUnrealized={onLoad} />);
    openView(container, "Performance");
    expect(onLoad).not.toHaveBeenCalled();
    const button = findButton(container, /Load unrealized PnL/);
    expect(button?.textContent).toContain("(1 credit)");
    act(() => button!.click());
    expect(onLoad).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("renders a null as a dash, never as a zero, and keeps the two ETH rows apart", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} unrealized={unrealized} onLoadUnrealized={async () => {}} />);
    openView(container, "Performance");
    const rows = [...container.querySelectorAll('[aria-label="Open positions and cost basis"] tbody tr')];
    expect(rows).toHaveLength(3);
    const empty = [...rows[2]!.querySelectorAll("td")].slice(1).map((td) => td.textContent);
    expect(empty).toEqual(["—", "—", "—"]);
    expect(empty).not.toContain("$0");
    expect(rows.filter((r) => r.textContent?.startsWith("ETH"))).toHaveLength(2);
    root.unmount();
  });

  it("states both measured caveats on screen: no chain per row, and transfers have no cost basis", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} unrealized={unrealized} onLoadUnrealized={async () => {}} />);
    openView(container, "Performance");
    const section = text(container.querySelector('[aria-label="Open positions and cost basis"]') as HTMLElement);
    expect(section).toContain("does not say which chain");
    expect(section).toContain("arrived by transfer");
    root.unmount();
  });

  it("does not mix its rows into the realized top-5 list beside it", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} unrealized={unrealized} onLoadUnrealized={async () => {}} />);
    openView(container, "Performance");
    const chart = container.querySelector(".tw-pnl-chart") as HTMLElement;
    expect([...chart.querySelectorAll(".tw-row-name")].map((n) => n.textContent)).toEqual(["LIT", "ASTER"]);
    root.unmount();
  });
});

describe("1.5.4 and 1.5.5 — the Polymarket tab", () => {
  const badge = (over: Partial<Omit<PolymarketBadge, "link">> = {}): Omit<PolymarketBadge, "link"> => ({
    totalPnlUsd: 13_788.16,
    realizedPnlUsd: 34_523.68,
    unrealizedPnlUsd: -20_735.52,
    winRate: 0.1219,
    marketsTraded: 558,
    marketsWon: 68,
    firstSeen: "2026-06-05",
    polymarketDays: 104,
    p2pTokensSent: 129_774.82,
    p2pTokensReceived: 0,
    openPositions: [],
    trades: [],
    settled: [
      { marketId: "3954346", question: "Will WTI Crude Oil hit $105 in September?", side: "Yes", costUsd: 2467.5, proceedsUsd: 15_805.79, redemptionUsd: 0, pnlUsd: 13_340.43 },
      { marketId: "4441305", question: "Will Bitcoin be above $72,000?", side: "No", costUsd: 900, proceedsUsd: 0, redemptionUsd: 0, pnlUsd: -744.52 },
    ],
    settledCount: 494,
    settledPnlUsd: 16_815.68,
    errors: [],
    ...over,
  });

  it("1.5.4 — names the date as Polymarket activity, not as the age of the wallet", () => {
    const { container, root } = mountNode(<PolymarketBody badge={badge()} />);
    const body = text(container);
    expect(body).toContain("Trading on Polymarket since");
    expect(body).toContain("2026-06-05");
    expect(body).toContain("not the age of the address");
    expect(body).not.toMatch(/wallet age/i);
    root.unmount();
  });

  it("1.5.4 — a wallet Nansen has no first-seen date for simply has no line", () => {
    const { container, root } = mountNode(<PolymarketBody badge={badge({ firstSeen: null, polymarketDays: null })} />);
    expect(text(container)).not.toContain("Trading on Polymarket since");
    root.unmount();
  });

  it("1.5.5 — lists settled markets, says what they are a slice of, and paginates", () => {
    const { container, root } = mountNode(<PolymarketBody badge={badge()} />);
    const section = container.querySelector('[aria-label="Settled markets"]') as HTMLElement;
    expect(text(section)).toContain("2 largest of 494");
    expect(text(section)).toContain("WTI Crude Oil");
    expect(text(section)).toContain("+$13.3K");
    expect(text(section)).toContain("−$745");
    root.unmount();
  });

  it("1.5.5 — states that the settled sum is not the Realized tile, because measured it is not", () => {
    const { container, root } = mountNode(<PolymarketBody badge={badge()} />);
    const section = text(container.querySelector('[aria-label="Settled markets"]') as HTMLElement);
    expect(section).toContain("+$16.8K");
    expect(section).toContain("not the Realized tile");
    root.unmount();
  });

  it("1.5.5 — an older backend that sends no settled rows gets an empty state, not a crash", () => {
    const { container, root } = mountNode(<PolymarketBody badge={badge({ settled: undefined, settledCount: undefined, settledPnlUsd: undefined })} />);
    expect(text(container.querySelector('[aria-label="Settled markets"]') as HTMLElement)).toContain("No settled Polymarket markets");
    root.unmount();
  });
});
