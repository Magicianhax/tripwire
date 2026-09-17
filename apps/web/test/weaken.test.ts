import { PRESETS } from "@tripwire/core";
import { describe, expect, it } from "vitest";
import { isWeakerPreset, weakensRules } from "@/app/rules/weaken";

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
