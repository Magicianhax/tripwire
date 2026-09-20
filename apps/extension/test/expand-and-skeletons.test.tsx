// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepthSection, PerpPosition } from "@tripwire/core";
import { DEPTH_SECTION_CREDITS } from "@tripwire/core";
import type { DepthResponse, GuardResponse, PerpPanel, PostIntelResponse, SpotPanel } from "../lib/api-types";
import { _resetCardSizes, cardSize, setCardSize } from "../lib/card-size";
import { CardSizeContext } from "../lib/ui/card-size";
import { Panel, type DepthLoader } from "../lib/ui/Panel";
import { Popover } from "../lib/ui/Popover";
import { PerpBody } from "../lib/ui/PerpBody";
import { SpotBody } from "../lib/ui/SpotBody";

function mountNode(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const emptySpotPanel: SpotPanel = {
  flow: null,
  flowTimeframe: "1d",
  netflow: null,
  indicators: null,
  marketCapUsd: null,
  topBuyers: null,
  topSellers: null,
  postTimeIso: null,
  errors: [],
};

function spotIntel(): PostIntelResponse {
  return { verdict: "CLEAR", hits: [], unavailable: [], signals: [], panel: emptySpotPanel, rulesPreset: "balanced" };
}

function position(i: number): PerpPosition {
  return {
    address: `0x${i.toString(16).padStart(40, "0")}`,
    address_label: `Trader ${i}`,
    side: i % 2 === 0 ? "Long" : "Short",
    position_value_usd: 1_000_000 - i * 1_000,
    leverage: "5X",
    entry_price: 2_000,
    mark_price: 2_500,
    liquidation_price: 2_400 + i,
    upnl_usd: 1_000,
  };
}

function perpGuard(positions = 20): GuardResponse {
  const panel: PerpPanel = {
    coin: "ETH",
    mode: "panel",
    screener: {
      token_symbol: "ETH",
      mark_price: 2_500,
      funding: 0.0000125,
      open_interest: 1,
      current_smart_money_position_longs_usd: 10,
      current_smart_money_position_shorts_usd: -5,
      smart_money_longs_count: 2,
      smart_money_shorts_count: 1,
    },
    positions: Array.from({ length: positions }, (_, i) => position(i)),
    positionsIsLastPage: false,
    positionsReturned: positions,
    trades: null,
    cohorts: null,
    cohortsAtIso: null,
    tradesError: null,
    cohortsError: null,
    errors: [],
  };
  return { target: { kind: "perp", coin: "ETH" }, verdict: "CLEAR", hits: [], unavailable: [], signals: [], panel, rulesPreset: "balanced" };
}

const emptyDepth: DepthResponse = { credits: 0, skipped: [] };

/** A loader that records what it was asked for and resolves on command. */
function recordingLoader(): { loader: DepthLoader; calls: DepthSection[][]; resolveAll(data?: DepthResponse): Promise<void> } {
  const calls: DepthSection[][] = [];
  const pending: ((v: { ok: true; data: DepthResponse }) => void)[] = [];
  return {
    calls,
    loader: (sections) => {
      calls.push(sections);
      return new Promise((resolve) => pending.push(resolve));
    },
    async resolveAll(data = emptyDepth) {
      await act(async () => {
        for (const r of pending.splice(0)) r({ ok: true, data });
      });
    },
  };
}

beforeEach(() => _resetCardSizes());

describe("the card mounts before its data", () => {
  it("renders the header and a skeleton per section with no data at all", () => {
    const { container, root } = mountNode(<Panel data={null} title="$WIF" onClose={() => {}} chain="solana" />);
    // The card exists on the first render: no await anywhere above this line.
    const card = container.querySelector(".tw-card")!;
    expect(card).not.toBeNull();
    expect(card.getAttribute("aria-busy")).toBe("true");
    // The header already says what the click knew.
    expect(container.querySelector(".tw-card-symbol")?.textContent).toBe("$WIF");
    // And the verdict pill is the spinner, never a verdict word.
    expect(container.querySelector(".tw-card-plate")?.textContent).toBe("Checking");
    // Every section is a placeholder that reserves its height.
    expect(container.querySelectorAll(".tw-skeleton").length).toBeGreaterThan(1);
    expect(container.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain("Loading");
    root.unmount();
  });

  it("shapes the skeletons for the kind of card it is", () => {
    const spot = mountNode(<Panel data={null} title="$WIF" onClose={() => {}} />);
    expect([...spot.container.querySelectorAll(".tw-skeleton")].map((s) => s.getAttribute("data-shape"))).toEqual(["gauge", "chart", "tile"]);
    expect(spot.container.querySelector(".tw-card-loading")?.getAttribute("data-kind")).toBe("spot");
    expect([...spot.container.querySelectorAll("[data-skeleton-slot]")].map((s) => s.getAttribute("data-skeleton-slot"))).toEqual([
      "primary",
      "secondary",
      "tertiary",
    ]);
    spot.root.unmount();

    const perp = mountNode(<Panel data={null} title="ETH" onClose={() => {}} target={{ kind: "perp", coin: "ETH" }} />);
    expect([...perp.container.querySelectorAll(".tw-skeleton")].map((s) => s.getAttribute("data-shape"))).toEqual(["gauge", "tile", "table"]);
    perp.root.unmount();
  });

  it("swaps the skeletons for the real card when the data lands, and drops aria-busy", () => {
    const { container, root } = mountNode(<Panel data={null} title="$WIF" onClose={() => {}} />);
    expect(container.querySelectorAll(".tw-skeleton").length).toBeGreaterThan(0);
    act(() => {
      root.render(<Panel data={spotIntel()} title="$WIF" onClose={() => {}} />);
    });
    expect(container.querySelector(".tw-card")?.getAttribute("aria-busy")).toBeNull();
    expect(container.querySelector(".tw-card-finding")?.textContent).toBe("None of your rules fired on this token.");
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3);
    root.unmount();
  });

  it("shows the named reason instead of a skeleton that never ends", () => {
    const { container, root } = mountNode(<Panel data={null} error="Nansen flow data unavailable for this token on base" title="$WIF" onClose={() => {}} />);
    expect(container.querySelector(".tw-card")?.getAttribute("aria-busy")).toBeNull();
    expect(container.querySelector(".tw-dock-error")?.textContent).toBe("Nansen flow data unavailable for this token on base");
    expect(container.querySelectorAll(".tw-skeleton").length).toBe(0);
    root.unmount();
  });

  it("holds the finding's line open so the body below it doesn't shift when the sentence lands", () => {
    const { container, root } = mountNode(<Panel data={null} title="$WIF" onClose={() => {}} />);
    expect(container.querySelector(".tw-card-finding-pending")).not.toBeNull();
    root.unmount();
  });
});

describe("a tab loads exactly what it draws, once", () => {
  it("asks for the first tab's sections on open and nothing else", async () => {
    const { loader, calls, resolveAll } = recordingLoader();
    const { root } = mountNode(<Panel data={perpGuard()} title="ETH" onClose={() => {}} onDepth={loader} />);
    await resolveAll();
    // Positioning is the first tab: its two free sections, and not the 11-credit Traders one.
    expect(calls).toEqual([["perpMarket", "perpVenues"]]);
    expect(calls.flat()).not.toContain("perpTraders");
    root.unmount();
  });

  it("fires one request per tab and never repeats a section", async () => {
    const { loader, calls, resolveAll } = recordingLoader();
    const { container, root } = mountNode(<Panel data={perpGuard()} title="ETH" onClose={() => {}} onDepth={loader} />);
    await resolveAll();
    const traders = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.startsWith("Traders"))!;
    act(() => traders.click());
    await resolveAll();
    expect(calls).toEqual([["perpMarket", "perpVenues"], ["perpTraders"]]);

    // Back and forth: neither tab asks again.
    const positioning = container.querySelector<HTMLButtonElement>('[role="tab"]')!;
    act(() => positioning.click());
    act(() => traders.click());
    await resolveAll();
    expect(calls.length).toBe(2);
    root.unmount();
  });

  it("prints what the paid tab costs on the tab itself", () => {
    const { container, root } = mountNode(<Panel data={perpGuard()} title="ETH" onClose={() => {}} />);
    const traders = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith("Traders"))!;
    expect(traders.querySelector(".tw-tab-cost")?.textContent).toBe(`${DEPTH_SECTION_CREDITS.perpTraders} credits`);
    // The free tabs say nothing, rather than saying "free" four times.
    expect(container.querySelector('[role="tab"]')!.querySelector(".tw-tab-cost")).toBeNull();
    root.unmount();
  });

  it("shows the tab's own skeletons while its first load is in flight", async () => {
    const { loader, resolveAll } = recordingLoader();
    const { container, root } = mountNode(<Panel data={perpGuard()} title="ETH" onClose={() => {}} onDepth={loader} />);
    const panel = container.querySelector('[role="tabpanel"]:not([hidden])')!;
    expect(panel.querySelectorAll(".tw-skeleton").length).toBeGreaterThan(0);
    await resolveAll();
    expect(panel.querySelectorAll(".tw-skeleton").length).toBe(0);
    root.unmount();
  });

  it("replaces a failed section's skeleton with its reason", async () => {
    const failing: DepthLoader = async () => ({ ok: false, error: "Backend unreachable" });
    const { container, root } = mountNode(<Panel data={perpGuard()} title="ETH" onClose={() => {}} onDepth={failing} />);
    await act(async () => {});
    const traders = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.startsWith("Traders"))!;
    act(() => traders.click());
    await act(async () => {});
    const panel = [...container.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hasAttribute("hidden"))!;
    expect(panel.textContent).toContain("Backend unreachable");
    expect(panel.querySelectorAll(".tw-skeleton").length).toBe(0);
    root.unmount();
  });
});

