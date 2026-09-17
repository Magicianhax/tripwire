// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { Signal } from "@tripwire/core";
import type { HitDto, SpotPanel } from "../lib/api-types";
import { computeBlockRect } from "../lib/adapters/overlay";
import { HitList } from "../lib/ui/panel-parts";
import { decadeTicks, postIndex, symlogFraction } from "../lib/ui/scales";
import { SpotBody } from "../lib/ui/SpotBody";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(node));
  return container;
}

describe("symlogFraction (flow gauges)", () => {
  it("lets a $401 seller register next to a $576K buyer", () => {
    const small = symlogFraction(-401, 576_000);
    expect(small).toBeLessThan(0);
    expect(Math.abs(small)).toBeGreaterThan(0.4);
    expect(symlogFraction(576_000, 576_000)).toBeCloseTo(1);
    expect(symlogFraction(0, 576_000)).toBe(0);
    expect(symlogFraction(null, 576_000)).toBe(0);
  });

  it("orders magnitudes monotonically and never exceeds the track", () => {
    expect(Math.abs(symlogFraction(-8_610, 576_000))).toBeGreaterThan(Math.abs(symlogFraction(-401, 576_000)));
    expect(symlogFraction(2_000_000, 576_000)).toBe(1);
  });

  it("puts shared decade ticks inside the scale", () => {
    expect(decadeTicks(576_000)).toEqual([1_000, 10_000, 100_000]);
    expect(decadeTicks(500)).toEqual([]);
  });
});

describe("postIndex (price trace marker)", () => {
  const candles = ["2026-09-15T10:00:00Z", "2026-09-16T10:00:00Z", "2026-09-17T10:00:00Z"].map((interval_start) => ({ interval_start }));

  it("is the candle nearest the post time, including an interior post", () => {
    expect(postIndex(candles, "2026-09-16T08:00:00Z")).toBe(1);
    expect(postIndex(candles, "2026-09-15T12:00:00Z")).toBe(0);
    expect(postIndex(candles, "2026-09-17T10:00:00Z")).toBe(2);
  });

  it("is null when the post is outside the window or unknown", () => {
    expect(postIndex(candles, "2026-09-10T00:00:00Z")).toBeNull();
    expect(postIndex(candles, "2026-09-18T00:00:00Z")).toBeNull();
    expect(postIndex(candles, null)).toBeNull();
  });
});

describe("computeBlockRect width", () => {
  const button = { top: 500, left: 460, width: 328, height: 48 };

  it("widens to the 440px card clamp, centred on the anchor, still covering it", () => {
    const r = computeBlockRect(button, 180, 0, { width: 1280 });
    expect(r.width).toBe(440);
    expect(r.left).toBe(460 + 164 - 220);
    expect(r.left).toBeLessThanOrEqual(button.left);
    expect(r.left + r.width).toBeGreaterThanOrEqual(button.left + button.width);
  });

  it("never goes wider than the viewport minus 32px, and never narrower than the anchor", () => {
    expect(computeBlockRect({ ...button, left: 16 }, 180, 0, { width: 390 }).width).toBe(358);
    expect(computeBlockRect({ ...button, width: 600, left: 20 }, 180, 0, { width: 1280 }).width).toBe(600);
  });

  it("clamps inside the viewport margin without uncovering the anchor", () => {
    const r = computeBlockRect({ ...button, left: 900 }, 180, 0, { width: 1280 });
    expect(r.left + r.width).toBeLessThanOrEqual(1280 - 16);
    expect(r.left).toBeLessThanOrEqual(900);
  });
});

