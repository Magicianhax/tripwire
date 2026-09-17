import { WalletLinkDeleteSchema, WalletLinkSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { deleteUserLink, listLinks, upsertUserLink } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Every link: the user's (local only) and the curated, source-verified ones. */
export const GET = route(null, async () => ({ links: listLinks() }));

export const PUT = route(WalletLinkSchema, async (_req, body) => ({ link: upsertUserLink(body) }));

export const DELETE = route(WalletLinkDeleteSchema, async (_req, body) => ({ deleted: deleteUserLink(body.handle, body.venue) }));
