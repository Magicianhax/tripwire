import { describe, expect, it } from "vitest";
import { PRESETS } from "@tripwire/core";
import { displayValue, isNegativeSignal, splitSentence, storedThreshold } from "@/app/rules/rule-text";

describe("splitSentence", () => {
  it("splits every rule's sentence template in every preset around exactly one placeholder", () => {
    for (const preset of Object.values(PRESETS)) {
      for (const rule of preset) {
        const { before, after, isUsd } = splitSentence(rule.text);
        const token = isUsd ? "${n}" : "{n}";
        // the split recombines to the original text
        expect(`${before}${token}${after}`).toBe(rule.text);
        // exactly one placeholder was present (no leftover token in either half)
        expect(before).not.toContain("{n}");
        expect(after).not.toContain("{n}");
      }
    }
  });

  it("marks a ${n} template as isUsd", () => {
    expect(splitSentence("Block when x exceeds ${n}").isUsd).toBe(true);
  });

  it("marks a {n} template as not isUsd", () => {
    expect(splitSentence("Warn when x is more than {n}%").isUsd).toBe(false);
  });
});

describe("isNegativeSignal", () => {
  it("is true for the two outflow signals", () => {
    expect(isNegativeSignal("exit_pressure")).toBe(true);
    expect(isNegativeSignal("sm_netflow_24h")).toBe(true);
  });

  it("is false for every other signal", () => {
    expect(isNegativeSignal("fresh_buy_share")).toBe(false);
    expect(isNegativeSignal("risk_high_count")).toBe(false);
    expect(isNegativeSignal("sm_opposite_side_pct")).toBe(false);
    expect(isNegativeSignal("inside_liq_band")).toBe(false);
    expect(isNegativeSignal("smart_side_disagrees")).toBe(false);
    expect(isNegativeSignal("author_holds_token")).toBe(false);
  });
});

describe("displayValue", () => {
  it("shows the magnitude for a negative-threshold signal, including the paranoid preset's 0", () => {
    expect(displayValue({ signal: "exit_pressure", threshold: -25_000 })).toBe(25_000);
    expect(displayValue({ signal: "sm_netflow_24h", threshold: -50_000 })).toBe(50_000);
    expect(displayValue({ signal: "sm_netflow_24h", threshold: 0 })).toBe(0);
  });

  it("passes a positive-signal threshold through unchanged", () => {
    expect(displayValue({ signal: "fresh_buy_share", threshold: 70 })).toBe(70);
  });
});

describe("storedThreshold", () => {
  it("stores -50000 when 50000 is typed for sm_netflow_24h", () => {
    expect(storedThreshold("sm_netflow_24h", 50_000)).toBe(-50_000);
  });

  it("stores -25000 when 25000 is typed for exit_pressure", () => {
    expect(storedThreshold("exit_pressure", 25_000)).toBe(-25_000);
  });

  it("stores 0 when 0 is typed, never -0", () => {
    const stored = storedThreshold("sm_netflow_24h", 0);
    expect(stored).toBe(0);
    expect(Object.is(stored, -0)).toBe(false);
  });

  it("stores a positive-signal rule's typed value unchanged", () => {
    expect(storedThreshold("fresh_buy_share", 70)).toBe(70);
  });
});
