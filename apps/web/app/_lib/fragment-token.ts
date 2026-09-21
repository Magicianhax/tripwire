"use client";

/**
 * Reads a credential the extension handed this page in the URL fragment (`#t=…`, `#owner=…`).
 *
 * The fragment is the one part of a URL a browser never sends to the server, so the token never
 * reaches our access logs, a proxy's logs, or a Referer header. Once read it is moved into this
 * tab's sessionStorage and wiped from the address bar, so a copied or screenshotted URL does not
 * carry it and a reload still works.
 */
export function readFragmentToken(name: string): string | null {
  const storageKey = `tripwire:${name}`;
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const fromHash = params.get(name)?.trim();
    if (fromHash) {
      sessionStorage.setItem(storageKey, fromHash);
      params.delete(name);
      const rest = params.toString();
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
      return fromHash;
    }
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
