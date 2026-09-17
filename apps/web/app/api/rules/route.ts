import { PRESETS, RulesPutSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { getRules, setRules, type RulesState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = route(null, async () => getRules());

export const PUT = route(RulesPutSchema, async (_req, body) => {
  const state: RulesState = "preset" in body ? { preset: body.preset, rules: PRESETS[body.preset] } : { preset: "custom", rules: body.rules };
  setRules(state);
  return state;
});
