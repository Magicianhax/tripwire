import { PersonIntelRequestSchema, spotSignals } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { buildPersonIntel } from "@/lib/intel/person";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(PersonIntelRequestSchema, async (_req, body) => {
  const intel = await buildPersonIntel(body);
  if (!body.target || !intel.entity) return intel;

  const signal = spotSignals({ author: { entity: intel.entity, valueUsd: intel.holding?.valueUsd ?? 0 } }).find(
    (s) => s.id === "author_holds_token",
  );
  return { ...intel, signal };
});
