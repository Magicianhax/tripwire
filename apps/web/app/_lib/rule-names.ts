import { describeRule, PRESETS, usd, type Rule } from "@tripwire/core";
import type { RulesState } from "@/lib/store";

/** Rule ids as full sentences ("Block when fresh wallets are more than 50% of buying"), looked
 * up in `rules`; an id that isn't there stays as the id. */
export function ruleDescriptions(raw: string, rules: Rule[]): string[] {
  let ids: unknown;
  try {
    ids = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string").map((id) => {
    const rule = rules.find((r) => r.id === id);
    return rule ? describeRule(rule, usd) : id;
  });
}

/** The rules a preset name stood for; "custom" can only be described by the current rules. */
export function rulesForPreset(preset: RulesState["preset"], current: Rule[]): Rule[] {
  return preset === "custom" ? current : PRESETS[preset];
}

export const PRESET_LABEL: Record<RulesState["preset"], string> = {
  degen: "Degen",
  balanced: "Balanced",
  paranoid: "Paranoid",
  custom: "Custom",
};
