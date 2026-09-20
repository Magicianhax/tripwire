// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_MATCHES, grantedOrigins, isBuiltinOrigin, isEnableableUrl, originPattern, WALLET_SCRIPT_FILE } from "../lib/permissions";
import { addRecent, RECENT_WALLETS_MAX, type RecentWallet } from "../lib/recent-wallets";
import type { WalletLensResponse } from "../lib/api-types";
import { Popover } from "../lib/ui/Popover";
import { WalletCard, walletTitle } from "../lib/ui/WalletCard";
import { WalletMarker, refLabel } from "../lib/ui/WalletMarker";

const EVM = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

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
  portfolio: { totalUsd: 41_000, tokenCount: 12, chains: ["arbitrum", "base"], holdings: [{ symbol: "HYPE", name: "HYPE", chain: "arbitrum", tokenAddress: EVM, amount: 248.5, valueUsd: 20_519 }] },
  pnl: { realizedPnlUsd: 19_460, realizedPnlPercent: 0.0023, winRate: 0.8, tradeCount: 160, tokenCount: 10, windowDays: 90 },
  hyperliquid: null,
  polymarket: null,
  nansenUrl: `https://app.nansen.ai/profiler?address=${EVM}&chain=arbitrum`,
  sources: ["Nansen Profiler"],
  credits: 5,
  message: null,
  errors: [],
  ...over,
});

