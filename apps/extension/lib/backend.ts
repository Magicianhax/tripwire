import { HOSTED_BACKEND_URL } from "@tripwire/core";

/**
 * Which backend the extension talks to, and what it tells that backend about itself.
 *
 * Out of the box that is the hosted backend and nothing here is visible to the user. The only
 * alternative is a self-hosted backend on loopback, chosen under "Advanced" in the popup. Two
 * things travel with every request:
 *
 * - an **install token**, minted once per backend on first use. It is how a hosted backend keeps
 *   one install's daily allowance, rules and history apart from everyone else's. It identifies
 *   nothing beyond "this install": no account, no email, gone on reinstall.
 * - optionally, the user's **own Nansen key**, which spends their credits instead of ours and
 *   lifts the daily limit. It stays in this browser profile and is sent per request; the backend
 *   never stores it (ADR-0014).
 */

export const DEFAULT_BACKEND_URL = HOSTED_BACKEND_URL;

/** The hosted default, or a loopback self-hosted backend. Nothing else: a typo'd or hostile URL
 * would otherwise receive the install token and, worse, the user's own key. */
export const BACKEND_URL_RE = /^(https:\/\/tripwire\.magician\.wtf|http:\/\/(127\.0\.0\.1|localhost):\d{1,5})$/;

export type Store = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export async function readBackendUrl(store: Store): Promise<string> {
  const { backendUrl } = (await store.get(["backendUrl"])) as { backendUrl?: string };
  return backendUrl && BACKEND_URL_RE.test(backendUrl) ? backendUrl : DEFAULT_BACKEND_URL;
}

export async function readUserKey(store: Store): Promise<string | null> {
  const { nansenKey } = (await store.get(["nansenKey"])) as { nansenKey?: string };
  return nansenKey?.trim() || null;
}

async function readTokens(store: Store): Promise<Record<string, string>> {
  const { installTokens } = (await store.get(["installTokens"])) as { installTokens?: Record<string, string> };
  return installTokens ?? {};
}

/**
 * The install token for `backendUrl`, minting one on first use. Tokens are kept per backend, so a
 * hosted token is never sent to a self-hosted one or the other way round. Concurrent first calls
 * share one mint rather than each creating an install.
 */
export function createInstallTokens(store: Store, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const minting = new Map<string, Promise<string | null>>();

  async function mint(backendUrl: string): Promise<string | null> {
    try {
      const res = await fetchImpl(`${backendUrl}/api/install`, { method: "POST", signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => null)) as { token?: unknown } | null;
      const token = typeof json?.token === "string" && json.token.length > 0 ? json.token : null;
      if (token) await store.set({ installTokens: { ...(await readTokens(store)), [backendUrl]: token } });
      return token;
    } catch {
      return null;
    }
  }

  return {
    async get(backendUrl: string): Promise<string | null> {
      const known = (await readTokens(store))[backendUrl];
      if (known) return known;
      const pending = minting.get(backendUrl) ?? mint(backendUrl).finally(() => minting.delete(backendUrl));
      minting.set(backendUrl, pending);
      return pending;
    },
    /** Drops a token the backend no longer recognises, so the next call mints a fresh one. */
    async forget(backendUrl: string): Promise<void> {
      const tokens = await readTokens(store);
      if (!(backendUrl in tokens)) return;
      delete tokens[backendUrl];
      await store.set({ installTokens: tokens });
    },
  };
}
