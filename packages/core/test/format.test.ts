import { describe, expect, it } from "vitest";
import { formatSignalValue, ruleClause, usd, verdictLabel, verdictPlate } from "../src/format";

describe("usd", () => {
  it("keeps the zeros of whole hundreds (150K is not 15K)", () => {
    expect(usd(-150_000)).toBe("−$150K");
    expect(usd(100_000_000)).toBe("$100M");
    expect(usd(200_000, true)).toBe("+$200K");
    expect(usd(1_500_000)).toBe("$1.5M");
    expect(usd(10_000)).toBe("$10K");
  });
});

describe("formatSignalValue", () => {
  it("percent signals render as whole percentages", () => {
    expect(formatSignalValue("drawdown_pct", -72.4)).toBe("-72%");
    expect(formatSignalValue("sm_opposite_side_pct", 55.6)).toBe("56%");
    expect(formatSignalValue("smart_side_disagrees", 100)).toBe("100%");
  });

  it("volume-normalized signals carry their denominator and keep sub-percent precision", () => {
    expect(formatSignalValue("labeled_exit_pct", -14.49)).toBe("\u221214.5% of volume");
    expect(formatSignalValue("distribution_pct", -2)).toBe("\u22122% of volume");
    expect(formatSignalValue("sm_netflow_pct", -0.75)).toBe("\u22120.75% of volume");
    expect(formatSignalValue("labeled_exit_pct", 0.58)).toBe("0.58% of volume");
  });

  it("risk_high_count is a plain count", () => {
    expect(formatSignalValue("risk_high_count", 2)).toBe("2");
    expect(formatSignalValue("risk_high_count", 0)).toBe("0");
  });

  it("liquidation band and author holdings are unsigned USD", () => {
    expect(formatSignalValue("inside_liq_band", 2_500_000)).toBe("$2.5M");
    expect(formatSignalValue("author_holds_token", 12_000)).toBe("$12K");
  });

  it("missing values render as a dash", () => {
    expect(formatSignalValue("labeled_exit_pct", null)).toBe("—");
    expect(formatSignalValue("risk_high_count", null)).toBe("—");
    expect(formatSignalValue("drawdown_pct", null)).toBe("—");
  });
});

describe("ruleClause", () => {
  it("formats the threshold in the signal's own unit, keeping the operator", () => {
    expect(ruleClause({ signalId: "labeled_exit_pct", op: "<", threshold: -5 })).toBe("rule: < −5% of volume");
    expect(ruleClause({ signalId: "drawdown_pct", op: "<=", threshold: -50 })).toBe("rule: <= -50%");
    expect(ruleClause({ signalId: "risk_high_count", op: ">=", threshold: 2 })).toBe("rule: >= 2");
    expect(ruleClause({ signalId: "inside_liq_band", op: ">", threshold: 1_000_000 })).toBe("rule: > $1M");
  });
});

describe("verdictLabel", () => {
  it("keeps caps only for the danger words", () => {
    expect(["TRIPWIRE", "CAUTION", "CLEAR", "UNCHECKED"].map((v) => verdictLabel(v as "CLEAR"))).toEqual(["TRIPWIRE", "CAUTION", "Clear", "Unchecked"]);
  });
});

describe("verdictPlate", () => {
  it("maps each verdict to its crew-alerting tone and a non-colour mark", () => {
    expect(verdictPlate("TRIPWIRE")).toEqual({ tone: "warning", mark: "filled" });
    expect(verdictPlate("CAUTION")).toEqual({ tone: "caution", mark: "filled" });
    expect(verdictPlate("CLEAR")).toEqual({ tone: "normal", mark: "outlined" });
    expect(verdictPlate("UNCHECKED")).toEqual({ tone: "unlit", mark: "dashed" });
    expect(verdictPlate("LOADING")).toEqual({ tone: "unlit", mark: "dashed" });
  });

  it("never lights UNCHECKED (or a pending check) green, and CLEAR never shares a mark with a lit alert", () => {
    // Red/amber vs green is the colour-blind failure pair: the mark must differ on its own.
    expect(verdictPlate("CLEAR").mark).not.toBe(verdictPlate("TRIPWIRE").mark);
    expect(verdictPlate("CLEAR").mark).not.toBe(verdictPlate("CAUTION").mark);
    for (const v of ["UNCHECKED", "LOADING"] as const) {
      expect(verdictPlate(v).tone).not.toBe("normal");
      expect(verdictPlate(v).mark).not.toBe(verdictPlate("CLEAR").mark);
    }
  });
});
