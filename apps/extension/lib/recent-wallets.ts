import { browser } from "wxt/browser";

/**
 * The last wallets the user inspected, so the popup can reopen one. Ten entries, in this
 * profile's own extension storage and nowhere else: no address ever leaves the machine except
 * to the local backend, which is the only thing that talks to Nansen.
 */

export const RECENT_WALLETS_KEY = "recentWallets";
export const RECENT_WALLETS_MAX = 10;

export type RecentWallet = {
  /** What was on the page: an address, or the name it was written as. */
  query: string;
  address: string | null;
  /** The identity line the card showed, for the popup's list. */
  label: string | null;
  chain: string | null;
  seenAt: number;
};

/** Newest first, deduped by query, capped. Pure, so the ordering rule is testable. */
export function addRecent(list: RecentWallet[], entry: RecentWallet, max = RECENT_WALLETS_MAX): RecentWallet[] {
  const key = entry.query.toLowerCase();
  return [entry, ...list.filter((r) => r.query.toLowerCase() !== key)].slice(0, max);
}

const isRecent = (v: unknown): v is RecentWallet =>
  typeof v === "object" && v !== null && typeof (v as RecentWallet).query === "string" && typeof (v as RecentWallet).seenAt === "number";

export async function readRecent(): Promise<RecentWallet[]> {
  try {
    const stored = (await browser.storage.local.get(RECENT_WALLETS_KEY)) as Record<string, unknown>;
    const list = stored[RECENT_WALLETS_KEY];
    return Array.isArray(list) ? list.filter(isRecent).slice(0, RECENT_WALLETS_MAX) : [];
  } catch {
    return [];
  }
}

export async function rememberWallet(entry: RecentWallet): Promise<void> {
  try {
    await browser.storage.local.set({ [RECENT_WALLETS_KEY]: addRecent(await readRecent(), entry) });
  } catch {
    // Storage is a convenience here; a failure must never break the card that triggered it.
  }
}

export async function forgetWallets(): Promise<void> {
  try {
    await browser.storage.local.set({ [RECENT_WALLETS_KEY]: [] });
  } catch {
    // Same: clearing is best-effort.
  }
}
