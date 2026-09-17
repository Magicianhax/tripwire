import { browser } from "wxt/browser";

/**
 * Where the local backend lives, for the one thing that cannot go through the background
 * bridge: an `<img>` element's `src`.
 *
 * Everything else a content script needs is fetched by the background service worker, which
 * holds the host permission. An image is different — the browser fetches it itself, from the
 * URL in the attribute — so the content script has to know the origin. It reads the same
 * `backendUrl` the popup writes and the bridge uses, once per page session.
 */

export const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";

let origin = DEFAULT_BACKEND_URL;

export const backendOrigin = () => origin;

/** Called once per content script, before anything renders an image. */
export async function loadBackendOrigin(): Promise<string> {
  try {
    const stored = (await browser.storage.local.get("backendUrl")) as { backendUrl?: string };
    if (stored.backendUrl && /^https?:\/\/[^/]+$/.test(stored.backendUrl)) origin = stored.backendUrl;
  } catch {
    // Keep the default: a wrong origin costs a picture, never a verdict.
  }
  return origin;
}

/**
 * The local proxy for a token's logo. The bytes come from the backend, which already fetched
 * them from whatever CDN Nansen named, so the host page never asks a third party for an image
 * that would tell it which token this user is looking at.
 */
export function tokenLogoUrl(chain: string | null | undefined, tokenAddress: string | null | undefined): string | null {
  if (!chain || !tokenAddress) return null;
  return `${origin}/api/token-logo?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(tokenAddress)}`;
}

/** Test helper. */
export function _setBackendOrigin(value: string) {
  origin = value;
}
