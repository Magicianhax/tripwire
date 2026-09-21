import { OverrideRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { recordOverride } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = installRoute(OverrideRequestSchema, async (_req, body, install) => {
  recordOverride(install, body.venue, body.target, body.verdict, body.ruleIds);
  return { ok: true };
});
