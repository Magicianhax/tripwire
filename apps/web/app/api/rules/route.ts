import { PRESETS, RulesPutSchema, isWeakerPreset, stripRuleVerb, weakenedRuleIds, type Rule } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { getRules, recordSettingsChange, setRules, type RulesState } from "@/lib/store";
import { storedThreshold } from "@/app/rules/rule-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = installRoute(null, async (_req, _body, install) => getRules(install));

// exit_pressure and sm_netflow_24h are outflow signals: their threshold must always be
// non-positive. Guard server-side too, not just in the editor, so a custom PUT with a
// positive (or merely non-negated) value for these signals can't slip a broken rule in.
function normalizeThresholds(rules: Rule[]): Rule[] {
  return rules.map((r) => ({ ...r, text: stripRuleVerb(r.text), threshold: storedThreshold(r.signal, r.threshold) }));
}

export const PUT = installRoute(RulesPutSchema, async (_req, body, install) => {
  const state: RulesState =
    "preset" in body ? { preset: body.preset, rules: PRESETS[body.preset] } : { preset: "custom", rules: normalizeThresholds(body.rules) };
  const previous = getRules(install);
  const ruleIds = weakenedRuleIds(previous.rules, state.rules);
  const weaker = "preset" in body ? isWeakerPreset(previous.preset, body.preset, previous.rules) || ruleIds.length > 0 : ruleIds.length > 0;
  setRules(install, state);
  // Every downgrade is logged server-side, whichever client made it (popup, /rules, a script).
  if (weaker) recordSettingsChange(install, previous.preset, state.preset, ruleIds);
  return state;
});
