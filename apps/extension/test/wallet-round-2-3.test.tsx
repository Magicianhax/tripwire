// @vitest-environment happy-dom
//
// Round 2.3 — wallet depth: the activity feed, the origin story and the counterparties.
// Brief: docs/IMPROVEMENT-PLAN.md §3, Round 2.3.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletActivityResponse, WalletCounterpartiesResponse, WalletLensResponse, WalletOriginResponse } from "../lib/api-types";
import { WalletCard } from "../lib/ui/WalletCard";

const EVM = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
const FUNDER = "0x1778767436111ec0adb10f9ba4f51a329d0e7770";
const PARTY = "0x6b9e773128f453f5c2c60935ee2de2cbc5390a24";
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
  portfolio: { totalUsd: 29_570, tokenCount: 25, chains: ["hyperevm", "arbitrum", "ethereum"], chainHoldings: [], holdings: [] },
  pnl: null,
  hyperliquid: null,
  polymarket: null,
  nansenUrl: null,
  sources: ["Nansen Profiler"],
  credits: 5,
  message: null,
  errors: [],
  ...over,
});

const activity = (over: Partial<WalletActivityResponse> = {}): WalletActivityResponse => ({
  address: EVM,
  rows: [
    {
      timeIso: "2026-09-18T17:20:11Z",
      chain: "hyperevm",
      direction: "sent",
      valueUsd: 2_199_167.75,
      // Truncated: a full 66-character tx hash in source trips the bare-private-key scanner,
      // and nothing here asserts on it.
      txHash: "0xd94722265462c0e1",
      sourceType: "transfer",
      token: { symbol: "USDC", amount: -2_199_994.8, valueUsd: null },
      legCount: 2,
      counterparty: { address: PARTY, label: "Token Millionaire [0x6b9e77]" },
    },
    {
      timeIso: "2026-09-17T09:02:00Z",
      chain: "arbitrum",
      direction: "received",
      // The case non-negotiable #1 exists for: Nansen priced nothing, so there is no figure.
      valueUsd: null,
      txHash: "0xabc",
      sourceType: "transfer",
      token: { symbol: "WETH", amount: 1.5, valueUsd: null },
      legCount: 1,
      counterparty: { address: "0x1111111111111111111111111111111111111111", label: null },
    },
  ],
  truncated: true,
  windowDays: 30,
  lastActiveIso: "2026-09-18T17:20:11Z",
  chains: ["hyperevm", "arbitrum"],
  credits: 1,
  errors: [],
  ...over,
});

const origin = (over: Partial<WalletOriginResponse> = {}): WalletOriginResponse => ({
  address: EVM,
  firstFunder: { address: FUNDER, name: "High Activity", timeIso: "2021-11-07T16:34:35Z", chain: "ethereum", txHash: "0x37" },
  firstFunderReportedNone: false,
  firstFunderAsked: true,
  related: [{ address: FUNDER, label: "High Activity", relation: "First Funder", timeIso: "2021-11-07T16:34:35Z", chain: "ethereum" }],
  relatedChain: "arbitrum",
  firstFunderAlsoRelated: true,
  credits: 2,
  errors: [],
  ...over,
});

const parties = (over: Partial<WalletCounterpartiesResponse> = {}): WalletCounterpartiesResponse => ({
  address: EVM,
  rows: [
    { address: PARTY, labels: ["Token Millionaire"], interactions: 69, volumeInUsd: 136_640_297.1, volumeOutUsd: 27_853_718.39, totalVolumeUsd: 164_494_015.49, topToken: "USDC" },
    { address: "0x2222222222222222222222222222222222222222", labels: [], interactions: 1, volumeInUsd: 6_998_822, volumeOutUsd: 0, totalVolumeUsd: 6_998_822, topToken: null },
  ],
  truncated: true,
  windowDays: 30,
  credits: 5,
  errors: [],
  ...over,
});

