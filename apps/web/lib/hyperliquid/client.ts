import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { isReplay } from "../nansen/client";

/**
 * Hyperliquid's public info API (no auth, no credits), called from the backend only: the
 * extension never talks to api.hyperliquid.xyz. Answers are cached 60s per request in the shared
 * `cache` table (the API is rate-limited per IP and shared with the whole ecosystem); failures
 * throw and are never cached. Replay reads fixtures/hyperliquid/<type>.json.
 */
export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
export const HL_TTL_MS = 60_000;

export type HyperliquidInfoType = "clearinghouseState" | "userFills";

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

export async function hyperliquidInfo<T>(type: HyperliquidInfoType, user: string): Promise<{ data: T; cached: boolean; stale: boolean }> {
  if (isReplay()) {
    const file = path.join(fixtureDir(), `${type}.json`);
    if (!fs.existsSync(file)) throw new HyperliquidError(404, `No replay fixture for Hyperliquid ${type}`);
    return { data: JSON.parse(fs.readFileSync(file, "utf8")) as T, cached: true, stale: false };
  }

  const key = `hl|${type}|${user.toLowerCase()}`;
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
        body: JSON.stringify({ type, user }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new HyperliquidError(0, `Hyperliquid ${type} unreachable: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) throw new HyperliquidError(res.status, `Hyperliquid ${type} failed (${res.status})`);
    const data = (await res.json()) as T;
    const now = Date.now();
    db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(key, JSON.stringify(data), now, now + HL_TTL_MS);
    return { data, cached: false, stale: false };
  })();

  inflight.set(key, p);
  try {
    return (await p) as { data: T; cached: boolean; stale: boolean };
  } finally {
    inflight.delete(key);
  }
}

/** Test helper. */
export function _resetHyperliquidState() {
  inflight.clear();
}
