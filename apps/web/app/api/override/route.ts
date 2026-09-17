import { OverrideRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { recordOverride } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(OverrideRequestSchema, async (_req, body) => {
  recordOverride(body.venue, body.target, body.verdict, body.ruleIds);
  return { ok: true };
});
