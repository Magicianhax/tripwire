import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";

/**
 * Who may talk to the local backend. Dependency-free (no db, no Nansen client) so the Next
 * proxy (proxy.ts) can import it too.
 *
 * - Host: only 127.0.0.1 / localhost on the backend port (DNS-rebinding defence).
 * - Origin: the local pages, and the pinned Tripwire extension ID only; any other website or
 *   installed extension could otherwise spend the user's Nansen credits or weaken their rules.
 * - No Origin: only non-browser clients (no Sec-Fetch-Site) or same-origin / user-initiated
 *   requests (Sec-Fetch-Site same-origin / none).
 */

export function backendPort(): string {
  const port = process.env.TRIPWIRE_PORT?.trim();
  return port && /^\d{1,5}$/.test(port) ? port : "3000";
}

export function extensionOrigin(): string {
  const override = process.env.TRIPWIRE_EXTENSION_ORIGIN?.trim();
  return override || `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
}

export function hostAllowed(host: string | null): boolean {
  if (!host) return false;
  const port = backendPort();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function originAllowed(origin: string): boolean {
  const port = backendPort();
  if (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`) return true;
  return origin === extensionOrigin();
}

const NO_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

/** `fallbackHost` is the request URL's host, used when no Host header is present (tests). */
export function requestAllowed(headers: Headers, fallbackHost?: string): boolean {
  if (!hostAllowed(headers.get("host") ?? fallbackHost ?? null)) return false;
  const origin = headers.get("origin");
  if (origin !== null) return originAllowed(origin);
  const site = headers.get("sec-fetch-site");
  return site === null || NO_ORIGIN_FETCH_SITES.has(site);
}
