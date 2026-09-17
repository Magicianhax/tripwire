import { describe, expect, it } from "vitest";
import { describeRule, evaluate, ruleSentence, stripRuleVerb } from "../src/rules/evaluate";
import { usd } from "../src/format";
import { PRESETS, type Rule } from "../src/rules/presets";
import type { Signal } from "../src/types";
import { spotSignals } from "../src/signals/spot";

const sig = (id: Signal["id"], value: number | null, kind: Signal["kind"] = "spot"): Signal => ({
  id, kind, value, severity: "info", label: id, evidence: [],
});
const rule = (o: Partial<Rule>): Rule => ({
  id: "r", kind: "spot", signal: "labeled_exit_pct", op: "<", threshold: -100, action: "block", enabled: true, text: "t", ...o,
});

describe("evaluate", () => {
  it("block beats warn", () => {
    const r = evaluate(
      [rule({ id: "a", action: "warn", signal: "drawdown_pct", op: ">", threshold: 50 }), rule({ id: "b" })],
      [sig("labeled_exit_pct", -500), sig("drawdown_pct", 90)],
      "spot",
    );
    expect(r.verdict).toBe("TRIPWIRE");
    expect(r.hits.map((h) => h.rule.id)).toEqual(["b", "a"]);
  });

  it("warn only -> CAUTION", () => {
    const r = evaluate([rule({ action: "warn" })], [sig("labeled_exit_pct", -500)], "spot");
    expect(r.verdict).toBe("CAUTION");
  });

  it("null signal -> UNCHECKED, never CLEAR", () => {
    const r = evaluate([rule({})], [sig("labeled_exit_pct", null)], "spot");
    expect(r.verdict).toBe("UNCHECKED");
    expect(r.unavailable).toEqual(["labeled_exit_pct"]);
  });

  it("missing signal entirely counts as unavailable", () => {
    expect(evaluate([rule({})], [], "spot").verdict).toBe("UNCHECKED");
  });

  it("CLEAR when all signals present and nothing fires", () => {
    expect(evaluate([rule({})], [sig("labeled_exit_pct", 10)], "spot").verdict).toBe("CLEAR");
  });

  it("ignores disabled rules and other kinds", () => {
    const r = evaluate(
      [rule({ enabled: false }), rule({ kind: "perp", signal: "sm_opposite_side_pct", op: ">", threshold: 1 })],
      [sig("labeled_exit_pct", -999)],
      "spot",
    );
    expect(r.verdict).toBe("UNCHECKED"); // no applicable rules -> nothing verified
  });

  it("partial data: a firing rule still decides even if another is unavailable", () => {
    const r = evaluate([rule({}), rule({ id: "x", signal: "risk_high_count", op: ">=", threshold: 2 })], [sig("labeled_exit_pct", -500), sig("risk_high_count", null)], "spot");
    expect(r.verdict).toBe("TRIPWIRE");
    expect(r.unavailable).toEqual(["risk_high_count"]);
  });

  it("threshold ops", () => {
    const at = (op: Rule["op"], v: number) => evaluate([rule({ op, threshold: 10, action: "warn", signal: "drawdown_pct" })], [sig("drawdown_pct", v)], "spot").verdict;
    expect(at(">", 10)).toBe("CLEAR");
    expect(at(">=", 10)).toBe("CAUTION");
    expect(at("<", 10)).toBe("CLEAR");
    expect(at("<=", 10)).toBe("CAUTION");
  });
});

