import { installRoute, preflight } from "@/lib/http";
import { ResolvePairRequestSchema, resolvePair } from "@/lib/intel/resolve-pair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const POST = installRoute(ResolvePairRequestSchema, async (_req, body) => ({ target: await resolvePair(body) }));
