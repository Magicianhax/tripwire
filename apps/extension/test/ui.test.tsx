// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { HitDto, PerpPanel, PostIntelResponse, SpotPanel } from "../lib/api-types";
import { BlockScreen } from "../lib/ui/BlockScreen";
import { Chip } from "../lib/ui/Chip";
import { Panel } from "../lib/ui/Panel";
import { PerpBody } from "../lib/ui/PerpBody";

function mountNode(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function makeHit(i: number): HitDto {
  return {
    ruleId: `r${i}`,
    action: "block",
    text: `Hit number ${i}`,
    signalId: "exit_pressure",
    label: `hit ${i}`,
    value: -1000 * i,
    evidence: [{ endpoint: `endpoint-${i}`, field: "x", value: "y" }],
  };
}

describe("BlockScreen", () => {
  it("keeps Override disabled until the exact phrase matches, and calls onOverride once on click", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[makeHit(1)]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector(".tw-block-override-btn") as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    // Wrong case: never matches, button stays disabled, click (even if forced) never fires onOverride.
    act(() => {
      setInputValue(input, "i am exit liquidity");
    });
    expect(button.disabled).toBe(true);
    act(() => {
      button.click();
    });
    expect(onOverride).not.toHaveBeenCalled();

    // Exact match enables the button; clicking calls onOverride exactly once.
    act(() => {
      setInputValue(input, "I AM EXIT LIQUIDITY");
    });
    expect(button.disabled).toBe(false);
    act(() => {
      button.click();
    });
    expect(onOverride).toHaveBeenCalledTimes(1);
    act(() => {
      button.click();
    });
    expect(onOverride).toHaveBeenCalledTimes(2); // each valid click fires once, not a double-fire bug

    root.unmount();
  });

  it("fires onOverride on Enter when the phrase matches (trimmed)", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="OK" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;

    act(() => {
      setInputValue(input, "  OK  ");
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onOverride).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it("never fires onOverride on Enter for a non-matching phrase", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="OK" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;

    act(() => {
      setInputValue(input, "ok");
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onOverride).not.toHaveBeenCalled();

    root.unmount();
  });

  it("shows at most 3 hits, plus a +2 more line, for 5 hits", () => {
    const hits = [1, 2, 3, 4, 5].map(makeHit);
    const { container, root } = mountNode(<BlockScreen hits={hits} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);

    const items = container.querySelectorAll(".tw-block-hits > li");
    expect(items.length).toBe(4); // 3 hits + one "+2 more" line
    expect(container.textContent).toContain("+2 more");
    expect(container.textContent).not.toContain("Hit number 4");

    root.unmount();
  });
});

describe("BlockScreen focus management", () => {
  it("focuses the override input on mount when nothing else is focused", () => {
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);
    const input = container.querySelector("input") as HTMLInputElement;

    expect(document.activeElement).toBe(input);

    root.unmount();
  });

  it("does not steal focus from a host-page input that already has it", () => {
    const hostInput = document.createElement("input");
    document.body.appendChild(hostInput);
    hostInput.focus();
    expect(document.activeElement).toBe(hostInput);

    const { root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);

    expect(document.activeElement).toBe(hostInput);

    root.unmount();
    hostInput.remove();
  });

  it("respects autoFocus={false}", () => {
    document.body.focus();
    const { root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} />);

    expect(document.activeElement).toBe(document.body);

    root.unmount();
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    document.body.focus();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="MATCH" onEvidence={() => {}} onOverride={() => {}} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const evidenceBtn = container.querySelector(".tw-block-evidence") as HTMLButtonElement;

    // The Override button is disabled (input doesn't match "MATCH" yet), so Evidence is the
    // last focusable element in the trap.
    act(() => {
      evidenceBtn.focus();
    });
    expect(document.activeElement).toBe(evidenceBtn);

    act(() => {
      evidenceBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(input);

    root.unmount();
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    document.body.focus();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="MATCH" onEvidence={() => {}} onOverride={() => {}} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const evidenceBtn = container.querySelector(".tw-block-evidence") as HTMLButtonElement;

    expect(document.activeElement).toBe(input); // autofocus landed here

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(evidenceBtn);

    root.unmount();
  });
});

describe("Chip", () => {
  it("renders aria-expanded and the verdict word", () => {
    const { container, root } = mountNode(<Chip verdict="TRIPWIRE" symbol="LUMEN" headline="SM −$412K · 1H" expanded onClick={() => {}} />);
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("data-verdict")).toBe("TRIPWIRE");
    expect(container.textContent).toContain("TRIPWIRE");

    root.unmount();
  });

  it("never renders the word CLEAR for an UNCHECKED verdict", () => {
    const { container, root } = mountNode(<Chip verdict="UNCHECKED" symbol="LUMEN" headline="No data yet" expanded={false} onClick={() => {}} />);
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("UNCHECKED");
    expect(container.textContent).not.toContain("CLEAR");

    root.unmount();
  });
});

describe("Panel (spot)", () => {
  it("renders an Unavailable line in the footer when panel.errors is non-empty", () => {
    const spotPanel: SpotPanel = {
      flow: null,
      flowTimeframe: "1d",
      sincePost: null,
      netflow: null,
      indicators: null,
      marketCapUsd: null,
      topBuyers: null,
      topSellers: null,
      candles: null,
      postTimeIso: null,
      errors: ["flow-intel timed out"],
    };
    const data: PostIntelResponse = {
      verdict: "UNCHECKED",
      hits: [],
      unavailable: [],
      signals: [],
      panel: spotPanel,
      rulesPreset: "balanced",
    };

    const { container, root } = mountNode(<Panel data={data} title="$LUMEN" onClose={() => {}} />);

    expect(container.textContent).toContain("Unavailable: flow-intel timed out");

    root.unmount();
  });
});

describe("PerpBody liquidation ladder", () => {
  it("skips positions with a null liquidation_price without crashing", () => {
    const panel: PerpPanel = {
      coin: "BTC",
      screener: {
        token_symbol: "BTC",
        mark_price: 60000,
        funding: 0.0001,
        open_interest: 1_000_000,
        current_smart_money_position_longs_usd: 500_000,
        current_smart_money_position_shorts_usd: -200_000,
        smart_money_longs_count: 4,
        smart_money_shorts_count: 2,
      },
      positions: [
        {
          address: "0xabc",
          address_label: "whale.eth",
          side: "Long",
          position_value_usd: 100_000,
          leverage: "5x",
          entry_price: 58000,
          mark_price: 60000,
          liquidation_price: null,
          upnl_usd: 1000,
        },
        {
          address: "0xdef",
          address_label: null,
          side: "Short",
          position_value_usd: 50_000,
          leverage: "3x",
          entry_price: 61000,
          mark_price: 60000,
          liquidation_price: 61800,
          upnl_usd: -500,
        },
      ],
      trades: null,
      errors: [],
    };

    expect(() => {
      const { root } = mountNode(<PerpBody panel={panel} />);
      root.unmount();
    }).not.toThrow();

    const { container, root } = mountNode(<PerpBody panel={panel} />);
    const rects = container.querySelectorAll(".tw-ladder rect");
    // Band rect + exactly one tick rect (the null-liquidation_price position is skipped).
    expect(rects.length).toBe(2);

    root.unmount();
  });
});
