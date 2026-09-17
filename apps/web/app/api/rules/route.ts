import { PRESETS, RulesPutSchema, type Rule } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { getRules, setRules, type RulesState } from "@/lib/store";
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
  setRules(state);
  return state;
});
