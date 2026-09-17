/**
 * X handle -> venue wallet, for the Hyperliquid and Polymarket author badges.
 *
 * Tripwire never guesses who owns a wallet (ADR-0005, docs/SPIKE-badges.md): neither venue
 * exposes an X link, and name similarity finds impersonators as readily as owners. A venue badge
 * therefore only appears for a handle that is either linked by the user (stored locally, see
 * apps/web/lib/links.ts) or listed here.
 *
 * Inclusion rule for CURATED_WALLETS: the `sourceUrl` was fetched and shows the address stated by
 * that X account itself or on its owner's official profile, checked on `verifiedOn`. Third-party
 * attributions (analytics threads, news, trackers) do not qualify.
 *
 * Shipped empty: in the 2026-09-17 build no candidate met the rule with a fetchable source (X
 * posts are not readable without a login, and the venues publish no X links).
 */

export const WALLET_VENUES = ["hyperliquid", "polymarket"] as const;
export type WalletVenue = (typeof WALLET_VENUES)[number];

export type CuratedWallet = {
  /** Lowercase X handle, no "@". */
  handle: string;
  venue: WalletVenue;
  /** Lowercase 0x address: Hyperliquid account, or Polymarket proxy wallet. */
  address: string;
  /** Where the account itself states the address (https). */
  sourceUrl: string;
  /** YYYY-MM-DD the source was checked. */
  verifiedOn: string;
};

export const CURATED_WALLETS: readonly CuratedWallet[] = [];

/** X's handle rule, same as PersonIntelRequestSchema. */
export const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const VENUE_ADDRESS_RE: Record<WalletVenue, RegExp> = {
  hyperliquid: /^0x[a-fA-F0-9]{40}$/,
  polymarket: /^0x[a-fA-F0-9]{40}$/,
};

export const isVenueWalletAddress = (venue: WalletVenue, address: string) => VENUE_ADDRESS_RE[venue].test(address);

export const normalizeHandle = (handle: string) => handle.replace(/^@/, "").toLowerCase();

/** Problems with a curated list, one message per bad entry; empty when the list is sound. */
export function validateCuratedWallets(list: readonly CuratedWallet[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  list.forEach((w, i) => {
    const at = `entry ${i} (@${w.handle} ${w.venue})`;
    const issues: string[] = [];
    if (!HANDLE_RE.test(w.handle) || w.handle !== w.handle.toLowerCase()) issues.push("handle must be a lowercase X handle");
    if (!(WALLET_VENUES as readonly string[]).includes(w.venue)) issues.push("unknown venue");
    else if (!isVenueWalletAddress(w.venue, w.address) || w.address !== w.address.toLowerCase()) issues.push("address must be lowercase 0x + 40 hex");
    if (!/^https:\/\/\S+$/.test(w.sourceUrl)) issues.push("sourceUrl must be an https URL");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.verifiedOn) || Number.isNaN(Date.parse(w.verifiedOn))) issues.push("verifiedOn must be YYYY-MM-DD");
    const key = `${w.handle}|${w.venue}`;
    if (seen.has(key)) issues.push("duplicate handle + venue");
    seen.add(key);
    if (issues.length > 0) problems.push(`${at}: ${issues.join("; ")}`);
  });
  return problems;
}

/** Curated entries for exactly this handle (case-insensitive), never a partial match. */
export function curatedWalletsFor(handle: string, list: readonly CuratedWallet[] = CURATED_WALLETS): CuratedWallet[] {
  const h = normalizeHandle(handle);
  return list.filter((w) => w.handle === h);
}
