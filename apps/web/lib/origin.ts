import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";

/**
 * Who may talk to the local backend. Dependency-free (no db, no Nansen client) so the Next
 * proxy (proxy.ts) can import it too.
 *
 * - Host: self-hosted, only 127.0.0.1 / localhost on the backend port (DNS-rebinding defence).
 *   Hosted, only the one public host in `TRIPWIRE_HOSTED_HOST` — the same defence, pointed at
 *   the name we actually serve.
 * - Origin: the backend's own pages, and the pinned Tripwire extension ID only; any other website
 *   or installed extension could otherwise spend credits or weaken someone's rules. This stops
 *   every website; it does not stop `curl`, which can send any Origin it likes — that is what
 *   the install token and the per-install ceiling are for.
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

/** The public host a hosted deployment answers on (`tripwire.magician.wtf`), or null locally. */
export function hostedHost(): string | null {
  const host = process.env.TRIPWIRE_HOSTED_HOST?.trim().toLowerCase();
  return host || null;
}

export function hostAllowed(host: string | null): boolean {
  if (!host) return false;
  const hosted = hostedHost();
  if (hosted) {
    const h = host.toLowerCase();
    return h === hosted || h === `${hosted}:443`;
  }
  const port = backendPort();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function originAllowed(origin: string): boolean {
  if (origin === extensionOrigin()) return true;
  const hosted = hostedHost();
  if (hosted) return origin.toLowerCase() === `https://${hosted}`;
  const port = backendPort();
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
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
