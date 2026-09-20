import { preflight, route } from "@/lib/http";
import { enrichMarkets, MarketEnrichRequestSchema } from "@/lib/intel/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Per-token market figures for a page of the Markets catalog (Round 1.6.2).
 *
 * **One credit per group of up to five chains, whatever the row count** — which is the only
 * reason this exists as its own route rather than as part of `/api/markets`: the catalog itself
 * is free and stays free. Nothing reaches here except a button the user pressed after reading
 * what it costs, and the same count the button printed is returned in `credits` so the card's
 * footer can reconcile against it.
 */
export const POST = route(MarketEnrichRequestSchema, async (_req, body) => enrichMarkets(body));
