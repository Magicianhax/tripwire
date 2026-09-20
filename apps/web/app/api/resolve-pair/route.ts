import { preflight, route } from "@/lib/http";
import { ResolvePairRequestSchema, resolvePair } from "@/lib/intel/resolve-pair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const POST = route(ResolvePairRequestSchema, async (_req, body) => ({ target: await resolvePair(body) }));
