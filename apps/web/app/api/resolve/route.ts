import { ResolveRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { resolveCashtag } from "@/lib/intel/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = installRoute(ResolveRequestSchema, async (_req, body) => resolveCashtag(body.symbol, body.chainHint));
