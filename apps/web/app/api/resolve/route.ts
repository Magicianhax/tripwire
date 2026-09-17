import { ResolveRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { resolveCashtag } from "@/lib/intel/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(ResolveRequestSchema, async (_req, body) => resolveCashtag(body.symbol, body.chainHint));
