// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { HitDto, PerpPanel, PostIntelResponse, SpotPanel } from "../lib/api-types";
import { BlockScreen, phraseMatches } from "../lib/ui/BlockScreen";
import { Chip } from "../lib/ui/Chip";
import { Dock } from "../lib/ui/Dock";
import { deepActiveElement } from "../lib/ui/focus";
import { HitList } from "../lib/ui/panel-parts";
import { Panel } from "../lib/ui/Panel";
import { PerpBody } from "../lib/ui/PerpBody";
import { PredictionBody } from "../lib/ui/PredictionBody";
import { Strip } from "../lib/ui/Strip";

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
    signalId: "labeled_exit_pct",
    label: `hit ${i}`,
    value: -1000 * i,
    evidence: [{ endpoint: `endpoint-${i}`, field: "x", value: "y" }],
  };
}

describe("BlockScreen", () => {
  it("keeps Override disabled until the phrase matches, and calls onOverride once on click", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[makeHit(1)]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector(".tw-block-override-btn") as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    // Wrong words: never matches, button stays disabled, click (even if forced) never fires onOverride.
    act(() => {
      setInputValue(input, "i am exit");
    });
    expect(button.disabled).toBe(true);
    act(() => {
      button.click();
    });
    expect(onOverride).not.toHaveBeenCalled();

    // A match enables the button; clicking calls onOverride exactly once.
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

  it("matches the phrase case-insensitively with whitespace normalized (mobile auto-capitalization)", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector(".tw-block-override-btn") as HTMLButtonElement;

    act(() => {
      setInputValue(input, "  I am   exit\tliquidity ");
    });
    expect(button.disabled).toBe(false);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(phraseMatches("   ", "   ")).toBe(false);
    expect(phraseMatches("i am exit liquidit", "I AM EXIT LIQUIDITY")).toBe(false);

    root.unmount();
  });

  it("shows the phrase in its own chip, a reassurance line, and Evidence first, labelled by kind", () => {
    const { container, root } = mountNode(<BlockScreen hits={[makeHit(1)]} kind="perp" phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={() => {}} />);
    expect(container.querySelector(".tw-block-phrase")?.textContent).toBe("I AM EXIT LIQUIDITY");
    expect(container.textContent).toContain("Not trading is the safe move.");
    const footerButtons = [...container.querySelectorAll(".tw-block-footer button")].map((b) => b.textContent);
    expect(footerButtons).toEqual(["See positions", "Override"]);
    root.unmount();

    const spot = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);
    expect(spot.container.querySelector(".tw-block-evidence")?.textContent).toBe("See who's selling");
    spot.root.unmount();
    const pm = mountNode(<BlockScreen hits={[]} kind="prediction" phrase="X" onEvidence={() => {}} onOverride={() => {}} />);
    expect(pm.container.querySelector(".tw-block-evidence")?.textContent).toBe("See holders");
    pm.root.unmount();
  });

  it("describes the alertdialog with its hits list", () => {
    const { container, root } = mountNode(<BlockScreen hits={[makeHit(1)]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);
    const dialog = container.querySelector('[role="alertdialog"]') as HTMLElement;
    const ids = (dialog.getAttribute("aria-describedby") ?? "").split(" ");
    const hitsList = container.querySelector(".tw-block-hits") as HTMLElement;
    expect(hitsList.id).not.toBe("");
    expect(ids).toContain(hitsList.id);
    root.unmount();
  });

  it("never fires onOverride on Enter for a non-matching phrase", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="OK" onEvidence={() => {}} onOverride={onOverride} />);
    const input = container.querySelector("input") as HTMLInputElement;

    act(() => {
      setInputValue(input, "no");
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
  it("focuses the dialog container (not the override input) on mount when nothing else is focused", () => {
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);
    const dialog = container.querySelector('[role="alertdialog"]') as HTMLElement;

    expect(document.activeElement).toBe(dialog);
    expect(dialog.tabIndex).toBe(-1);

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

    // The Override button is disabled (input doesn't match "MATCH" yet), so the input is the
    // last focusable element in the trap and Evidence the first.
    act(() => {
      input.focus();
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(evidenceBtn);

    root.unmount();
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    document.body.focus();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="MATCH" onEvidence={() => {}} onOverride={() => {}} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const evidenceBtn = container.querySelector(".tw-block-evidence") as HTMLButtonElement;

    act(() => {
      evidenceBtn.focus();
    });
    act(() => {
      evidenceBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(input);

    root.unmount();
  });
});

describe("deepActiveElement", () => {
  it("walks nested shadow roots (two levels deep) to find the true focused element", () => {
    const outerHost = document.createElement("div");
    document.body.appendChild(outerHost);
    const outerShadow = outerHost.attachShadow({ mode: "open" });

    const innerHost = document.createElement("div");
    outerShadow.appendChild(innerHost);
    const innerShadow = innerHost.attachShadow({ mode: "open" });

    const input = document.createElement("input");
    innerShadow.appendChild(input);
    input.focus();

    // The top-level document only ever sees the outer shadow host as "active".
    expect(document.activeElement).toBe(outerHost);
    // deepActiveElement recurses through both shadow roots to the real focused element.
    expect(deepActiveElement()).toBe(input);

    outerHost.remove();
  });

  it("returns document.activeElement directly when nothing is inside a shadow root", () => {
    document.body.focus();
    expect(deepActiveElement()).toBe(document.body);
  });
});

describe("BlockScreen focus management (shadow DOM / contenteditable hosts)", () => {
  it("does not steal focus from an input focused inside a third-party widget's own shadow root", () => {
    const widgetHost = document.createElement("div");
    document.body.appendChild(widgetHost);
    const widgetShadow = widgetHost.attachShadow({ mode: "open" });
    const shadowInput = document.createElement("input");
    widgetShadow.appendChild(shadowInput);
    shadowInput.focus();

    expect(widgetShadow.activeElement).toBe(shadowInput);

    const { root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);

    // The shadow root's own focused element must be unchanged — BlockScreen must not have
    // stolen focus just because document.activeElement (the shadow host) looked non-editable.
    expect(widgetShadow.activeElement).toBe(shadowInput);

    root.unmount();
    widgetHost.remove();
  });

  it("does not steal focus from a contenteditable host element", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    document.body.appendChild(editable);
    editable.focus();
    expect(document.activeElement).toBe(editable);

    const { root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} />);

    expect(document.activeElement).toBe(editable);

    root.unmount();
    editable.remove();
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
    expect(container.textContent).toContain("Unchecked");
    expect(container.textContent).not.toMatch(/clear/i);

    root.unmount();
  });
});

describe("Panel (spot)", () => {
  it("renders an Unavailable line in the footer when panel.errors is non-empty", () => {
    const spotPanel: SpotPanel = {
      flow: null,
      flowTimeframe: "1d",
          netflow: null,
      indicators: null,
      marketCapUsd: null,
      topBuyers: null,
      topSellers: null,
      chart: null,
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

describe("BlockScreen override pending/error (fix round 1/5)", () => {
  it("disables Override while pending, even with an exact phrase match, and shows 'Overriding…'", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(
      <BlockScreen hits={[makeHit(1)]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={onOverride} pending />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector(".tw-block-override-btn") as HTMLButtonElement;

    act(() => {
      setInputValue(input, "I AM EXIT LIQUIDITY");
    });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Overriding…");

    act(() => {
      button.click();
    });
    expect(onOverride).not.toHaveBeenCalled();

    root.unmount();
  });

  it("ignores Enter-in-input while pending too (not just the button's disabled attribute)", () => {
    const onOverride = vi.fn();
    const { container, root } = mountNode(
      <BlockScreen hits={[makeHit(1)]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={onOverride} pending />,
    );
    const input = container.querySelector("input") as HTMLInputElement;

    act(() => {
      setInputValue(input, "I AM EXIT LIQUIDITY");
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onOverride).not.toHaveBeenCalled();

    root.unmount();
  });

  it("renders the failure message as role=status and leaves Override enabled again (not pending)", () => {
    const { container, root } = mountNode(
      <BlockScreen
        hits={[makeHit(1)]}
        phrase="I AM EXIT LIQUIDITY"
        onEvidence={() => {}}
        onOverride={() => {}}
        error="Override not recorded: backend offline. Still blocked."
      />,
    );
    const status = container.querySelector('.tw-block-error[role="status"]');
    expect(status?.textContent).toBe("Override not recorded: backend offline. Still blocked.");

    const button = container.querySelector(".tw-block-override-btn") as HTMLButtonElement;
    expect(button.disabled).toBe(true); // still true: the phrase input is empty, independent of `error`
    expect(button.textContent).toBe("Override");

    root.unmount();
  });

  it("renders no error line when `error` is null/omitted", () => {
    const { container, root } = mountNode(
      <BlockScreen hits={[makeHit(1)]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={() => {}} />,
    );
    expect(container.querySelector(".tw-block-error")).toBeNull();
    root.unmount();
  });
});

describe("HitList findings", () => {
  it("shows the signal label as the sentence and the rule threshold as a formatted mono clause", () => {
    const hit = (signalId: HitDto["signalId"], op: NonNullable<HitDto["op"]>, threshold: number, label: string): HitDto => ({
      ruleId: signalId,
      action: "block",
      text: "rule template {n}",
      signalId,
      op,
      threshold,
      label,
      value: 1,
      evidence: [],
    });
    const { container, root } = mountNode(
      <HitList hits={[hit("labeled_exit_pct", "<", -5, "Smart money, whales and public figures sold 5.4% of 24h volume"), hit("distribution_pct", "<", -2, "Labeled wallets sold 4.2% of 24h volume and fresh wallets bought 2.8x that")]} />,
    );
    const findings = [...container.querySelectorAll(".tw-hit-finding")].map((n) => n.textContent);
    const rules = [...container.querySelectorAll(".tw-hit-rule")].map((n) => n.textContent);
    expect(findings).toEqual(["Smart money, whales and public figures sold 5.4% of 24h volume", "Labeled wallets sold 4.2% of 24h volume and fresh wallets bought 2.8x that"]);
    expect(rules).toEqual(["rule: < −5% of volume", "rule: < −2% of volume"]);
    expect(container.textContent).not.toContain("rule template");
    root.unmount();
  });

  it("falls back to the rule text plus the value in its signal's unit when a hit has no label", () => {
    const hit = (signalId: HitDto["signalId"], value: number): HitDto => ({ ruleId: signalId, action: "warn", text: signalId, signalId, label: "", value, evidence: [] });
    const { container, root } = mountNode(
      <Panel
        data={{
          verdict: "CAUTION",
          hits: [hit("distribution_pct", -2.4), hit("risk_high_count", 2), hit("labeled_exit_pct", -5.4), hit("inside_liq_band", 1_500_000)],
          unavailable: [],
          signals: [],
          panel: { flow: null, flowTimeframe: "1d", netflow: null, indicators: null, marketCapUsd: null, topBuyers: null, topSellers: null, chart: null, postTimeIso: null, errors: [] },
          rulesPreset: "balanced",
        }}
        title="$X"
        onClose={() => {}}
      />,
    );
    const values = [...container.querySelectorAll(".tw-hit-finding")].map((b) => b.textContent?.trim());
    expect(values).toEqual(["distribution_pct −2.4% of volume", "risk_high_count 2", "labeled_exit_pct −5.4% of volume", "inside_liq_band $1.5M"]);
    root.unmount();
  });
});

describe("Dock collapsed chip", () => {
  it("reflects the verdict with the chip key/value anatomy", () => {
    const { container, root } = mountNode(
      <Dock collapsed verdict="TRIPWIRE" headline="Smart money net −$412K" onToggleCollapsed={() => {}}>
        {null}
      </Dock>,
    );
    const chip = container.querySelector(".tw-dock-chip") as HTMLButtonElement;
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.dataset.verdict).toBe("TRIPWIRE");
    expect(chip.querySelector(".tw-chip-key")?.textContent).toBe("TRIPWIRE");
    expect(chip.querySelector(".tw-chip-value")?.textContent).toBe("Smart money net −$412K");
    root.unmount();
  });

  it("uses sentence case for quiet verdicts", () => {
    const { container, root } = mountNode(
      <Dock collapsed verdict="UNCHECKED" headline="Pick a market" onToggleCollapsed={() => {}}>
        {null}
      </Dock>,
    );
    expect(container.querySelector(".tw-chip-key")?.textContent).toBe("Unchecked");
    root.unmount();
  });

  it("renders Checking… as a non-interactive status, not a button", () => {
    const { container, root } = mountNode(
      <Dock collapsed verdict="LOADING" onToggleCollapsed={() => {}}>
        {null}
      </Dock>,
    );
    const chip = container.querySelector(".tw-dock-chip") as HTMLElement;
    expect(chip.tagName).toBe("DIV");
    expect(chip.getAttribute("role")).toBe("status");
    expect(container.querySelector("button")).toBeNull();
    expect(chip.textContent).toContain("Checking…");
    root.unmount();
  });

  it("marks the expanded frame with the verdict", () => {
    const { container, root } = mountNode(
      <Dock collapsed={false} verdict="CAUTION" onToggleCollapsed={() => {}}>
        <p>panel</p>
      </Dock>,
    );
    expect((container.querySelector(".tw-dock") as HTMLElement).dataset.verdict).toBe("CAUTION");
    root.unmount();
  });
});

describe("Annunciator plates (verdict -> tone/mark)", () => {
  it("never lights an UNCHECKED or checking chip, strip or dock green", () => {
    const cases: [string, React.ReactNode][] = [
      ["chip", <Chip verdict="UNCHECKED" symbol="WIF" headline="backend offline" expanded={false} onClick={() => {}} />],
      ["chip loading", <Chip verdict="LOADING" symbol="WIF" headline="" expanded={false} onClick={() => {}} />],
      ["strip", <Strip verdict="UNCHECKED" text="Pick a market" />],
      ["dock", <Dock collapsed verdict="UNCHECKED" headline="Pick a market" onToggleCollapsed={() => {}}>{null}</Dock>],
    ];
    for (const [name, node] of cases) {
      const { container, root } = mountNode(node);
      const plate = container.querySelector(".tw-plate") as HTMLElement;
      expect(plate, name).not.toBeNull();
      expect(plate.dataset.tone, name).toBe("unlit");
      expect(plate.dataset.mark, name).toBe("dashed");
      root.unmount();
    }
  });

  it("lights TRIPWIRE as a filled warning plate and CLEAR as an outlined normal plate", () => {
    const tripwire = mountNode(<Chip verdict="TRIPWIRE" symbol="WIF" headline="x" expanded={false} onClick={() => {}} />);
    expect((tripwire.container.querySelector(".tw-plate") as HTMLElement).dataset).toMatchObject({ tone: "warning", mark: "filled" });
    tripwire.root.unmount();
    const clear = mountNode(<Strip verdict="CLEAR" text="No flags on this token" />);
    expect((clear.container.querySelector(".tw-plate") as HTMLElement).dataset).toMatchObject({ tone: "normal", mark: "outlined" });
    clear.root.unmount();
  });
});

describe("Evidence card tabs", () => {
  const emptySpot: SpotPanel = { flow: null, flowTimeframe: "1d", netflow: null, indicators: null, marketCapUsd: null, topBuyers: null, topSellers: null, chart: null, postTimeIso: null, errors: [] };
  const tabLabels = (container: HTMLElement) => [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
  const selected = (container: HTMLElement) => container.querySelector('[role="tab"][aria-selected="true"]')?.textContent;

  it("spot evidence is Flow / Wallets / Risk, and opens on the requested tab", () => {
    const data: PostIntelResponse = { verdict: "CLEAR", hits: [], unavailable: [], signals: [], panel: emptySpot, rulesPreset: "balanced" };
    const { container, root } = mountNode(<Panel data={data} title="$WIF" onClose={() => {}} initialTab="wallets" />);
    expect(tabLabels(container)).toEqual(["Flow", "Wallets", "Risk"]);
    expect(selected(container)).toBe("Wallets");
    expect(container.querySelector(".tw-card-finding")?.textContent).toBe("None of your rules fired on this token.");
    root.unmount();
  });

  it("perp evidence is Positioning / Liquidations / Traders / Chart; prediction is Proven winners / Holders / Trades", () => {
    const perp = mountNode(<PerpBody panel={{ coin: "ETH", screener: null, positions: null, trades: null, errors: [] }} />);
    expect(tabLabels(perp.container)).toEqual(["Positioning", "Liquidations", "Traders11 credits", "Chart"]);
    perp.root.unmount();
    const prediction = mountNode(<PredictionBody panel={{ market: null, holders: null, trades: null, errors: [] }} initialTab="holders" />);
    expect(tabLabels(prediction.container)).toEqual(["Proven winners", "Holders", "Trades"]);
    expect(selected(prediction.container)).toBe("Holders");
    prediction.root.unmount();
  });

  it("the block screen's evidence button hands itself to onEvidence as the card's anchor", () => {
    const onEvidence = vi.fn();
    const { container, root } = mountNode(<BlockScreen hits={[]} phrase="X" onEvidence={onEvidence} onOverride={() => {}} autoFocus={false} />);
    const button = container.querySelector(".tw-block-evidence") as HTMLButtonElement;
    act(() => button.click());
    expect(onEvidence).toHaveBeenCalledWith(button);
    root.unmount();
  });
});
