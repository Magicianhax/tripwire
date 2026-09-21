import { evaluate, PostIntelRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { uncheckedHeadline } from "@/lib/headline";
import { toHits } from "@/lib/hits";
import { buildSpotIntel } from "@/lib/intel/spot";
import { getRules, recordCheck } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = installRoute(PostIntelRequestSchema, async (_req, body, install) => {
  // `timeframe` moves the gauges and the chart only: the signals below are always built on the
  // verdict window, so switching the view can never change the verdict.
  const { signals, panel, headline } = await buildSpotIntel(body.target, { mode: body.mode, postTimeIso: body.postTimeIso, timeframe: body.timeframe });
  const { preset, rules } = getRules(install);
  const { verdict, hits, unavailable } = evaluate(rules, signals, "spot");
  recordCheck(install, "x", body.target, verdict, signals);
  return { verdict, headline: uncheckedHeadline(verdict, panel.errors, headline), hits: toHits(hits), unavailable, signals, panel, rulesPreset: preset };
});
