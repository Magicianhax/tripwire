// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthorBadgesResponse } from "../lib/api-types";
import { badgeAnchor } from "../lib/x/badge-anchor";
import { parseLinkAddress } from "../lib/x/link-form";
import { BadgeCard } from "../lib/ui/BadgeCard";
import { BadgeRow } from "../lib/ui/BadgeRow";
import { LinkWallet } from "../lib/ui/LinkWallet";
import { Popover } from "../lib/ui/Popover";

const FIXTURES_DIR = resolve(process.cwd(), "../../fixtures/html");
const HL = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

function loadFixture(name: string): Element {
  document.body.innerHTML = readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
  const article = document.body.querySelector('article[data-testid="tweet"]');
  if (!article) throw new Error(`fixture ${name} has no outer article`);
  return article;
}

/** React tracks an input's value, so a plain `input.value = x` looks like no change: set it
 * through the native setter the way a real keystroke does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function mountNode(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const badges: AuthorBadgesResponse = {
  handle: "degenalpha",
  errors: [],
  nansen: {
    entity: "Vitalik Buterin",
    tags: ["Public Figure"],
    matchedBy: "displayName",
    totalHoldingsUsd: 595_345_196,
    topHoldings: [
      { symbol: "ETH", chain: "ethereum", valueUsd: 595_345_196 },
      { symbol: "STKGHO", chain: "ethereum", valueUsd: 11_909_501 },
      { symbol: "USDC", chain: "base", valueUsd: 1_000 },
    ],
    realizedPnlUsd: 9_594_142,
    winRate: 0.5285,
    pnlWindowDays: 90,
    errors: [],
  },
  hyperliquid: {
    link: { address: HL, source: "user", sourceUrl: null },
    accountValueUsd: 32_067_508,
    marginUsedUsd: 13_149_214,
    totalNotionalUsd: 121_193_987,
    withdrawableUsd: 16_175_669,
    maintenanceMarginUsd: 5_570_921,
    positions: [
      { coin: "ETH", side: "short", size: 13_980.58, entryPx: 2299.4, markPx: 2462.4, liquidationPx: 4320.47, unrealizedPnlUsd: -2_278_791, leverage: 25, valueUsd: 34_425_803, returnOnEquity: null, cumFundingAllTimeUsd: null, cumFundingSinceOpenUsd: null, maxLeverage: null, marginUsedUsd: null },
      { coin: "BTC", side: "long", size: 31.65, entryPx: 76_727.4, markPx: 76_651.9, liquidationPx: null, unrealizedPnlUsd: -2420, leverage: 30, valueUsd: 2_426_250, returnOnEquity: null, cumFundingAllTimeUsd: null, cumFundingSinceOpenUsd: null, maxLeverage: null, marginUsedUsd: null },
    ],
    fills: [{ time: 1_789_667_907_049, coin: "ZEC", dir: "Close Short", px: 1479.2, sz: 0.07, closedPnlUsd: -14.86 }],
    fillsRealizedPnlUsd: 1234.5,
    fillsWindow: { count: 50, fromMs: 1_789_660_000_000, toMs: 1_789_667_907_049 },
    nansenPerp: { realizedPnlUsd: 945_199, winRate: 0.62, windowDays: 30 },
    errors: [],
  },
  polymarket: {
    link: { address: HL, source: "curated", sourceUrl: "https://example.org/proof" },
    totalPnlUsd: 13_788.15,
    realizedPnlUsd: 34_523.67,
    unrealizedPnlUsd: -20_735.52,
    winRate: 0.1218,
    marketsTraded: 558,
    marketsWon: 68,
    openPositions: [{ marketId: "4441305", question: "Will the price of Bitcoin be above $72,000 on September 17?", side: "No", costUsd: 786.58, valueUsd: 41.98, pnlUsd: -744.52 }],
    trades: [{ timestamp: "2026-09-17T17:58:00", action: "Sell", side: "Yes", size: 200, price: 0.2, usdcValue: 40, question: "Bab el-Mandeb Strait effectively closed by December 31?" }],
    errors: [],
  },
};

describe("badgeAnchor", () => {
  it("returns the outer tweet's display-name link, so badges sit right after the username", () => {
    const article = loadFixture("x-tweet-plain.html");
    const anchor = badgeAnchor(article, "normieuser");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("href")).toBe("/normieuser");
    expect(anchor!.textContent).toBe("Normie User");
    expect(anchor!.closest('[data-testid="User-Name"]')).not.toBeNull();
  });

  it("never anchors inside a quoted tweet's header", () => {
    const article = loadFixture("x-tweet-quote.html");
    const anchor = badgeAnchor(article, "quotefan");
    expect(anchor!.getAttribute("href")).toBe("/quotefan");
    expect(anchor!.closest('[data-testid="quoteTweet"]')).toBeNull();
  });

  it("handles a name split across spans with a verified badge", () => {
    const article = loadFixture("x-tweet-split-name.html");
    const anchor = badgeAnchor(article, "ansem");
    expect(anchor!.getAttribute("href")).toBe("/ansem");
    expect(anchor!.querySelector("svg")).not.toBeNull();
  });

  it("returns null when the header has no name link for that handle", () => {
    const article = loadFixture("x-tweet-plain.html");
    expect(badgeAnchor(article, "someoneelse")).toBeNull();
  });
});

describe("parseLinkAddress", () => {
  it("accepts a 0x address, trimming and lowercasing it", () => {
    expect(parseLinkAddress("hyperliquid", `  ${HL.toUpperCase().replace("0X", "0x")} `)).toEqual({ ok: true, address: HL });
  });

  it("names the problem for an empty, short or non-hex address", () => {
    expect(parseLinkAddress("hyperliquid", "")).toEqual({ ok: false, error: "Paste the wallet address." });
    expect(parseLinkAddress("polymarket", "0x1234")).toEqual({ ok: false, error: "That isn't an address: 0x and 40 hex characters." });
    expect(parseLinkAddress("polymarket", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm")).toEqual({
      ok: false,
      error: "That isn't an address: 0x and 40 hex characters.",
    });
  });
});

describe("BadgeRow", () => {
  it("renders one logo badge per venue, with accessible names and no emoji", () => {
    const { container, root } = mountNode(<BadgeRow handle="degenalpha" badges={badges} open={null} onOpen={() => {}} />);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((b) => document.getElementById(b.getAttribute("aria-labelledby")!)?.textContent)).toEqual([
      "Nansen label for @degenalpha",
      "Hyperliquid account for @degenalpha",
      "Polymarket account for @degenalpha",
    ]);
    expect(buttons.every((b) => b.getAttribute("aria-haspopup") === "dialog")).toBe(true);
    expect(container.querySelectorAll('[role="tooltip"]')).toHaveLength(3);
    expect(buttons.every((b) => !b.hasAttribute("title") && !b.hasAttribute("aria-describedby"))).toBe(true);
    expect(container.querySelectorAll("img.tw-logo")).toHaveLength(3);
    expect(/\p{Extended_Pictographic}/u.test(container.textContent ?? "")).toBe(false);
    root.unmount();
  });

  it("marks the open badge as expanded and reports clicks by venue", () => {
    const onOpen = vi.fn();
    const { container, root } = mountNode(<BadgeRow handle="degenalpha" badges={badges} open="hyperliquid" onOpen={onOpen} />);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
    act(() => {
      buttons[2]!.click();
    });
    expect(onOpen).toHaveBeenCalledWith("polymarket");
    root.unmount();
  });

  it("renders nothing when no badge applies", () => {
    const { container, root } = mountNode(<BadgeRow handle="weatherfan" badges={{ handle: "weatherfan", errors: [] }} open={null} onOpen={() => {}} />);
    expect(container.querySelector("button")).toBeNull();
    root.unmount();
  });
});

describe("BadgeCard", () => {
  const noop = async () => null;

  it("uses the popover size control with compact and expanded semantics", () => {
    const onToggleSize = vi.fn();
    let size: "compact" | "expanded" = "compact";
    const node = () => (
      <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={onToggleSize}>
        <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="nansen" onClose={() => {}} onSave={noop} onUnlink={noop} />
      </Popover>
    );
    const { container, root } = mountNode(node());
    const expand = container.querySelector<HTMLButtonElement>(".tw-card-size")!;
    expect(expand.getAttribute("aria-label")).toBe("Expand card");
    expect(expand.getAttribute("aria-pressed")).toBeNull();
    expect(container.querySelector(".tw-pop")?.getAttribute("data-size")).toBe("compact");
    expect(container.querySelector(".tw-badge-card")?.getAttribute("data-size")).toBe("compact");
    act(() => expand.click());
    expect(onToggleSize).toHaveBeenCalledOnce();

    size = "expanded";
    act(() => root.render(node()));
    const collapse = container.querySelector<HTMLButtonElement>(".tw-card-size")!;
    expect(collapse.getAttribute("aria-label")).toBe("Collapse card");
    expect(collapse.getAttribute("aria-pressed")).toBeNull();
    expect(container.querySelector(".tw-pop")?.getAttribute("data-size")).toBe("expanded");
    expect(container.querySelector(".tw-badge-card")?.getAttribute("data-size")).toBe("expanded");
    root.unmount();
  });

  it("shows one tab per badge and opens on the venue that was clicked", () => {
    const { container, root } = mountNode(
      <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="polymarket" onClose={() => {}} onSave={noop} onUnlink={noop} />,
    );
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["Nansen", "Hyperliquid", "Polymarket"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    root.unmount();
  });

  it("Nansen tab: entity, tags, holdings and PnL", () => {
    const { container, root } = mountNode(
      <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="nansen" onClose={() => {}} onSave={noop} onUnlink={noop} />,
    );
    const panel = container.querySelectorAll('[role="tabpanel"]')[0]!;
    expect(panel.textContent).toContain("Vitalik Buterin");
    expect(panel.textContent).toContain("Public Figure");
    expect(panel.textContent).toContain("53%");
    act(() => ([...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b=>b.textContent==="Holdings")!).click());
    expect(panel.textContent).toContain("ETH");
    root.unmount();
  });

  it("shows entity depth, the full profile link, replay context, and more than three holdings", () => {
    const rich: AuthorBadgesResponse = { handle: "VitalikButerin", errors: [], replay: true, nansen: {
      ...badges.nansen!, tokenCount: 42, tradeCount: 2763, tradedTokenCount: 70,
      chainHoldings: [{ chain: "ethereum", valueUsd: 590_000_000 }, { chain: "base", valueUsd: 1000 }],
      holdingsTruncated: true,
      topHoldings: Array.from({ length: 12 }, (_, i) => ({ symbol: `TOKEN${i}`, chain: "ethereum", tokenAddress: `address${i}`, valueUsd: 1000 - i })),
      topPnlTokens: [{ symbol: "ETH", chain: "ethereum", tokenAddress: "eth", realizedPnlUsd: 9594232 }],
    } };
    const { container, root } = mountNode(<BadgeCard handle="VitalikButerin" displayName="vitalik.eth" badges={rich} initial="nansen" onClose={() => {}} onSave={noop} onUnlink={noop} />);
    expect(container.textContent).toContain("Portfolio by chain");
    expect(container.textContent).toContain("Reported holdings");
    expect(container.querySelector(".tw-replay-badge")).not.toBeNull();
    expect(container.querySelector(".tw-nansen-link")?.getAttribute("href")).toBe("https://app.nansen.ai/profiler?chain=all&entity=Vitalik%20Buterin&tab=overview");
    act(() => ([...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b=>b.textContent==="Performance")!).click());
    expect(container.textContent).toContain("2,763");
    expect(container.textContent).toContain("Top tokens by realized PnL");
    act(() => ([...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b=>b.textContent==="Holdings")!).click());
    expect(container.querySelectorAll(".tw-holding-rows li")).toHaveLength(5);
    act(() => (container.querySelector('[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(container.querySelectorAll(".tw-holding-rows li")).toHaveLength(5);
    expect(container.textContent).toContain("TOKEN5");
    expect(container.querySelector(".tw-card-footer")?.textContent).not.toContain("credits");
    act(() => root.unmount());
  });

  it("Hyperliquid tab: account value, a position with its side, and the data sources", () => {
    const { container, root } = mountNode(
      <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="hyperliquid" onClose={() => {}} onSave={noop} onUnlink={noop} />,
    );
    const panel = container.querySelectorAll('[role="tabpanel"]')[1]!;
    expect(panel.textContent).toContain("Short");
    expect(panel.textContent).toContain("ETH");
    expect(panel.textContent).toContain("Linked by you");
    expect(panel.textContent).toContain("Hyperliquid API");
    expect(panel.textContent).toContain("Nansen");
    root.unmount();
  });

  it("Polymarket tab: a curated link shows its source link, never an unlink action", () => {
    const { container, root } = mountNode(
      <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="polymarket" onClose={() => {}} onSave={noop} onUnlink={noop} />,
    );
    const panel = container.querySelectorAll('[role="tabpanel"]')[2]!;
    expect(panel.textContent).toContain("Will the price of Bitcoin be above $72,000");
    const source = panel.querySelector("a.tw-link-source");
    expect(source?.getAttribute("href")).toBe("https://example.org/proof");
    expect(source?.getAttribute("rel")).toContain("noreferrer");
    expect(panel.textContent).not.toContain("Unlink");
    root.unmount();
  });

  it("unlinks a user-linked venue through the callback", () => {
    const onUnlink = vi.fn(async () => null);
    const { container, root } = mountNode(
      <BadgeCard handle="degenalpha" displayName="Degen Alpha" badges={badges} initial="hyperliquid" onClose={() => {}} onSave={async () => null} onUnlink={onUnlink} />,
    );
    const unlink = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Unlink"))!;
    act(() => {
      unlink.click();
    });
    expect(onUnlink).toHaveBeenCalledWith("hyperliquid");
    root.unmount();
  });
});

describe("LinkWallet", () => {
  it("shows the empty state until the form is opened", () => {
    const { container, root } = mountNode(<LinkWallet handle="weatherfan" links={{}} onSave={async () => null} onUnlink={async () => null} />);
    expect(container.textContent).toContain("Link a Hyperliquid or Polymarket wallet to see positions.");
    expect(container.querySelector("input.tw-link-input")).toBeNull();
    root.unmount();
  });

  it("validates before saving and saves a normalized address for the chosen venue", async () => {
    const onSave = vi.fn(async () => null);
    const { container, root } = mountNode(<LinkWallet handle="weatherfan" links={{}} onSave={onSave} onUnlink={async () => null} />);
    act(() => {
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Link wallet"))!.click();
    });
    const input = container.querySelector<HTMLInputElement>("input.tw-link-input")!;
    const form = container.querySelector("form")!;

    act(() => {
      type(input, "nope");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain("That isn't an address");
    expect(input.getAttribute("aria-invalid")).toBe("true");

    act(() => {
      [...container.querySelectorAll('input[type="radio"]')].find((r) => (r as HTMLInputElement).value === "polymarket")!.dispatchEvent(new Event("click", { bubbles: true }));
    });
    await act(async () => {
      type(input, ` ${HL} `);
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledWith("polymarket", HL);
    root.unmount();
  });

  it("shows a failed save as an error and keeps the form open", async () => {
    const onSave = vi.fn(async () => "Backend offline");
    const { container, root } = mountNode(<LinkWallet handle="weatherfan" links={{}} onSave={onSave} onUnlink={async () => null} />);
    act(() => {
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Link wallet"))!.click();
    });
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("input.tw-link-input")!;
      type(input, HL);
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("Backend offline");
    expect(container.querySelector("form")).not.toBeNull();
    root.unmount();
  });
});
