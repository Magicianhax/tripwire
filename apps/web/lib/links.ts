import { CURATED_WALLETS, normalizeHandle, type WalletVenue } from "@tripwire/core";
import { getDb } from "./db";

/** A handle's wallet on a venue. User links live in the local `wallet_links` table only; curated
 * entries come from @tripwire/core's source-verified list. */
export type WalletLink = {
  handle: string;
  venue: WalletVenue;
  address: string;
  source: "user" | "curated";
  /** Curated only: where the account states the address. */
  sourceUrl: string | null;
  createdAt: number | null;
};

type Row = { handle: string; venue: WalletVenue; address: string; source: "user" | "curated"; created_at: number };

const fromRow = (r: Row): WalletLink => ({ handle: r.handle, venue: r.venue, address: r.address, source: r.source, sourceUrl: null, createdAt: r.created_at });

const curated = (handle?: string): WalletLink[] =>
  CURATED_WALLETS.filter((w) => handle === undefined || w.handle === handle).map((w) => ({
    handle: w.handle,
    venue: w.venue,
    address: w.address,
    source: "curated",
    sourceUrl: w.sourceUrl,
    createdAt: null,
  }));

/** User links override a curated entry for the same handle and venue. */
function merge(user: WalletLink[], cur: WalletLink[]): WalletLink[] {
  const taken = new Set(user.map((l) => `${l.handle}|${l.venue}`));
  return [...user, ...cur.filter((l) => !taken.has(`${l.handle}|${l.venue}`))];
}

export function listLinks(install: string): WalletLink[] {
  const rows = getDb()
    .prepare("SELECT handle, venue, address, source, created_at FROM wallet_links WHERE install = ? AND source = 'user' ORDER BY created_at DESC")
    .all(install) as Row[];
  return merge(rows.map(fromRow), curated());
}

export function linksFor(install: string, handle: string): WalletLink[] {
  const h = normalizeHandle(handle);
  const rows = getDb()
    .prepare("SELECT handle, venue, address, source, created_at FROM wallet_links WHERE install = ? AND handle = ? AND source = 'user'")
    .all(install, h) as Row[];
  return merge(rows.map(fromRow), curated(h));
}

/** Inputs are already normalized by WalletLinkSchema. */
export function upsertUserLink(install: string, link: { handle: string; venue: WalletVenue; address: string }): WalletLink {
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO wallet_links (install, handle, venue, address, source, created_at) VALUES (?, ?, ?, ?, 'user', ?) ON CONFLICT(install, handle, venue) DO UPDATE SET address = excluded.address, source = 'user', created_at = excluded.created_at",
    )
    .run(install, link.handle, link.venue, link.address, now);
  return { ...link, source: "user", sourceUrl: null, createdAt: now };
}

export function deleteUserLink(install: string, handle: string, venue: WalletVenue): boolean {
  const res = getDb().prepare("DELETE FROM wallet_links WHERE install = ? AND handle = ? AND venue = ? AND source = 'user'").run(install, handle, venue);
  return Number(res.changes) > 0;
}
