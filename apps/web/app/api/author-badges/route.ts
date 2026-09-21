import { AuthorBadgesRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { buildAuthorBadges } from "@/lib/intel/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = installRoute(AuthorBadgesRequestSchema, async (_req, body, install) => buildAuthorBadges(install, body));
