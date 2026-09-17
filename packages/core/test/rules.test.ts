import { describe, expect, it } from "vitest";
import { describeRule, evaluate, ruleSentence, stripRuleVerb } from "../src/rules/evaluate";
import { usd } from "../src/format";
import { PRESETS, type Rule } from "../src/rules/presets";
import type { Signal } from "../src/types";

const sig = (id: Signal["id"], value: number | null, kind: Signal["kind"] = "spot"): Signal => ({
  id, kind, value, severity: "info", label: id, evidence: [],
});
const rule = (o: Partial<Rule>): Rule => ({
  id: "r", kind: "spot", signal: "exit_pressure", op: "<", threshold: -100, action: "block", enabled: true, text: "t", ...o,
});

describe("evaluate", () => {
  it("block beats warn", () => {
    const r = evaluate(
      [rule({ id: "a", action: "warn", signal: "fresh_buy_share", op: ">", threshold: 50 }), rule({ id: "b" })],
      [sig("exit_pressure", -500), sig("fresh_buy_share", 90)],
      "spot",
    );
    expect(r.verdict).toBe("TRIPWIRE");
    expect(r.hits.map((h) => h.rule.id)).toEqual(["b", "a"]);
  });

  it("warn only -> CAUTION", () => {
    const r = evaluate([rule({ action: "warn" })], [sig("exit_pressure", -500)], "spot");
    expect(r.verdict).toBe("CAUTION");
  });

  it("null signal -> UNCHECKED, never CLEAR", () => {
    const r = evaluate([rule({})], [sig("exit_pressure", null)], "spot");
    expect(r.verdict).toBe("UNCHECKED");
    expect(r.unavailable).toEqual(["exit_pressure"]);
  });

  it("missing signal entirely counts as unavailable", () => {
    expect(evaluate([rule({})], [], "spot").verdict).toBe("UNCHECKED");
  });

  it("CLEAR when all signals present and nothing fires", () => {
    expect(evaluate([rule({})], [sig("exit_pressure", 10)], "spot").verdict).toBe("CLEAR");
  });

  it("ignores disabled rules and other kinds", () => {
    const r = evaluate(
      [rule({ enabled: false }), rule({ kind: "perp", signal: "sm_opposite_side_pct", op: ">", threshold: 1 })],
      [sig("exit_pressure", -999)],
      "spot",
    );
    expect(r.verdict).toBe("UNCHECKED"); // no applicable rules -> nothing verified
  });

  it("partial data: a firing rule still decides even if another is unavailable", () => {
    const r = evaluate([rule({}), rule({ id: "x", signal: "risk_high_count", op: ">=", threshold: 2 })], [sig("exit_pressure", -500), sig("risk_high_count", null)], "spot");
    expect(r.verdict).toBe("TRIPWIRE");
    expect(r.unavailable).toEqual(["risk_high_count"]);
  });

  it("threshold ops", () => {
    const at = (op: Rule["op"], v: number) => evaluate([rule({ op, threshold: 10, action: "warn", signal: "fresh_buy_share" })], [sig("fresh_buy_share", v)], "spot").verdict;
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
  it("balanced blocks a heavy exit and clears a healthy token", () => {
    const b = PRESETS.balanced;
    const heavy = [sig("exit_pressure", -400_000), sig("fresh_buy_share", 20), sig("sm_netflow_24h", 0), sig("risk_high_count", 0)];
    const healthy = [sig("exit_pressure", 250_000), sig("fresh_buy_share", 20), sig("sm_netflow_24h", 90_000), sig("risk_high_count", 0)];
    expect(evaluate(b, heavy, "spot").verdict).toBe("TRIPWIRE");
    expect(evaluate(b, healthy, "spot").verdict).toBe("CLEAR");
  });
  it("paranoid is stricter than degen", () => {
    const mild = [sig("exit_pressure", -60_000), sig("fresh_buy_share", 20), sig("sm_netflow_24h", 0), sig("risk_high_count", 0)];
    expect(evaluate(PRESETS.degen, mild, "spot").verdict).toBe("CLEAR");
    expect(evaluate(PRESETS.paranoid, mild, "spot").verdict).toBe("TRIPWIRE");
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
    expect(ruleSentence(exit, usd)).toBe("smart money, whales & public figures dump more than $100K");
    expect(describeRule(exit, usd)).toBe("Block when smart money, whales & public figures dump more than $100K");
    const fresh = PRESETS.balanced.find((r) => r.id === "spot-fresh")!;
    expect(describeRule(fresh, usd)).toBe("Warn when fresh wallets are more than 70% of buying");
  });

  it("strips a legacy verb from a rule saved before the change", () => {
    expect(stripRuleVerb("Block when fresh wallets are more than {n}% of buying")).toBe("fresh wallets are more than {n}% of buying");
    const legacy = { ...PRESETS.balanced[1]!, text: "Warn when fresh wallets are more than {n}% of buying" };
    expect(describeRule(legacy, usd)).toBe("Warn when fresh wallets are more than 70% of buying");
  });
});
