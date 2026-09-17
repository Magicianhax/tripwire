import { AuthorBadgesRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { buildAuthorBadges } from "@/lib/intel/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(AuthorBadgesRequestSchema, async (_req, body) => buildAuthorBadges(body));
