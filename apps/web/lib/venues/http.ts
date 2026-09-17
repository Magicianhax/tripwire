import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { isReplay } from "../nansen/client";

/**
 * The shared transport for the free public market APIs of Binance, Bybit, OKX and dYdX.
 *
 * Rules that apply to every venue here:
 * - backend only. The extension never reaches an exchange; it asks this backend, which asks them.
 * - no key, no credit, no account. These are the same unauthenticated endpoints their own
 *   public dashboards use.
 * - one failure is one venue. A call that times out, 404s or answers nonsense produces a null
 *   row with a named reason; it never takes down the table or the card.
 * - cached in the shared `cache` table, and deduped while in flight, because a card open asks
 *   for four venues at once and a user flipping tabs asks again a second later.
 * - replay reads `fixtures/venues/<fixture>.json`, so tests and the demo never touch a network.
 */

export const VENUE_TIMEOUT_MS = 6_000;

export class VenueError extends Error {
  constructor(
    public venue: string,
    message: string,
  ) {
    super(message);
  }
}

const inflight = new Map<string, Promise<unknown>>();

function fixtureDir(): string {
  if (process.env.TRIPWIRE_VENUE_FIXTURES) return process.env.TRIPWIRE_VENUE_FIXTURES;
  const nansenDir = process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen");
  return path.resolve(nansenDir, "..", "venues");
}

export function readVenueFixture<T>(fixture: string): T {
  const file = path.join(fixtureDir(), `${fixture}.json`);
  if (!fs.existsSync(file)) throw new VenueError(fixture, `No replay fixture for ${fixture}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export type VenueGetOptions = {
  venue: string;
  /** Replay file under fixtures/venues, without the extension. */
  fixture: string;
  url: string;
  ttlMs: number;
  /** Cache key suffix; defaults to the URL, which is already unique per market. */
  cacheKey?: string;
};

/** One cached GET against a venue's public API. Throws `VenueError` on any failure. */
export async function venueGet<T>(opts: VenueGetOptions): Promise<T> {
  if (isReplay()) return readVenueFixture<T>(opts.fixture);

  const key = `venue|${opts.venue}|${opts.cacheKey ?? opts.url}`;
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key) as { value: string; expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) return JSON.parse(row.value) as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    let res: Response;
    try {
      res = await fetch(opts.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(VENUE_TIMEOUT_MS),
      });
    } catch (e) {
      throw new VenueError(opts.venue, `${opts.venue} unreachable: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) throw new VenueError(opts.venue, `${opts.venue} returned ${res.status}`);
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      throw new VenueError(opts.venue, `${opts.venue} sent a body that isn't JSON`);
    }
    const now = Date.now();
    db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(key, JSON.stringify(data), now, now + opts.ttlMs);
    return data;
  })();

  inflight.set(key, p);
  try {
    return (await p) as T;
  } finally {
    inflight.delete(key);
  }
}

/** Every venue quotes its numbers as decimal strings; this is the one place they become numbers. */
export const venueNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Test helper. */
export function _resetVenueState() {
  inflight.clear();
}
