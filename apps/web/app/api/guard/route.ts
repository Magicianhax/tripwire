import { evaluate, GuardBodySchema, type Signal, type Target, type ViewTimeframe } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { uncheckedHeadline } from "@/lib/headline";
import { toHits } from "@/lib/hits";
import { buildPerpIntel } from "@/lib/intel/perp";
import { buildPredictionIntel } from "@/lib/intel/prediction";
import { buildSpotIntel } from "@/lib/intel/spot";
import { getRules, recordCheck } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

function buildIntel(
  target: Target,
  mode: "chip" | "panel",
  timeframe?: ViewTimeframe,
): Promise<{ signals: Signal[]; panel: { errors: string[] }; headline?: string | null }> {
  // `timeframe` is a view control: it reaches the spot panel's gauges and chart, never the
  // signals the verdict is evaluated from.
  if (target.kind === "spot") return buildSpotIntel(target, { mode, timeframe });
  if (target.kind === "perp") return buildPerpIntel(target, mode);
  return buildPredictionIntel(target, mode);
}

export const POST = installRoute(GuardBodySchema, async (_req, body, install) => {
  const { target, venue, mode, timeframe } = body;
  const { signals, panel, headline } = await buildIntel(target, mode, timeframe);
  const { preset, rules } = getRules(install);
  const { verdict, hits, unavailable } = evaluate(rules, signals, target.kind);
  recordCheck(install, venue, target, verdict, signals);
  // Why an UNCHECKED target couldn't be checked ("Nansen credit cap reached", "Pick a market").
  const reason = uncheckedHeadline(verdict, panel.errors, headline ?? null);
  return { target, verdict, headline: reason, hits: toHits(hits), unavailable, signals, panel, rulesPreset: preset };
});
