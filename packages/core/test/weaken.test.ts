import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/rules/presets";
import { isWeakerPreset, presetChangeNeedsConfirm, thresholdLoosened, weakenedRuleIds, weakensRules } from "../src/rules/weaken";

describe("isWeakerPreset", () => {
  it("paranoid -> balanced/degen and balanced -> degen are weaker", () => {
    expect(isWeakerPreset("paranoid", "balanced")).toBe(true);
    expect(isWeakerPreset("paranoid", "degen")).toBe(true);
    expect(isWeakerPreset("balanced", "degen")).toBe(true);
  });

  it("same or stronger presets are not weaker", () => {
    expect(isWeakerPreset("degen", "balanced")).toBe(false);
    expect(isWeakerPreset("balanced", "paranoid")).toBe(false);
    expect(isWeakerPreset("balanced", "balanced")).toBe(false);
  });

  it("custom -> any preset is weaker when that preset drops one of custom's blocks", () => {
    const custom = PRESETS.paranoid;
    expect(isWeakerPreset("custom", "degen", custom)).toBe(true);
    const allWarn = PRESETS.paranoid.map((r) => ({ ...r, action: "warn" as const }));
    expect(isWeakerPreset("custom", "paranoid", allWarn)).toBe(false);
  });
});

describe("weakensRules", () => {
  it("disabling an enabled block rule weakens protection", () => {
    const next = PRESETS.balanced.map((r) => (r.id === "spot-exit" ? { ...r, enabled: false } : r));
    expect(weakensRules(PRESETS.balanced, next)).toBe(true);
  });

  it("turning a block rule into a warn weakens protection", () => {
    const next = PRESETS.balanced.map((r) => (r.id === "spot-risk" ? { ...r, action: "warn" as const } : r));
    expect(weakensRules(PRESETS.balanced, next)).toBe(true);
  });

  it("disabling a warn rule, or enabling/adding blocks, does not", () => {
    const disabledWarn = PRESETS.balanced.map((r) => (r.id === "spot-fresh" ? { ...r, enabled: false } : r));
    expect(weakensRules(PRESETS.balanced, disabledWarn)).toBe(false);
    const warnToBlock = PRESETS.balanced.map((r) => (r.id === "spot-fresh" ? { ...r, action: "block" as const } : r));
    expect(weakensRules(PRESETS.balanced, warnToBlock)).toBe(false);
    expect(weakensRules(PRESETS.balanced, PRESETS.balanced)).toBe(false);
  });
});

describe("threshold loosening on block rules", () => {
  it("a bigger outflow threshold (more negative, op <) weakens a block rule", () => {
    const next = PRESETS.balanced.map((r) => (r.id === "spot-exit" ? { ...r, threshold: -200_000 } : r));
    expect(weakensRules(PRESETS.balanced, next)).toBe(true);
    expect(weakenedRuleIds(PRESETS.balanced, next)).toEqual(["spot-exit"]);
  });

  it("a higher threshold on a > / >= block rule weakens it", () => {
    const opp = PRESETS.balanced.map((r) => (r.id === "perp-opp" ? { ...r, threshold: 90 } : r));
    expect(weakensRules(PRESETS.balanced, opp)).toBe(true);
    const risk = PRESETS.balanced.map((r) => (r.id === "spot-risk" ? { ...r, threshold: 3 } : r));
    expect(weakensRules(PRESETS.balanced, risk)).toBe(true);
  });

  it("tightening a block, or loosening a warn, does not weaken", () => {
    const tighter = PRESETS.balanced.map((r) => (r.id === "spot-exit" ? { ...r, threshold: -50_000 } : r.id === "perp-opp" ? { ...r, threshold: 60 } : r));
    expect(weakensRules(PRESETS.balanced, tighter)).toBe(false);
    const looserWarn = PRESETS.balanced.map((r) => (r.id === "spot-fresh" ? { ...r, threshold: 95 } : r));
    expect(weakensRules(PRESETS.balanced, looserWarn)).toBe(false);
  });

  it("derives direction from the operator", () => {
    expect(thresholdLoosened({ op: "<=", threshold: 0 }, { op: "<=", threshold: -1 })).toBe(true);
    expect(thresholdLoosened({ op: ">=", threshold: 2 }, { op: ">=", threshold: 1 })).toBe(false);
    expect(thresholdLoosened({ op: ">", threshold: 2 }, { op: "<", threshold: 2 })).toBe(true);
  });
});

describe("presetChangeNeedsConfirm (popup + /rules)", () => {
  it("asks only for a real change to a weaker preset", () => {
    expect(presetChangeNeedsConfirm({ preset: "paranoid", rules: PRESETS.paranoid }, "degen")).toBe(true);
    expect(presetChangeNeedsConfirm({ preset: "balanced", rules: PRESETS.balanced }, "paranoid")).toBe(false);
    expect(presetChangeNeedsConfirm({ preset: "balanced", rules: PRESETS.balanced }, "balanced")).toBe(false);
  });

  it("compares a custom rule set against the target preset's rules", () => {
    const custom = PRESETS.balanced.map((r) => (r.id === "spot-exit" ? { ...r, threshold: -10_000 } : r));
    expect(presetChangeNeedsConfirm({ preset: "custom", rules: custom }, "balanced")).toBe(true);
    expect(presetChangeNeedsConfirm({ preset: "custom", rules: PRESETS.degen }, "paranoid")).toBe(false);
  });

  it("asks when the current rules haven't loaded", () => {
    expect(presetChangeNeedsConfirm(null, "paranoid")).toBe(true);
  });
});