const text = (container: HTMLElement) => container.textContent ?? "";
const findButton = (container: HTMLElement, match: RegExp) => [...container.querySelectorAll("button")].find((b) => match.test(b.textContent ?? "")) ?? null;
const openTab = (container: HTMLElement, label: string) => {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((b) => (b.textContent ?? "").startsWith(label)) as HTMLButtonElement | undefined;
  act(() => tab!.click());
};
const openView = (container: HTMLElement, label: string) => {
  const radio = [...container.querySelectorAll('[role="radio"]')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
  act(() => radio!.click());
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("2.3 — the Activity tab exists and costs nothing to open", () => {
  it("adds one tab, not one per section, so the 440px tab strip still holds four", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} onLoadActivity={async () => {}} />);
    const labels = [...container.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? "").trim());
    expect(labels).toEqual(["Overview", "Activity"]);
    root.unmount();
  });

  it("spends nothing on opening the tab or on switching view inside it", () => {
    const onLoadActivity = vi.fn(async () => {});
    const onLoadOrigin = vi.fn(async () => {});
    const onLoadCounterparties = vi.fn(async () => {});
    const { container, root } = mountNode(
      <WalletCard
        walletRef={ref}
        lens={lens()}
        error={null}
        onClose={() => {}}
        onLoadActivity={onLoadActivity}
        onLoadOrigin={onLoadOrigin}
        onLoadCounterparties={onLoadCounterparties}
      />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    openView(container, "Timeline");
    expect(onLoadActivity).not.toHaveBeenCalled();
    expect(onLoadOrigin).not.toHaveBeenCalled();
    expect(onLoadCounterparties).not.toHaveBeenCalled();
    root.unmount();
  });

  it("prints every price before the press, including the ceiling on the two-call one", () => {
    const { container, root } = mountNode(
      <WalletCard
        walletRef={ref}
        lens={lens()}
        error={null}
        onClose={() => {}}
        onLoadActivity={async () => {}}
        onLoadOrigin={async () => {}}
        onLoadCounterparties={async () => {}}
      />,
    );
    openTab(container, "Activity");
    expect(findButton(container, /Load recent activity \(1 credit\)/)).not.toBeNull();
    openView(container, "Connections");
    // "Up to", because a Solana wallet gets one call and an EVM wallet on no covered chain
    // also gets one: stating 2 flat would charge the user in words for a call never made.
    expect(findButton(container, /Check origin \(up to 2 credits\)/)).not.toBeNull();
    expect(findButton(container, /Load counterparties \(5 credits\)/)).not.toBeNull();
    root.unmount();
  });
});

describe("2.3 — the activity timeline", () => {
  it("shows an unpriced transfer as a dash, never as $0", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} activity={activity()} onLoadActivity={async () => {}} />);
    openTab(container, "Activity");
    const rows = [...container.querySelectorAll(".tw-activity-rows li")];
    expect(rows).toHaveLength(2);
    // The quantity survives even though the price did not: "Received 1.5 WETH", value "—".
    expect(rows[1]!.textContent).toContain("Received 1.5 WETH");
    expect(rows[1]!.textContent).toContain("—");
    expect(rows[1]!.textContent).not.toContain("$0");
    root.unmount();
  });

  it("names the other address, with Nansen's label when there is one and nothing added when not", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} activity={activity()} onLoadActivity={async () => {}} />);
    openTab(container, "Activity");
    expect(text(container)).toContain("Token Millionaire [0x6b9e77]");
    // An unlabelled counterparty is the address, not a description of it.
    expect(text(container)).toContain("0x11…1111");
    expect(text(container)).not.toMatch(/exchange|deposit|exit|withdraw/i);
    root.unmount();
  });

  it("says where 'last active' comes from, and that the page is a slice", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} activity={activity()} onLoadActivity={async () => {}} />);
    openTab(container, "Activity");
    expect(text(container)).toContain("The newest returned transaction is");
    expect(text(container)).toContain("is not in the answer");
    expect(text(container)).toContain("2 newest");
    root.unmount();
  });

  it("an empty answer reads as an empty answer, not as an inactive wallet", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} activity={activity({ rows: [], lastActiveIso: null, chains: [] })} onLoadActivity={async () => {}} />,
    );
    openTab(container, "Activity");
    expect(text(container)).toContain("Nansen returned no transactions for this wallet in the last 30 days");
    root.unmount();
  });
});