describe("presets", () => {
  it("every preset covers all three kinds with unique ids", () => {
    for (const rules of Object.values(PRESETS)) {
      expect(new Set(rules.map((r) => r.kind))).toEqual(new Set(["spot", "perp", "prediction"]));
      expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    }
  });
  it("every spot preset rule names a signal spotSignals actually emits", () => {
    const emitted = new Set(spotSignals({}).map((s) => s.id));
    for (const rules of Object.values(PRESETS)) {
      for (const r of rules.filter((x) => x.kind === "spot")) expect(emitted.has(r.signal), `${r.id} -> ${r.signal}`).toBe(true);
    }
  });
  it("balanced blocks a labeled exit into fresh buying and clears a healthy token", () => {
    const b = PRESETS.balanced;
    const heavy = [sig("labeled_exit_pct", -6), sig("distribution_pct", -6), sig("sm_netflow_pct", -0.2), sig("drawdown_pct", 3)];
    const healthy = [sig("labeled_exit_pct", 0.6), sig("distribution_pct", 0), sig("sm_netflow_pct", 0.4), sig("drawdown_pct", 3)];
    expect(evaluate(b, heavy, "spot").verdict).toBe("TRIPWIRE");
    expect(evaluate(b, healthy, "spot").verdict).toBe("CLEAR");
  });
  it("paranoid is stricter than degen", () => {
    const mild = [sig("labeled_exit_pct", -0.6), sig("distribution_pct", 0), sig("sm_netflow_pct", -0.1), sig("drawdown_pct", 3)];
    expect(evaluate(PRESETS.degen, mild, "spot").verdict).toBe("CLEAR");
    expect(evaluate(PRESETS.paranoid, mild, "spot").verdict).toBe("CAUTION");
    const dumped = [sig("labeled_exit_pct", 0), sig("distribution_pct", 0), sig("sm_netflow_pct", 0), sig("drawdown_pct", -55)];
    expect(evaluate(PRESETS.degen, dumped, "spot").verdict).toBe("CLEAR");
    expect(evaluate(PRESETS.balanced, dumped, "spot").verdict).toBe("CAUTION");
    expect(evaluate(PRESETS.paranoid, dumped, "spot").verdict).toBe("TRIPWIRE");
  });
  it("no preset ships a rule on risk_high_count: with TOKEN_RISKS as defined it never fires", () => {
    for (const rules of Object.values(PRESETS)) expect(rules.some((r) => r.signal === "risk_high_count")).toBe(false);
  });
});

describe("rule sentences", () => {
  it("preset templates carry no verb; the action supplies it", () => {
    for (const rules of Object.values(PRESETS)) {
      for (const r of rules) expect(r.text).not.toMatch(/^(block|warn)/i);
    }
  });

  it("fills the threshold and prefixes the action verb in describeRule", () => {
    const exit = PRESETS.balanced.find((r) => r.id === "spot-exit")!;
    expect(ruleSentence(exit, usd)).toBe("labeled wallets sell more than 1% of 24h volume");
    expect(describeRule(exit, usd)).toBe("Warn when labeled wallets sell more than 1% of 24h volume");
    const deep = PRESETS.balanced.find((r) => r.id === "spot-exit-deep")!;
    expect(describeRule(deep, usd)).toBe("Block when labeled wallets sell more than 5% of 24h volume");
    const dist = PRESETS.balanced.find((r) => r.id === "spot-distribution")!;
    expect(describeRule(dist, usd)).toBe("Block when labeled wallets sell more than 2% of 24h volume into fresh-wallet buying");
    const sm = PRESETS.balanced.find((r) => r.id === "spot-sm24")!;
    expect(describeRule(sm, usd)).toBe("Warn when Smart Money\u2019s 24h net outflow exceeds 1.5% of 24h volume");
    const dd = PRESETS.balanced.find((r) => r.id === "spot-drawdown")!;
    expect(describeRule(dd, usd)).toBe("Warn when the price is down more than 50% over 7 days");
    const liq = PRESETS.balanced.find((r) => r.id === "perp-liq")!;
    expect(describeRule(liq, usd)).toBe("Warn when more than $1M of Smart Money liquidates near price");
  });

  it("strips a legacy verb from a rule saved before the change", () => {
    expect(stripRuleVerb("Block when fresh wallets are more than {n}% of buying")).toBe("fresh wallets are more than {n}% of buying");
    const legacy = { ...PRESETS.balanced.find((r) => r.id === "spot-exit")!, text: "Warn when labeled wallets sell more than {n}% of 24h volume" };
    expect(describeRule(legacy, usd)).toBe("Warn when labeled wallets sell more than 1% of 24h volume");
  });
});
