import { timingSafeEqual } from "node:crypto";
import { preflight, route } from "@/lib/http";
import { isHosted, presentedToken } from "@/lib/install";
import { ledgerSummary } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * The operator's secret, compared in constant time. Hosted with no `TRIPWIRE_OWNER_TOKEN` set,
 * nobody is the owner: the ledger stays closed rather than open to anyone.
 */
function isOwner(headers: Headers): boolean {
  const expected = process.env.TRIPWIRE_OWNER_TOKEN?.trim();
  const given = presentedToken(headers);
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const summary = route(null, async () => ledgerSummary());

/** Hosted, the ledger is every install's calls on our key: the operator's to see, nobody else's.
 * Checked before `route`, which turns anything thrown inside it into a 500. */
export const GET = async (req: Request) => {
  if (isHosted() && !isOwner(req.headers)) return Response.json({ error: "owner only" }, { status: 403 });
  return summary(req);
};
