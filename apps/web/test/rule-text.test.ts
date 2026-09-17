import { describe, expect, it } from "vitest";
import { PRESETS } from "@tripwire/core";
import { displayValue, formatThresholdInput, isNegativeSignal, parseThresholdInput, splitSentence, storedThreshold } from "@/app/rules/rule-text";

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
    expect(splitSentence("x exceeds ${n}").isUsd).toBe(true);
  });

  it("marks a {n} template as not isUsd", () => {
    expect(splitSentence("x is more than {n}%").isUsd).toBe(false);
  });
});

describe("isNegativeSignal", () => {
  it("is true for every downward signal", () => {
    expect(isNegativeSignal("labeled_exit_pct")).toBe(true);
    expect(isNegativeSignal("distribution_pct")).toBe(true);
    expect(isNegativeSignal("sm_netflow_pct")).toBe(true);
    expect(isNegativeSignal("drawdown_pct")).toBe(true);
  });

  it("is false for every other signal", () => {
    expect(isNegativeSignal("risk_high_count")).toBe(false);
    expect(isNegativeSignal("sm_opposite_side_pct")).toBe(false);
    expect(isNegativeSignal("inside_liq_band")).toBe(false);
    expect(isNegativeSignal("smart_side_disagrees")).toBe(false);
    expect(isNegativeSignal("author_holds_token")).toBe(false);
  });
});

describe("displayValue", () => {
  it("shows the magnitude for a negative-threshold signal, including the paranoid preset's 0", () => {
    expect(displayValue({ signal: "labeled_exit_pct", threshold: -2.5 })).toBe(2.5);
    expect(displayValue({ signal: "sm_netflow_pct", threshold: -1.5 })).toBe(1.5);
    expect(displayValue({ signal: "drawdown_pct", threshold: -50 })).toBe(50);
    expect(displayValue({ signal: "sm_netflow_pct", threshold: 0 })).toBe(0);
  });

  it("passes a positive-signal threshold through unchanged", () => {
    expect(displayValue({ signal: "risk_high_count", threshold: 2 })).toBe(2);
  });
});

describe("storedThreshold", () => {
  it("stores -1.5 when 1.5 is typed for sm_netflow_pct", () => {
    expect(storedThreshold("sm_netflow_pct", 1.5)).toBe(-1.5);
  });

  it("stores -2.5 when 2.5 is typed for labeled_exit_pct", () => {
    expect(storedThreshold("labeled_exit_pct", 2.5)).toBe(-2.5);
  });

  it("stores 0 when 0 is typed, never -0", () => {
    const stored = storedThreshold("sm_netflow_pct", 0);
    expect(stored).toBe(0);
    expect(Object.is(stored, -0)).toBe(false);
  });

  it("stores a positive-signal rule's typed value unchanged", () => {
    expect(storedThreshold("risk_high_count", 2)).toBe(2);
  });
});

describe("threshold input formatting", () => {
  it("groups digits at rest", () => {
    expect(formatThresholdInput(100_000)).toBe("100,000");
    expect(formatThresholdInput(70)).toBe("70");
  });

  it("parses grouped, spaced or $-prefixed input and rejects junk", () => {
    expect(parseThresholdInput("1,000,000")).toBe(1_000_000);
    expect(parseThresholdInput("$ 25 000")).toBe(25_000);
    expect(parseThresholdInput("")).toBeNull();
    expect(parseThresholdInput("abc")).toBeNull();
    expect(parseThresholdInput("-5")).toBeNull();
  });
});
