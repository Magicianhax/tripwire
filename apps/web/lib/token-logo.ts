import { getDb } from "./db";
import { isReplay, nansenPeek } from "./nansen/client";
import { TOKEN_INFO_TTL, type TokenInformationResponse } from "./nansen/endpoints";

/**
 * The token-logo proxy.
 *
 * Nansen's `tgm/token-information` returns a logo on a third-party CDN. Rendering that URL in
 * the card would have the user's browser ask an unrelated host for an image keyed to the exact
 * token they are looking at — a browsing-behaviour leak, on every card. So the backend, which
 * already talked to Nansen about this token, fetches the bytes and serves them from localhost.
 * The extension still talks to nobody but the local backend, and the monogram remains the
 * fallback whenever this returns anything but an image.
 *
 * What makes it safe to point an `<img>` at:
 * - The URL is never taken from the request. It is read out of the cached Nansen answer for the
 *   requested chain and address, so the only hosts ever fetched are hosts Nansen named.
 * - https only, one redirect-free fetch, 5s timeout.
 * - `image/*` content types only, on an allowlist of real raster/vector types.
 * - 200 KB cap, enforced while reading the stream, not just on the declared length.
 * - Never spends a Nansen credit: a token whose information is not already cached gets a 404.
 */

export const MAX_LOGO_BYTES = 200 * 1024;
export const LOGO_TTL_MS = 24 * 60 * 60 * 1000;
export const LOGO_TIMEOUT_MS = 5_000;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"] as const;

export type LogoFailure = { ok: false; status: 400 | 404 | 502; reason: string };
export type LogoBytes = { ok: true; body: Uint8Array; contentType: string; cached: boolean };
export type LogoResult = LogoBytes | LogoFailure;

// Version out bytes cached before identity checks; Solana addresses are case-sensitive.
const cacheKey = (chain: string, address: string) => `logo-v2|${isReplay() ? "replay" : "live"}|${chain}|${chain === "solana" ? address : address.toLowerCase()}`;

/** The logo URL Nansen already gave us for this token, or null. Cache-only: no credit is spent. */
export function cachedLogoUrl(chain: string, tokenAddress: string): string | null {
  const payload = nansenPeek<{ data: TokenInformationResponse | null }>({
    name: "tokenInformation",
    path: "tgm/token-information",
    body: { chain, token_address: tokenAddress, timeframe: "1d" },
  });
  const returnedAddress = payload?.data?.contract_address;
  if (!returnedAddress || (chain === "solana" ? returnedAddress !== tokenAddress : returnedAddress.toLowerCase() !== tokenAddress.toLowerCase())) return null;
  // The bundled token-information recording is WIF on Solana, not a generic logo source.
  if (isReplay() && chain !== "solana") return null;
  const logo = payload?.data?.logo ?? null;
  if (!logo) return null;
  try {
    return new URL(logo).protocol === "https:" ? logo : null;
  } catch {
    return null;
  }
}

type Stored = { contentType: string; base64: string };

function readStored(chain: string, address: string): Stored | null {
  const row = getDb().prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey(chain, address)) as
    | { value: string; expires_at: number }
    | undefined;
  if (!row || row.expires_at <= Date.now()) return null;
  return JSON.parse(row.value) as Stored;
}

function writeStored(chain: string, address: string, value: Stored) {
  const now = Date.now();
  getDb()
    .prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(cacheKey(chain, address), JSON.stringify(value), now, now + LOGO_TTL_MS);
}

const isAllowedType = (header: string | null): string | null => {
  const type = (header ?? "").split(";")[0]!.trim().toLowerCase();
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type) ? type : null;
};

/** Read at most `MAX_LOGO_BYTES`; a body that keeps going past the cap is abandoned, not buffered. */
async function readCapped(res: Response): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LOGO_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export type LogoDeps = { fetchImpl?: typeof fetch };

export async function tokenLogo(chain: string, tokenAddress: string, deps: LogoDeps = {}): Promise<LogoResult> {
  const stored = readStored(chain, tokenAddress);
  if (stored) return { ok: true, body: Buffer.from(stored.base64, "base64"), contentType: stored.contentType, cached: true };

  const url = cachedLogoUrl(chain, tokenAddress);
  if (!url) return { ok: false, status: 404, reason: "no logo known for this token" };

  const doFetch = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { redirect: "follow", signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
  } catch (e) {
    return { ok: false, status: 502, reason: `logo host unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, status: 502, reason: `logo host answered ${res.status}` };

  const contentType = isAllowedType(res.headers.get("content-type"));
  if (!contentType) return { ok: false, status: 502, reason: "logo is not an image" };

  const body = await readCapped(res).catch(() => null);
  if (!body || body.byteLength === 0) return { ok: false, status: 502, reason: `logo is larger than ${MAX_LOGO_BYTES} bytes, or empty` };

  writeStored(chain, tokenAddress, { contentType, base64: Buffer.from(body).toString("base64") });
  return { ok: true, body, contentType, cached: false };
}

/** Test helper: forget one token's cached bytes. */
export function _forgetLogo(chain: string, tokenAddress: string) {
  getDb().prepare("DELETE FROM cache WHERE key = ?").run(cacheKey(chain, tokenAddress));
}

export { TOKEN_INFO_TTL };
