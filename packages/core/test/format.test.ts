import { describe, expect, it } from "vitest";
import { formatSignalValue, ruleClause, usd, verdictLabel } from "../src/format";

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
    expect(formatSignalValue("fresh_buy_share", 72.4)).toBe("72%");
    expect(formatSignalValue("sm_opposite_side_pct", 55.6)).toBe("56%");
    expect(formatSignalValue("smart_side_disagrees", 100)).toBe("100%");
  });

  it("risk_high_count is a plain count", () => {
    expect(formatSignalValue("risk_high_count", 2)).toBe("2");
    expect(formatSignalValue("risk_high_count", 0)).toBe("0");
  });

  it("flow signals are signed USD", () => {
    expect(formatSignalValue("exit_pressure", -412_345)).toBe("−$412K");
    expect(formatSignalValue("sm_netflow_24h", 1_250_000)).toBe("+$1.25M");
  });

  it("liquidation band and author holdings are unsigned USD", () => {
    expect(formatSignalValue("inside_liq_band", 2_500_000)).toBe("$2.5M");
    expect(formatSignalValue("author_holds_token", 12_000)).toBe("$12K");
  });

  it("missing values render as a dash", () => {
    expect(formatSignalValue("fresh_buy_share", null)).toBe("—");
    expect(formatSignalValue("risk_high_count", null)).toBe("—");
    expect(formatSignalValue("exit_pressure", null)).toBe("—");
  });
});

describe("ruleClause", () => {
  it("formats the threshold in the signal's own unit, keeping the operator", () => {
    expect(ruleClause({ signalId: "fresh_buy_share", op: ">", threshold: 70 })).toBe("rule: > 70%");
    expect(ruleClause({ signalId: "exit_pressure", op: "<", threshold: -100_000 })).toBe("rule: < −$100K");
    expect(ruleClause({ signalId: "risk_high_count", op: ">=", threshold: 2 })).toBe("rule: >= 2");
    expect(ruleClause({ signalId: "inside_liq_band", op: ">", threshold: 1_000_000 })).toBe("rule: > $1M");
  });
});

describe("verdictLabel", () => {
  it("keeps caps only for the danger words", () => {
    expect(["TRIPWIRE", "CAUTION", "CLEAR", "UNCHECKED"].map((v) => verdictLabel(v as "CLEAR"))).toEqual(["TRIPWIRE", "CAUTION", "Clear", "Unchecked"]);
  });
});
