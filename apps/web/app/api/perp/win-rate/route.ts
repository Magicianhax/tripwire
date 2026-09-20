import { PerpWinRateRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { buildPerpWinRate } from "@/lib/intel/perp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 2.5: `profiler/perp-pnl-summary` for one trader on the leaderboard. **1 Nansen credit
 * per press**, over the same 30 days the leaderboard itself asks for.
 *
 * An explicit click on one row, never a hover: the expanded card lists twelve traders, and a
 * hover trigger is twelve credits from one careless mouse pass across the table.
 */
export const POST = route(PerpWinRateRequestSchema, async (_req, body) => buildPerpWinRate(body.address));
