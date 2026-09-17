import type { PresetName, Rule } from "./presets";
import { PRESETS } from "./presets";

const RANK: Record<PresetName, number> = { degen: 0, balanced: 1, paranoid: 2 };

/** True when `after` fires in fewer cases than `before` for the same rule: the threshold moved
 * away from the danger side of the comparison. For `>`/`>=` rules a larger threshold is looser;
 * for `<`/`<=` rules (outflow signals are negative) a smaller one is. A changed operator counts
 * as looser, since the two thresholds are no longer comparable. */
export function thresholdLoosened(before: Pick<Rule, "op" | "threshold">, after: Pick<Rule, "op" | "threshold">): boolean {
  if (before.op !== after.op) return true;
  return before.op === ">" || before.op === ">=" ? after.threshold > before.threshold : after.threshold < before.threshold;
}

/** Ids of the enabled block rules in `current` that `next` weakens: disabled, downgraded to warn,
 * missing, or with a looser threshold. */
export function weakenedRuleIds(current: Rule[], next: Rule[]): string[] {
  return current
    .filter((rule) => {
      if (!rule.enabled || rule.action !== "block") return false;
      const after = next.find((r) => r.id === rule.id);
      return !after || !after.enabled || after.action !== "block" || thresholdLoosened(rule, after);
    })
    .map((rule) => rule.id);
}

/** True when `next` removes or loosens a block that `current` enforces. */
export function weakensRules(current: Rule[], next: Rule[]): boolean {
  return weakenedRuleIds(current, next).length > 0;
}

/** Switching presets lowers protection: paranoid -> balanced/degen, balanced -> degen. From a
 * custom rule set, it's weaker when the target preset drops or loosens one of the custom blocks. */
export function isWeakerPreset(from: PresetName | "custom", to: PresetName, currentRules: Rule[] = []): boolean {
  if (from === "custom") return weakensRules(currentRules, PRESETS[to]);
  return RANK[to] < RANK[from];
}

/** The popup's (and /rules') gate for a preset button: ask for an inline confirm only when the
 * choice is a real change that lowers protection. Unknown current state (rules still loading)
 * always asks, so a slow backend can't skip the confirm. */
export function presetChangeNeedsConfirm(current: { preset: PresetName | "custom"; rules: Rule[] } | null, next: PresetName): boolean {
  if (!current) return true;
  if (current.preset === next) return false;
  return isWeakerPreset(current.preset, next, current.rules);
}
