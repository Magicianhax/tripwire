import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { isReplay } from "../nansen/client";

/**
 * Hyperliquid's public info API (no auth, no credits), called from the backend only: the
 * extension never talks to api.hyperliquid.xyz. Answers are cached per request in the shared
 * `cache` table (the API is rate-limited per IP and shared with the whole ecosystem); failures
 * throw and are never cached. Replay reads fixtures/hyperliquid/<type>.json.
 */
export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
export const HL_TTL_MS = 60_000;

/** Per-account requests: the caller is asking about one address. */
export type HyperliquidInfoType = "clearinghouseState" | "userFills";

/**
 * Market-wide requests. None of them name a user, so they are cached per market rather than per
 * address, and they are what the perp card's depth is built from.
 *
 * TTLs: the mark/funding/OI snapshot and the book move every block, so they stay short; funding
 * history and candles are closed buckets and can be held far longer.
 */
export const HL_MARKET_TTL_MS: Record<string, number> = {
  metaAndAssetCtxs: 30_000,
  l2Book: 15_000,
  fundingHistory: 5 * 60_000,
  candleSnapshot: 60_000,
  predictedFundings: 60_000,
};

export class HyperliquidError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const inflight = new Map<string, Promise<{ data: unknown; cached: boolean; stale: boolean }>>();

function fixtureDir(): string {
  if (process.env.TRIPWIRE_HL_FIXTURES) return process.env.TRIPWIRE_HL_FIXTURES;
  const nansenDir = process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen");
  return path.resolve(nansenDir, "..", "hyperliquid");
}

function readFixture<T>(name: string): T {
  const file = path.join(fixtureDir(), `${name}.json`);
  if (!fs.existsSync(file)) throw new HyperliquidError(404, `No replay fixture for Hyperliquid ${name}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** One POST to the info endpoint, cached under `key` for `ttlMs`, deduped while in flight. */
async function infoPost<T>(key: string, body: Record<string, unknown>, ttlMs: number, label: string): Promise<{ data: T; cached: boolean; stale: boolean }> {
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key) as { value: string; expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) return { data: JSON.parse(row.value) as T, cached: true, stale: false };

  const pending = inflight.get(key);
  if (pending) return pending as Promise<{ data: T; cached: boolean; stale: boolean }>;

  const p = (async () => {
    let res: Response;
    try {
      res = await fetch(HL_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new HyperliquidError(0, `Hyperliquid ${label} unreachable: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) throw new HyperliquidError(res.status, `Hyperliquid ${label} failed (${res.status})`);
    const data = (await res.json()) as T;
    const now = Date.now();
    db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(key, JSON.stringify(data), now, now + ttlMs);
    return { data, cached: false, stale: false };
  })();

  inflight.set(key, p);
  try {
    return (await p) as { data: T; cached: boolean; stale: boolean };
  } finally {
    inflight.delete(key);
  }
}

export async function hyperliquidInfo<T>(type: HyperliquidInfoType, user: string): Promise<{ data: T; cached: boolean; stale: boolean }> {
  if (isReplay()) return { data: readFixture<T>(type), cached: true, stale: false };
  return infoPost<T>(`hl|${type}|${user.toLowerCase()}`, { type, user }, HL_TTL_MS, type);
}

/**
 * A market-wide info request. `type` names the call, `extra` carries its parameters, and
 * `fixture` is the replay file (several markets share one recorded shape, so the caller picks
 * the name rather than the coin doing it).
 */
export async function hyperliquidMarket<T>(
  type: string,
  extra: Record<string, unknown> = {},
  opts: { fixture?: string; cacheKey?: string; ttlMs?: number } = {},
): Promise<{ data: T; cached: boolean; stale: boolean }> {
  const fixture = opts.fixture ?? type;
  if (isReplay()) return { data: readFixture<T>(fixture), cached: true, stale: false };
  const suffix = opts.cacheKey ?? JSON.stringify(extra);
  const ttl = opts.ttlMs ?? HL_MARKET_TTL_MS[type] ?? HL_TTL_MS;
  return infoPost<T>(`hl|${type}|${suffix}`, { type, ...extra }, ttl, type);
}

/** Test helper. */
export function _resetHyperliquidState() {
  inflight.clear();
}
