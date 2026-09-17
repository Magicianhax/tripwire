import { browser } from "wxt/browser";
import { TIER1_MATCHES, TIER2_MATCHES, X_MATCHES } from "./venues";

/**
 * Per-site consent for the wallet lens.
 *
 * Tripwire never asks for `<all_urls>` at install. The venues and X it already runs on are in
 * the manifest; anywhere else, the user presses "Enable Tripwire on this site" in the popup,
 * Chrome shows its own permission prompt for that one origin, and only then does the wallet
 * content script get registered for it. Removing the site revokes the permission and
 * unregisters the script, so nothing is left injecting.
 *
 * The built content script's file, `content-scripts/wallet.js`, is WXT's output path for the
 * `wallet.content` entrypoint. `test/permissions.test.ts` asserts it exists in the build.
 */

export const WALLET_SCRIPT_FILE = "content-scripts/wallet.js";
export const WALLET_SCRIPT_ID = "tripwire-wallet-lens";

/** Every match pattern the manifest already covers, so the popup never offers what it has. */
export const BUILTIN_MATCHES = [...X_MATCHES, ...TIER1_MATCHES, ...TIER2_MATCHES];

/** `https://x.com/*` -> `x.com`, for comparing a tab's host against the built-in list. */
const hostOfPattern = (pattern: string): string | null => {
  const m = /^[a-z*]+:\/\/([^/]+)\//.exec(pattern);
  return m ? m[1]!.replace(/^\*\./, "") : null;
};

const BUILTIN_HOSTS = BUILTIN_MATCHES.map(hostOfPattern).filter((h): h is string => h !== null);

/** The origin pattern an optional grant uses: one origin, every path. */
export const originPattern = (origin: string) => `${origin}/*`;

/** Is this origin already covered by the manifest? (Then it needs no grant and no offer.) */
export function isBuiltinOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return BUILTIN_HOSTS.some((builtin) => host === builtin || host.endsWith(`.${builtin}`));
}

/** A page Tripwire could be enabled on at all: http(s), not the backend, not a browser page. */
export function isEnableableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return !["127.0.0.1", "localhost"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * The origins the user has granted beyond the manifest, as origins (not patterns). Pure so the
 * popup's list can be tested without the extension APIs.
 */
export function grantedOrigins(patterns: string[] | undefined): string[] {
  const out: string[] = [];
  for (const pattern of patterns ?? []) {
    const m = /^(https?):\/\/([^/*]+)\/\*$/.exec(pattern);
    if (!m) continue;
    const origin = `${m[1]}://${m[2]}`;
    // `isEnableableUrl` also filters out the local backend, which is a manifest host permission
    // and must never show up in a list whose only action is "Remove".
    if (isBuiltinOrigin(origin) || !isEnableableUrl(origin) || out.includes(origin)) continue;
    out.push(origin);
  }
  return out.sort();
}

export async function listEnabledSites(): Promise<string[]> {
  const all = await browser.permissions.getAll();
  return grantedOrigins(all.origins);
}

/** Chrome's own prompt. Returns whether the user said yes. */
export async function requestSite(origin: string): Promise<boolean> {
  const granted = await browser.permissions.request({ origins: [originPattern(origin)] });
  if (granted) await syncWalletScripts();
  return granted;
}

export async function removeSite(origin: string): Promise<boolean> {
  const removed = await browser.permissions.remove({ origins: [originPattern(origin)] });
  if (removed) await syncWalletScripts();
  return removed;
}

/**
 * Point the registered wallet content script at exactly the granted origins: registered when
 * there is at least one, unregistered the moment the last one goes. Called after every grant or
 * removal, on install and on startup, so a permission revoked from Chrome's own UI also stops
 * the injection the next time the service worker wakes.
 */
export async function syncWalletScripts(): Promise<void> {
  const scripting = browser.scripting;
  if (!scripting?.registerContentScripts) return;
  const origins = (await listEnabledSites()).map(originPattern);
  const existing = await scripting.getRegisteredContentScripts({ ids: [WALLET_SCRIPT_ID] }).catch(() => []);

  if (origins.length === 0) {
    if (existing.length > 0) await scripting.unregisterContentScripts({ ids: [WALLET_SCRIPT_ID] });
    return;
  }
  const script = {
    id: WALLET_SCRIPT_ID,
    matches: origins,
    js: [WALLET_SCRIPT_FILE],
    runAt: "document_idle" as const,
    allFrames: false,
    persistAcrossSessions: true,
  };
  if (existing.length > 0) await scripting.updateContentScripts([script]);
  else await scripting.registerContentScripts([script]);
}
