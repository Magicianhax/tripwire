import { browser } from "wxt/browser";

/**
 * A token's picture, fetched by the background from the local backend's `/api/token-logo` and
 * handed to the card as a data URL.
 *
 * Why not just point the `<img>` at `http://127.0.0.1:3000/api/token-logo?…`: Chrome's Private
 * Network Access rules refuse a request from an https page into the loopback address space, so
 * the card logged a CORS failure on every open and always fell back to the monogram. The
 * background service worker holds the host permission and is not subject to that rule.
 *
 * The result is that the host page still requests nothing: not from Nansen's third-party logo
 * CDN, and not from the backend either. `null` means "no picture" and the caller shows a
 * monogram — for a token with no logo, a backend that isn't running, or bytes that failed the
 * backend's own image and size checks.
 */

const cache = new Map<string, Promise<string | null>>();

export async function tokenLogoDataUrl(chain: string | null | undefined, address: string | null | undefined): Promise<string | null> {
  if (!chain || !address) return null;
  const key = `${chain}|${address.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const response = (await browser.runtime.sendMessage({ type: "tokenLogo", chain, address })) as { ok?: boolean; json?: { dataUrl?: string } } | undefined;
      return response?.ok && typeof response.json?.dataUrl === "string" ? response.json.dataUrl : null;
    } catch {
      return null;
    }
  })();
  cache.set(key, pending);
  return pending;
}

/** Test helper. */
export function _resetTokenLogoCache() {
  cache.clear();
}