describe("Flow gauges light the rule-tripping rows", () => {
  const panel: SpotPanel = {
    flow: {
      smart_trader_net_flow_usd: -401,
      whale_net_flow_usd: -8_610,
      public_figure_net_flow_usd: -383,
      top_pnl_net_flow_usd: -311,
      fresh_wallets_net_flow_usd: 576_000,
    } as SpotPanel["flow"],
    flowTimeframe: "1d",
    sincePost: null,
    netflow: { h1: 0, h24: -401, d7: -1_220, d30: 536 } as SpotPanel["netflow"],
    indicators: null,
    marketCapUsd: null,
    topBuyers: null,
    topSellers: null,
    candles: null,
    postTimeIso: null,
    errors: [],
  };
  const hit = (signalId: HitDto["signalId"], threshold: number, op: HitDto["op"] = "<"): HitDto => ({ ruleId: signalId, action: "block", text: signalId, signalId, op, threshold, label: signalId, value: 1, evidence: [] });
  const signals = [{ id: "exit_pressure", kind: "spot", severity: "high", value: -9_394, label: "x", evidence: [] }] as Signal[];

  it("lights exit-pressure rows and fresh wallets, adds a threshold tick, and lights the 24h readout", () => {
    const c = render(<SpotBody panel={panel} hits={[hit("exit_pressure", -5_000), hit("fresh_buy_share", 50, ">"), hit("sm_netflow_24h", 0)]} signals={signals} />);
    const lit = [...c.querySelectorAll(".tw-seg[data-lit]")].map((r) => r.querySelector(".tw-seg-label")?.textContent);
    expect(lit).toEqual(["Exit pressure", "Smart Traders", "Whales", "Public Figures", "Fresh wallets"]);
    const exitRow = c.querySelector(".tw-seg[data-rule]") as HTMLElement;
    expect(exitRow.querySelector(".tw-gauge-threshold")).not.toBeNull();
    expect(c.querySelectorAll(".tw-gauge-threshold")).toHaveLength(1);
    expect(c.querySelector('.tw-readouts [data-lit] dt')?.textContent).toBe("24h");
  });

  it("lights a row in the lamp of its rule: caution for a warn rule", () => {
    const warn = { ...hit("fresh_buy_share", 50, ">"), action: "warn" as const };
    const c = render(<SpotBody panel={panel} hits={[warn]} signals={signals} />);
    expect([...c.querySelectorAll(".tw-seg[data-lit]")].map((r) => (r as HTMLElement).dataset.lit)).toEqual(["caution"]);
  });

  it("lights nothing when no rule fired", () => {
    const c = render(<SpotBody panel={panel} hits={[]} signals={signals} />);
    expect(c.querySelectorAll("[data-lit]")).toHaveLength(0);
    expect(c.querySelectorAll(".tw-gauge-threshold")).toHaveLength(0);
  });
});

describe("rule clause faces", () => {
  it("sets the comparison as tabular figures in the UI face (mono is for addresses only), text unchanged", () => {
    const c = render(<HitList hits={[{ ruleId: "r", action: "block", text: "t", signalId: "fresh_buy_share", op: ">", threshold: 70, label: "Fresh wallets are 82% of buying", value: 82, evidence: [] }]} />);
    const clause = c.querySelector(".tw-hit-rule") as HTMLElement;
    expect(clause.textContent).toBe("rule: > 70%");
    expect(clause.querySelector(".tw-mono")).toBeNull();
    expect(clause.querySelector(".tw-fig")?.textContent).toBe("> 70%");
  });
});

describe("card age on venue cards", () => {
  it("shows when the evidence was checked", async () => {
    const { Panel } = await import("../lib/ui/Panel");
    const c = render(
      <Panel
        data={{ verdict: "CLEAR", hits: [], unavailable: [], signals: [], panel: { flow: null, flowTimeframe: "1d", sincePost: null, netflow: null, indicators: null, marketCapUsd: null, topBuyers: null, topSellers: null, candles: null, postTimeIso: null, errors: [] }, rulesPreset: "balanced" }}
        title="WIF"
        onClose={() => {}}
        checkedAtIso={new Date().toISOString()}
      />,
    );
    expect(c.querySelector(".tw-card-age")?.textContent).toBe("checked now");
  });
});
