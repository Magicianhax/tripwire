import { preflight, route } from "@/lib/http";
import { marketCatalog, MarketsRequestSchema } from "@/lib/intel/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const POST = route(MarketsRequestSchema, async (_req, body) => marketCatalog(body.symbol));
