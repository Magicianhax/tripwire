import { PerpLadderRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { perpCohortLadderSection } from "@/lib/intel/depth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 2.5: `tgm/perp-positions` for a cohort other than Smart Money. **5 Nansen credits.**
 *
 * Never part of a card's own load and never part of opening the Liquidations tab, which draws
 * the Smart Money ladder the panel already bought. A button inside that tab states the price
 * and only a press reaches this route — the same rule as the wallet card's lazy views, and the
 * reason §5's base-load decision does not block this: nothing here stacks on a card open.
 */
export const POST = installRoute(PerpLadderRequestSchema, async (_req, body) => perpCohortLadderSection(body.coin, body.cohort));
