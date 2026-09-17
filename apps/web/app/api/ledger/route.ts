import { preflight, route } from "@/lib/http";
import { ledgerSummary } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = route(null, async () => ledgerSummary());
