import { WalletLinkDeleteSchema, WalletLinkSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { deleteUserLink, listLinks, upsertUserLink } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Every link: the user's (local only) and the curated, source-verified ones. */
export const GET = installRoute(null, async (_req, _body, install) => ({ links: listLinks(install) }));

export const PUT = installRoute(WalletLinkSchema, async (_req, body, install) => ({ link: upsertUserLink(install, body) }));

export const DELETE = installRoute(WalletLinkDeleteSchema, async (_req, body, install) => ({ deleted: deleteUserLink(install, body.handle, body.venue) }));
