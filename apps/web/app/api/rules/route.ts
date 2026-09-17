import { PRESETS, RulesPutSchema, isWeakerPreset, weakenedRuleIds, type Rule } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { getRules, recordSettingsChange, setRules, type RulesState } from "@/lib/store";
import { storedThreshold } from "@/app/rules/rule-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = route(null, async () => getRules());

// exit_pressure and sm_netflow_24h are outflow signals: their threshold must always be
// non-positive. Guard server-side too, not just in the editor, so a custom PUT with a
// positive (or merely non-negated) value for these signals can't slip a broken rule in.
function normalizeThresholds(rules: Rule[]): Rule[] {
  return rules.map((r) => ({ ...r, threshold: storedThreshold(r.signal, r.threshold) }));
}

export const PUT = route(RulesPutSchema, async (_req, body) => {
  const state: RulesState =
    "preset" in body ? { preset: body.preset, rules: PRESETS[body.preset] } : { preset: "custom", rules: normalizeThresholds(body.rules) };
  const previous = getRules();
  const ruleIds = weakenedRuleIds(previous.rules, state.rules);
  const weaker = "preset" in body ? isWeakerPreset(previous.preset, body.preset, previous.rules) || ruleIds.length > 0 : ruleIds.length > 0;
  setRules(state);
  // Every downgrade is logged server-side, whichever client made it (popup, /rules, a script).
  if (weaker) recordSettingsChange(previous.preset, state.preset, ruleIds);
  return state;
});