const hyperliquid: NonNullable<WalletLensResponse["hyperliquid"]> = {
  accountValueUsd: 1_200_000,
  marginUsedUsd: 300_000,
  totalNotionalUsd: 282_012,
  withdrawableUsd: 900_000,
  maintenanceMarginUsd: 100_000,
  positions: [{ coin: "ETH", side: "long", size: 120, entryPx: 2299.4, markPx: 2350.1, liquidationPx: 1800, unrealizedPnlUsd: 6084, leverage: 5, valueUsd: 282_012, returnOnEquity: null, cumFundingAllTimeUsd: null, cumFundingSinceOpenUsd: null, maxLeverage: null, marginUsedUsd: null }],
  fills: [{ time: Date.now() - 60_000, coin: "ETH", dir: "Close Long", px: 2350, sz: 4, closedPnlUsd: 240 }],
  fillsRealizedPnlUsd: 240,
  fillsWindow: { count: 1, fromMs: Date.now() - 60_000, toMs: Date.now() },
  nansenPerp: null,
  errors: [],
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("permission helpers", () => {
  it("knows the origins the manifest already covers", () => {
    expect(isBuiltinOrigin("https://x.com")).toBe(true);
    expect(isBuiltinOrigin("https://mobile.x.com")).toBe(true);
    expect(isBuiltinOrigin("https://dexscreener.com")).toBe(true);
    expect(isBuiltinOrigin("https://pendle.finance")).toBe(false);
    expect(isBuiltinOrigin("not a url")).toBe(false);
  });

  it("lists only the extra grants, deduped and sorted", () => {
    const patterns = ["https://x.com/*", "https://pendle.finance/*", "http://127.0.0.1:3000/*", "https://app.pendle.finance/*", "https://pendle.finance/*", "*://*/*"];
    expect(grantedOrigins(patterns)).toEqual(["https://app.pendle.finance", "https://pendle.finance"]);
    expect(grantedOrigins(undefined)).toEqual([]);
  });

  it("offers only pages a grant could apply to", () => {
    expect(isEnableableUrl("https://pendle.finance/trade")).toBe(true);
    expect(isEnableableUrl("http://example.test/")).toBe(true);
    expect(isEnableableUrl("chrome://extensions")).toBe(false);
    expect(isEnableableUrl("http://127.0.0.1:3000/rules")).toBe(false);
    expect(isEnableableUrl(undefined)).toBe(false);
  });

  it("asks for one origin, every path", () => {
    expect(originPattern("https://pendle.finance")).toBe("https://pendle.finance/*");
  });

  it("names a content-script file the build actually produces", () => {
    const built = resolve(process.cwd(), ".output", "chrome-mv3", WALLET_SCRIPT_FILE);
    expect(existsSync(built), `${built} is missing: run \`pnpm -F extension build\``).toBe(true);
  });

  it("covers X and every venue out of the box", () => {
    expect(BUILTIN_MATCHES).toContain("https://x.com/*");
    expect(BUILTIN_MATCHES.length).toBeGreaterThan(18);
  });
});

describe("recent wallets", () => {
  const entry = (query: string): RecentWallet => ({ query, address: query, label: null, chain: null, seenAt: Date.now() });

  it("puts the newest first and never repeats a wallet", () => {
    const list = addRecent(addRecent([], entry("0xa")), entry("0xb"));
    expect(addRecent(list, entry("0xA")).map((r) => r.query)).toEqual(["0xA", "0xb"]);
  });

  it("keeps ten", () => {
    let list: RecentWallet[] = [];
    for (let i = 0; i < RECENT_WALLETS_MAX + 5; i++) list = addRecent(list, entry(`0x${i}`));
    expect(list).toHaveLength(RECENT_WALLETS_MAX);
    expect(list[0]!.query).toBe("0x14");
  });
});

describe("WalletMarker", () => {
  it("provides a larger profile marker and stops host row navigation on inspection", () => {
    const onClick = vi.fn();
    const hostClick = vi.fn();
    const { container } = mountNode(<WalletMarker ref={{kind:"evm",query:EVM}} presentation="profile" open={false} onClick={onClick} />);
    const hostRow = document.createElement("div");
    document.body.appendChild(hostRow);
    hostRow.appendChild(container);
    hostRow.addEventListener("click", hostClick);
    const button = container.querySelector("button")!;
    const event = new MouseEvent("click", {bubbles:true,cancelable:true});
    act(() => { button.dispatchEvent(event); });
    expect(button.dataset.presentation).toBe("profile");
    expect(onClick).toHaveBeenCalledOnce();
    expect(hostClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("names the wallet it belongs to, and says whether its card is open", () => {
    const { container } = mountNode(<WalletMarker ref={{ kind: "evm", query: EVM }} open={false} onClick={() => {}} />);
    const button = container.querySelector("button")!;
    expect(document.getElementById(button.getAttribute("aria-labelledby")!)?.textContent).toBe("Inspect wallet 0x7f…17d1 with Tripwire");
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(button.hasAttribute("title")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("reads a name as itself", () => {
    expect(refLabel({ kind: "ens", query: "vitalik.eth" })).toBe("vitalik.eth");
  });

  it("fires on click", () => {
    const onClick = vi.fn();
    const { container } = mountNode(<WalletMarker ref={{ kind: "ens", query: "vitalik.eth" }} open onClick={onClick} />);
    act(() => container.querySelector("button")!.click());
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("WalletCard", () => {
  const ref = { kind: "evm", query: EVM } as const;

  it("reserves the wallet layout and announces that it is working before the data lands", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={null} error={null} onClose={() => {}} />);
    expect(container.querySelector(".tw-wallet-card")?.getAttribute("aria-busy")).toBe("true");
    expect([...container.querySelectorAll(".tw-skeleton")].map((node) => node.getAttribute("data-shape"))).toEqual(["tile", "table"]);
    expect(container.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain("Loading wallet data");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    root.unmount();
  });

  it("gets its expand control from the popover frame", () => {
    const onToggleSize = vi.fn();
    let size: "compact" | "expanded" = "compact";
    const node = () => (
      <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={onToggleSize}>
        <WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />
      </Popover>
    );
    const { container, root } = mountNode(node());
    const toggle = container.querySelector<HTMLButtonElement>(".tw-card-size")!;
    expect(document.getElementById(toggle.getAttribute("aria-labelledby")!)?.textContent).toBe("Expand card");
    expect(container.querySelector(".tw-pop")?.getAttribute("data-size")).toBe("compact");
    expect(container.querySelector(".tw-wallet-card")?.getAttribute("data-size")).toBe("compact");
    act(() => toggle.click());
    expect(onToggleSize).toHaveBeenCalledOnce();

    size = "expanded";
    act(() => root.render(node()));
    expect(container.querySelector(".tw-pop")?.getAttribute("data-size")).toBe("expanded");
    expect(container.querySelector(".tw-wallet-card")?.getAttribute("data-size")).toBe("expanded");
    const collapse = container.querySelector(".tw-card-size")!;
    expect(document.getElementById(collapse.getAttribute("aria-labelledby")!)?.textContent).toBe("Collapse card");
    root.unmount();
  });

  it("shows only the tabs that have data", () => {
    const { container } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Overview"]);
  });

  it("adds the Hyperliquid tab when that wallet trades there", () => {
    const { container } = mountNode(<WalletCard walletRef={ref} lens={lens({ hyperliquid })} error={null} onClose={() => {}} />);
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Hyperliquid"]);
    const panel = container.querySelector('[role="tabpanel"][hidden]')!;
    expect(panel.textContent).toContain("Open positions");
    expect(panel.textContent).toContain("$2,299.4");
  });

  it("names the sources without displaying credit usage", () => {
    const { container } = mountNode(<WalletCard walletRef={ref} lens={lens({ sources: ["Nansen Profiler", "Hyperliquid public API"] })} error={null} onClose={() => {}} />);
    expect(container.querySelector(".tw-card-footer")?.textContent).not.toContain("credits");
    expect(container.textContent).toContain("Hyperliquid public API");
    expect(container.textContent).toContain("Powered by");
  });

  it("offers the 100-credit label lookup only when the backend allows it, and states the price", () => {
    const off = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    expect(off.container.querySelector(".tw-premium-button")).toBeNull();

    const on = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} onLoadLabels={async () => {}} />);
    const button = on.container.querySelector(".tw-premium-button")!;
    expect(button.textContent).toContain("Load Nansen labels (100 credits)");
  });

  it("never offers the premium lookup once a label is already known", () => {
    const { container } = mountNode(
      <WalletCard walletRef={ref} lens={lens({ label: { text: "Jump Trading", kind: "fund", tags: [] } })} error={null} onClose={() => {}} onLoadLabels={async () => {}} />,
    );
    expect(container.querySelector(".tw-premium-button")).toBeNull();
    expect(container.textContent).toContain("Jump Trading");
  });

  it("says why a name could not be resolved instead of showing an empty card", () => {
    const { container } = mountNode(
      <WalletCard
        walletRef={{ kind: "sns", query: "toly.sol" }}
        lens={lens({ resolved: false, address: null, portfolio: null, pnl: null, message: "Tripwire can't resolve toly.sol: no free resolver." })}
        error={null}
        onClose={() => {}}
      />,
    );
    expect(container.textContent).toContain("no free resolver");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it("shows a failed lookup as one sentence", () => {
    const { container } = mountNode(<WalletCard walletRef={ref} lens={null} error="Tripwire's backend is offline." onClose={() => {}} />);
    expect(container.textContent).toContain("Tripwire's backend is offline.");
  });

  it("titles itself with the name it was shared as", () => {
    expect(walletTitle(lens({ name: { value: "vitalik.eth", source: "ensideas" } }), ref)).toBe("vitalik.eth");
    expect(walletTitle(lens({ label: { text: "Jump Trading", kind: "fund", tags: [] } }), ref)).toBe("Jump Trading");
    expect(walletTitle(null, ref)).toBe("0x7f…17d1");
  });
});
