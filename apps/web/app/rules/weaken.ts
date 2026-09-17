import type { PresetName, Rule } from "@tripwire/core";
import { PRESETS } from "@tripwire/core";

const RANK: Record<PresetName, number> = { degen: 0, balanced: 1, paranoid: 2 };

/** True when `next` removes a block that `current` enforces: an enabled block rule that is
 * disabled, downgraded to warn, or missing in `next`. Threshold changes are not counted. */
export function weakensRules(current: Rule[], next: Rule[]): boolean {
  return current.some((rule) => {
    if (!rule.enabled || rule.action !== "block") return false;
    const after = next.find((r) => r.id === rule.id);
    return !after || !after.enabled || after.action !== "block";
  });
}

/** Switching presets lowers protection: paranoid -> balanced/degen, balanced -> degen. From a
 * custom rule set, it's weaker when the target preset drops one of the custom blocks. */
export function isWeakerPreset(from: PresetName | "custom", to: PresetName, currentRules: Rule[] = []): boolean {
  if (from === "custom") return weakensRules(currentRules, PRESETS[to]);
  return RANK[to] < RANK[from];
}
