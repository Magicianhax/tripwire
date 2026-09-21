import { installRoute, preflight } from "@/lib/http";
import { marketCatalog, MarketsRequestSchema } from "@/lib/intel/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const POST = installRoute(MarketsRequestSchema, async (_req, body) => marketCatalog(body.symbol));
