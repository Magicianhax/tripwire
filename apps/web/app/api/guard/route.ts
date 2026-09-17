import { evaluate, GuardBodySchema, type Signal, type Target } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { toHits } from "@/lib/hits";
import { buildPerpIntel } from "@/lib/intel/perp";
import { buildPredictionIntel } from "@/lib/intel/prediction";
import { buildSpotIntel } from "@/lib/intel/spot";
import { getRules, recordCheck } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

function buildIntel(target: Target, mode: "chip" | "panel"): Promise<{ signals: Signal[]; panel: unknown; headline?: string | null }> {
  if (target.kind === "spot") return buildSpotIntel(target, { mode });
  if (target.kind === "perp") return buildPerpIntel(target, mode);
  return buildPredictionIntel(target, mode);
}

export const POST = route(GuardBodySchema, async (_req, body) => {
  const { target, venue, mode } = body;
  const { signals, panel, headline } = await buildIntel(target, mode);
  const { preset, rules } = getRules();
  const { verdict, hits, unavailable } = evaluate(rules, signals, target.kind);
  recordCheck(venue, target, verdict, signals);
  // Why an UNCHECKED target couldn't be checked ("Pick a market", …), for the chip/strip.
  return { target, verdict, headline: verdict === "UNCHECKED" ? (headline ?? null) : null, hits: toHits(hits), unavailable, signals, panel, rulesPreset: preset };
});
