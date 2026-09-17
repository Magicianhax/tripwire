import { evaluate, PostIntelRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { toHits } from "@/lib/hits";
import { buildSpotIntel } from "@/lib/intel/spot";
import { getRules, recordCheck } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(PostIntelRequestSchema, async (_req, body) => {
  const { signals, panel } = await buildSpotIntel(body.target, { mode: body.mode, postTimeIso: body.postTimeIso });
  const { preset, rules } = getRules();
  const { verdict, hits, unavailable } = evaluate(rules, signals, "spot");
  recordCheck("x", body.target, verdict, signals);
  return { verdict, hits: toHits(hits), unavailable, signals, panel, rulesPreset: preset };
});
