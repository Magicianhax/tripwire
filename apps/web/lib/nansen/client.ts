import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { resolveApiKey } from "./key";

export const NANSEN_BASE = "https://api.nansen.ai/api/v1";

export class BudgetExceeded extends Error {
  constructor() {
    super("Daily Nansen credit cap reached");
  }
}
/** A premium endpoint was asked for while `NANSEN_ALLOW_PREMIUM` is off. Lives here, next to
 * the budget cap, because both are spend policy rather than a transport failure. */
export class PremiumDisabled extends Error {
  constructor(endpoint: string, credits: number) {
    super(`${endpoint} costs ${credits} Nansen credits and is off. Set NANSEN_ALLOW_PREMIUM=1 on the backend to allow it.`);
  }
}

export class NansenError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type NansenResult<T> = {
  data: T;
  cached: boolean;
  stale: boolean;
  storedAt: number;
  creditsUsed: number | null;
};

type CallOpts = { name: string; path: string; body: unknown; ttlMs: number };

const MEM_MAX = 500;
const mem = new Map<string, { value: unknown; storedAt: number; expiresAt: number }>();
const inflight = new Map<string, Promise<NansenResult<unknown>>>();

export const isReplay = () => process.env.TRIPWIRE_REPLAY === "1";

/** Deterministic JSON so logically-equal bodies share a cache key. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function dayStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function creditsToday(): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(credits),0) AS c FROM ledger WHERE ts >= ?").get(dayStart()) as { c: number };
  return row.c;
}

const cap = () => Number(process.env.NANSEN_DAILY_CREDIT_CAP ?? 3000);

// simple token bucket: RATE requests per second
const RATE = 10;
let tokens = RATE;
let lastRefill = Date.now();
async function takeToken() {
  for (;;) {
    const now = Date.now();
    // max(0, …): a wall-clock step backwards must not drain the bucket into a long stall.
    tokens = Math.min(RATE, tokens + (Math.max(0, now - lastRefill) / 1000) * RATE);
    lastRefill = now;
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    await sleep(Math.ceil(((1 - tokens) / RATE) * 1000));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readCache(key: string): { value: unknown; storedAt: number; expiresAt: number } | null {
  const m = mem.get(key);
  if (m) return m;
  const row = getDb().prepare("SELECT value, stored_at, expires_at FROM cache WHERE key = ?").get(key) as
    | { value: string; stored_at: number; expires_at: number }
    | undefined;
  if (!row) return null;
  const entry = { value: JSON.parse(row.value), storedAt: row.stored_at, expiresAt: row.expires_at };
  remember(key, entry);
  return entry;
}

function remember(key: string, entry: { value: unknown; storedAt: number; expiresAt: number }) {
  mem.delete(key);
  mem.set(key, entry);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value!);
}

function writeCache(key: string, value: unknown, ttlMs: number) {
  const now = Date.now();
  const entry = { value, storedAt: now, expiresAt: now + ttlMs };
  remember(key, entry);
  getDb()
    .prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(key, JSON.stringify(value), now, entry.expiresAt);
}

function logCall(endpoint: string, status: number, credits: number | null, latency: number) {
  getDb().prepare("INSERT INTO ledger (ts, endpoint, status, credits, latency_ms) VALUES (?, ?, ?, ?, ?)").run(Date.now(), endpoint, status, credits, latency);
}

function readFixture<T>(name: string): T {
  const dir = process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen");
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) throw new NansenError(404, `No replay fixture for ${name}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/**
 * A cache-only read of a call that has already been made. Never reaches the network and never
 * spends a credit: the token-logo proxy serves a picture for a token the card is already
 * showing, and a picture is not worth a Nansen call of its own. Replay answers from the fixture,
 * as everywhere else.
 */
export function nansenPeek<T>(opts: Omit<CallOpts, "ttlMs">): T | null {
  if (isReplay()) {
    try {
      return readFixture<T>(opts.name);
    } catch {
      return null;
    }
  }
  const hit = readCache(`${opts.path}|${stableStringify(opts.body)}`);
  return hit && hit.expiresAt > Date.now() ? (hit.value as T) : null;
}

export async function nansenPost<T>(opts: CallOpts): Promise<NansenResult<T>> {
  if (isReplay()) {
    return { data: readFixture<T>(opts.name), cached: true, stale: false, storedAt: Date.now(), creditsUsed: 0 };
  }

  const key = `${opts.path}|${stableStringify(opts.body)}`;
  const hit = readCache(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return { data: hit.value as T, cached: true, stale: false, storedAt: hit.storedAt, creditsUsed: null };
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<NansenResult<T>>;

  const p = (async (): Promise<NansenResult<T>> => {
    if (creditsToday() >= cap()) {
      if (hit) return { data: hit.value as T, cached: true, stale: true, storedAt: hit.storedAt, creditsUsed: null };
      throw new BudgetExceeded();
    }
    const { key: apiKey } = resolveApiKey();
    if (!apiKey) throw new NansenError(401, "No Nansen API key configured (set NANSEN_API_KEY or run `nansen login`)");

    for (let attempt = 0; ; attempt++) {
      await takeToken();
      const started = Date.now();
      const res = await fetch(`${NANSEN_BASE}/${opts.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(opts.body),
        signal: AbortSignal.timeout(20_000),
      });
      const creditsHeader = res.headers.get("x-nansen-credits-used");
      const credits = creditsHeader === null ? null : Number(creditsHeader);
      logCall(opts.name, res.status, Number.isFinite(credits) ? credits : null, Date.now() - started);

      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        await sleep(Math.min(10, Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        if (hit) return { data: hit.value as T, cached: true, stale: true, storedAt: hit.storedAt, creditsUsed: credits };
        const reason = res.status === 401 || res.status === 403 ? "access denied" : res.status === 429 ? "rate limit reached" : res.status === 400 || res.status === 422 ? "request not supported" : "service temporarily unavailable";
        throw new NansenError(res.status, `Nansen ${opts.name}: ${reason}`);
      }
      const data = (await res.json()) as T;
      writeCache(key, data, opts.ttlMs);
      return { data, cached: false, stale: false, storedAt: Date.now(), creditsUsed: credits };
    }
  })();

  inflight.set(key, p as Promise<NansenResult<unknown>>);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/** Test helper. */
export function _resetClientState() {
  mem.clear();
  inflight.clear();
  tokens = RATE;
}