describe("2.3 — origin and related wallets", () => {
  it("prints the raw relation and never turns it into an ownership claim", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} origin={origin()} onLoadOrigin={async () => {}} />);
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("First Funder");
    // An origin from 2021 prints its date: `timeAgo` would say "1778d ago".
    expect(text(container)).toContain("First funded by High Activity on ethereum on 2021-11-07");
    expect(text(container)).not.toMatch(/same owner|linked to|controlled by|sybil/i);
    expect(text(container)).toContain("not a statement about ownership");
    root.unmount();
  });

  it("says the two rows are one relationship when Nansen returned the funder twice", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} origin={origin()} onLoadOrigin={async () => {}} />);
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("one relationship, reported twice");
    root.unmount();
  });

  it("an empty funder answer is normal, and says so rather than reading as a finding", () => {
    const { container, root } = mountNode(
      <WalletCard
        walletRef={ref}
        lens={lens()}
        error={null}
        onClose={() => {}}
        origin={origin({ firstFunder: null, firstFunderReportedNone: true, firstFunderAlsoRelated: false, related: [] })}
        onLoadOrigin={async () => {}}
      />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("An empty answer here is normal, not a finding");
    expect(text(container)).toContain("Nansen relates no other wallet to this one on arbitrum");
    root.unmount();
  });

  it("a non-EVM address is told the lookup does not cover it, not shown a blank", () => {
    const solana = { kind: "solana", query: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" } as const;
    const { container, root } = mountNode(
      <WalletCard
        walletRef={solana}
        lens={lens({ address: solana.query, chainGuess: "solana", portfolio: { totalUsd: 10, tokenCount: 1, chains: ["solana"], chainHoldings: [], holdings: [] } })}
        error={null}
        onClose={() => {}}
        origin={origin({ firstFunder: null, firstFunderAsked: false, firstFunderAlsoRelated: false, relatedChain: "solana", related: [], credits: 1 })}
        onLoadOrigin={async () => {}}
      />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("covers EVM addresses only");
    root.unmount();
  });

  it("names the chains that were not covered when nothing could be asked", () => {
    const { container, root } = mountNode(
      <WalletCard
        walletRef={ref}
        lens={lens({ portfolio: { totalUsd: 24_096, tokenCount: 4, chains: ["hyperevm"], chainHoldings: [], holdings: [] } })}
        error={null}
        onClose={() => {}}
        origin={origin({ related: null, relatedChain: null, firstFunderAlsoRelated: false, credits: 1 })}
        onLoadOrigin={async () => {}}
      />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("does not cover hyperevm, so it was not asked and not charged");
    root.unmount();
  });
});

describe("2.3 — counterparties", () => {
  it("keeps value in and value out apart and adds no reading of either", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} counterparties={parties()} onLoadCounterparties={async () => {}} />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    const headers = [...container.querySelectorAll(".tw-table th")].map((h) => h.textContent);
    expect(headers).toEqual(["Counterparty", "In", "Out"]);
    expect(text(container)).toContain("$137M");
    expect(text(container)).toContain("$27.9M");
    expect(text(container)).not.toMatch(/CEX exposure|net flow/i);
    root.unmount();
  });

  it("leaves an unlabelled counterparty as an address, and says that is a missing label", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} counterparties={parties()} onLoadCounterparties={async () => {}} />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("0x22…2222");
    expect(text(container)).toContain("that is a missing label, not a finding about the address");
    root.unmount();
  });

  it("says the page is the largest returned rather than all of them", () => {
    const { container, root } = mountNode(
      <WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} counterparties={parties()} onLoadCounterparties={async () => {}} />,
    );
    openTab(container, "Activity");
    openView(container, "Connections");
    expect(text(container)).toContain("2 largest returned");
    root.unmount();
  });
});

describe("2.3 — the Hyperliquid portfolio footnote", () => {
  it("says a Hyperliquid balance is outside the Tokens figure, when there is one", () => {
    const hyperliquid = { accountValueUsd: 12_000, positions: [], fills: [], errors: [] } as unknown as WalletLensResponse["hyperliquid"];
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens({ hyperliquid })} error={null} onClose={() => {}} />);
    expect(text(container)).toContain("A Hyperliquid balance sits on HyperCore, which Nansen's profiler does not cover");
    root.unmount();
  });

  it("does not say it on a wallet that has no Hyperliquid account", () => {
    const { container, root } = mountNode(<WalletCard walletRef={ref} lens={lens()} error={null} onClose={() => {}} />);
    expect(text(container)).not.toContain("HyperCore");
    root.unmount();
  });
});