describe("expanding the card", () => {
  it("keeps the persisted expanded first frame in the same named two-column skeleton", () => {
    const { container, root } = mountNode(
      <Popover anchor={null} onClose={() => {}} size="expanded" onToggleSize={() => {}}>
        <Panel data={null} title="$WIF" onClose={() => {}} />
      </Popover>,
    );
    const card = container.querySelector('.tw-card[data-size="expanded"]')!;
    expect(card.querySelector('.tw-card-loading[data-kind="spot"]')).not.toBeNull();
    expect([...card.querySelectorAll("[data-skeleton-slot]")].map((s) => s.getAttribute("data-skeleton-slot"))).toEqual([
      "primary",
      "secondary",
      "tertiary",
    ]);
    root.unmount();
  });

  it("is the same card at a different size, with the toggle in the header", () => {
    let size: "compact" | "expanded" = "compact";
    const render = () => (
      <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={() => {}}>
        <Panel data={perpGuard()} title="ETH" onClose={() => {}} />
      </Popover>
    );
    const { container, root } = mountNode(render());
    const pop = container.querySelector(".tw-pop")!;
    expect(pop.getAttribute("data-size")).toBe("compact");
    expect(pop.getAttribute("aria-modal")).toBe("false");
    expect(container.querySelector(".tw-pop-backdrop")).toBeNull();
    const expand = container.querySelector(".tw-card-size")!;
    expect(document.getElementById(expand.getAttribute("aria-labelledby")!)?.textContent).toBe("Expand card");
    const traders = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent?.startsWith("Traders"))!;
    act(() => traders.click());
    expect(traders.getAttribute("aria-selected")).toBe("true");

    size = "expanded";
    act(() => root.render(render()));
    const expanded = container.querySelector(".tw-pop")!;
    expect(expanded.getAttribute("data-size")).toBe("expanded");
    // Expanded covers the page and traps focus, so it says it is modal.
    expect(expanded.getAttribute("aria-modal")).toBe("true");
    expect(container.querySelector(".tw-pop-backdrop")).not.toBeNull();
    const collapse = container.querySelector(".tw-card-size")!;
    expect(document.getElementById(collapse.getAttribute("aria-labelledby")!)?.textContent).toBe("Collapse card");
    expect([...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent?.startsWith("Traders"))?.getAttribute("aria-selected")).toBe(
      "true",
    );
    root.unmount();
  });

  it("presses the toggle and reports the flip", () => {
    const onToggleSize = vi.fn();
    const { container, root } = mountNode(
      <Popover anchor={null} onClose={() => {}} size="compact" onToggleSize={onToggleSize}>
        <Panel data={perpGuard()} title="ETH" onClose={() => {}} />
      </Popover>,
    );
    act(() => (container.querySelector(".tw-card-size") as HTMLButtonElement).click());
    expect(onToggleSize).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("shows no toggle at all on a card with no size control", () => {
    const { container, root } = mountNode(
      <Popover anchor={null} onClose={() => {}}>
        <Panel data={perpGuard()} title="ETH" onClose={() => {}} />
      </Popover>,
    );
    expect(container.querySelector(".tw-card-size")).toBeNull();
    root.unmount();
  });

  it("traps Tab inside the expanded card, and does not trap it in the anchored one", () => {
    const { container, root } = mountNode(
      <Popover anchor={null} onClose={() => {}} size="expanded" onToggleSize={() => {}}>
        <Panel data={perpGuard()} title="ETH" onClose={() => {}} />
      </Popover>,
    );
    const pop = container.querySelector<HTMLElement>(".tw-pop")!;
    const stops = [...pop.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
      (el) => el.tabIndex >= 0 && el.closest("[hidden]") === null,
    );
    expect(stops.length).toBeGreaterThan(2);
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;

    // Tab off the end wraps to the front.
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      last.dispatchEvent(forward);
    });
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    // Shift+Tab off the front wraps to the back.
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(back);
    });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    root.unmount();

    // The anchored card sits beside a page the user is still reading, so it never traps.
    const anchored = mountNode(
      <Popover anchor={null} onClose={() => {}} size="compact" onToggleSize={() => {}}>
        <Panel data={perpGuard()} title="ETH" onClose={() => {}} />
      </Popover>,
    );
    const anchoredPop = anchored.container.querySelector<HTMLElement>(".tw-pop")!;
    const anchoredLast = [...anchoredPop.querySelectorAll<HTMLElement>("button")].filter((b) => b.tabIndex >= 0).pop()!;
    anchoredLast.focus();
    const free = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      anchoredLast.dispatchEvent(free);
    });
    expect(free.defaultPrevented).toBe(false);
    anchored.root.unmount();
  });

  it("keeps all positions reachable through compact pages in both sizes", () => {
    const countRows = (size: "compact" | "expanded") => {
      const { container, root } = mountNode(
        <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={() => {}}>
          <Panel data={perpGuard(20)} title="ETH" onClose={() => {}} initialTab="liquidations" />
        </Popover>,
      );
      const pane=container.querySelector('[role="tabpanel"]:not([hidden])')!;
      const rows = pane.querySelectorAll('.tw-table tbody tr').length;
      const seen=new Set<string>();
      for (;;) {
        for(const row of pane.querySelectorAll('.tw-table tbody tr'))seen.add(row.textContent??"");
        const next=pane.querySelector<HTMLButtonElement>('[aria-label="Next page"]');
        if(!next||next.disabled)break;
        act(()=>next.click());
      }
      expect(seen.size).toBe(20);
      root.unmount();
      return rows;
    };
    expect(countRows("compact")).toBe(6);
    expect(countRows("expanded")).toBe(6);
  });

  it("gives the expanded spot card a Holders tab, and the compact one none", () => {
    const tabsAt = (size: "compact" | "expanded") => {
      const { container, root } = mountNode(
        <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={() => {}}>
          <Panel data={spotIntel()} title="$WIF" onClose={() => {}} />
        </Popover>,
      );
      const labels = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
      root.unmount();
      return labels;
    };
    expect(tabsAt("compact")).toEqual(["Flow", "Wallets", "Risk"]);
    expect(tabsAt("expanded")).toEqual(["Flow", "Wallets", "Risk", `Holders${DEPTH_SECTION_CREDITS.spotHolders} credits`]);
  });

  it("gives expanded Spot Flow explicit window, gauges, chart and netflow layout hooks", () => {
    const panel: SpotPanel = {
      ...emptySpotPanel,
      flow: {
        smart_trader_net_flow_usd: 1,
        smart_trader_wallet_count: 1,
        whale_net_flow_usd: 2,
        whale_wallet_count: 1,
        public_figure_net_flow_usd: 3,
        public_figure_wallet_count: 1,
        top_pnl_net_flow_usd: 4,
        top_pnl_wallet_count: 1,
        exchange_net_flow_usd: 0,
        fresh_wallets_net_flow_usd: 5,
        fresh_wallets_wallet_count: 1,
      },
      netflow: { h1: 1, h24: 2, d7: 3, d30: 4, symbol: "WIF", traders: 4 },
    };
    const { container, root } = mountNode(
      <CardSizeContext.Provider value="expanded">
        <SpotBody panel={panel} timeframe={{ value: "1d", pending: null, onChange: () => {} }} />
      </CardSizeContext.Provider>,
    );
    const layout = container.querySelector(".tw-spot-flow-layout")!;
    expect([...layout.children].map((child) => child.className)).toEqual([
      "tw-window",
      "tw-spot-flow-gauges",
      "tw-spot-flow-chart",
      "tw-spot-flow-netflow",
    ]);
    root.unmount();
  });

  it("uses a dedicated eight-tile market grid hook in expanded positioning", () => {
    const depth: DepthResponse = {
      credits: 0,
      skipped: [],
      perpMarket: {
        market: {
          coin: "ETH",
          markPrice: 2500,
          oraclePrice: 2499,
          midPrice: 2500,
          premiumPct: 0.04,
          fundingHourly: 0.0001,
          fundingPer8h: 0.0008,
          fundingAnnualPct: 8,
          openInterestCoins: 100,
          openInterestUsd: 250_000,
          dayVolumeUsd: 1_000_000,
          dayChangePct: 2,
          maxLeverage: 50,
        },
        book: null,
        funding: null,
        errors: [],
      },
    };
    const { container, root } = mountNode(
      <CardSizeContext.Provider value="expanded">
        <PerpBody
          panel={{ coin: "ETH", mode: "panel", screener: null, positions: null, positionsIsLastPage: null, positionsReturned: null, trades: null, cohorts: null, cohortsAtIso: null, tradesError: null, cohortsError: null, errors: [] }}
          depth={{ data: depth, loading: [], failed: {} }}
        />
      </CardSizeContext.Provider>,
    );
    expect(container.querySelectorAll(".tw-market-readouts > .tw-readouts > div")).toHaveLength(8);
    root.unmount();
  });

  it("keeps compact trader lists at five and caps expanded leaderboard and trades at twelve", () => {
    const depth: DepthResponse = {
      credits: 11,
      skipped: [],
      perpTraders: {
        leaderboard: Array.from({ length: 20 }, (_, i) => ({
          address: `0x${i}`,
          label: `Leader ${i}`,
          side: "Long",
          realizedPnlUsd: i,
          unrealizedPnlUsd: i,
          totalPnlUsd: i,
          positionValueUsd: i,
          holdingAmount: i,
          roiPct: i,
          tradeCount: i,
        })),
        trades: Array.from({ length: 20 }, (_, i) => ({
          address: `0x${i}`,
          label: `Trader ${i}`,
          side: "Long",
          action: "Buy",
          valueUsd: i,
          priceUsd: i,
          tokenAmount: i,
          orderType: "Market",
          timestamp: null,
        })),
        topAccounts: [],
        topAccountsHere: 0,
        credits: 11,
        errors: [],
      },
    };
    const countsAt = (size: "compact" | "expanded") => {
      const { container, root } = mountNode(
        <CardSizeContext.Provider value={size}>
          <PerpBody
            panel={{ coin: "ETH", mode: "panel", screener: null, positions: null, positionsIsLastPage: null, positionsReturned: null, trades: null, cohorts: null, cohortsAtIso: null, tradesError: null, cohortsError: null, errors: [] }}
            initialTab="traders"
            depth={{ data: depth, loading: [], failed: {} }}
          />
        </CardSizeContext.Provider>,
      );
      const counts = [
        container.querySelectorAll('section[aria-label="Top traders in ETH by PnL"] tbody tr').length,
        container.querySelectorAll('section[aria-label="Largest recent trades"] .tw-trade-list > li').length,
      ];
      root.unmount();
      return counts;
    };
    expect(countsAt("compact")).toEqual([5, 5]);
    expect(countsAt("expanded")).toEqual([12, 12]);
  });
});

describe("the remembered size", () => {
  it("defaults to compact and is per kind of card", () => {
    expect(cardSize("perp")).toBe("compact");
    _resetCardSizes({ perp: "expanded" });
    expect(cardSize("perp")).toBe("expanded");
    // Wanting big perp cards does not mean wanting big wallet cards.
    expect(cardSize("wallet")).toBe("compact");
  });

  it("is readable synchronously right after it is set, because a card cannot await storage", () => {
    // No extension storage in this DOM at all, which is also what a revoked profile looks like:
    // the preference is lost, the card is not.
    expect(() => setCardSize("perp", "expanded")).not.toThrow();
    expect(cardSize("perp")).toBe("expanded");
  });
});
