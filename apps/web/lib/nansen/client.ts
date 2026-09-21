import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { requestContext } from "../request-context";
import { resolveApiKey } from "./key";

export const NANSEN_BASE = "https://api.nansen.ai/api/v1";

export const BUDGET_MESSAGE_GLOBAL = "Daily Nansen credit cap reached";
export const BUDGET_MESSAGE_INSTALL = "Daily Nansen allowance for this install used up";

/**
 * A spend ceiling was hit. Two scopes, because they ask different things of the user:
 *
 * - `install`: this install has used its own daily allowance. The user can keep going by
 *   supplying their own Nansen key, and the message says so.
 * - `global`: the backend's whole daily budget is gone. That is the operator's problem, not the
 *   user's, and there is nothing for them to do but wait, so it suggests nothing.
 *
 * Either way the verdict path is the one that already existed: stale cache if there is any,
 * otherwise UNCHECKED with a headline. Never a block, never CLEAR.
 */
export class BudgetExceeded extends Error {
  constructor(public scope: "install" | "global" = "global") {
    super(scope === "install" ? BUDGET_MESSAGE_INSTALL : BUDGET_MESSAGE_GLOBAL);
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

/**
 * Credits spent today on the backend's own key, which are the only credits either ceiling
 * counts. A call made with a key the user supplied spent their credits, not ours: it is logged
 * so the ledger stays a complete record, and excluded here.
 */
export function creditsToday(install?: string): number {
  const db = getDb();
  const row = (
    install === undefined
      ? db.prepare("SELECT COALESCE(SUM(credits),0) AS c FROM ledger WHERE ts >= ? AND byok = 0").get(dayStart())
      : db.prepare("SELECT COALESCE(SUM(credits),0) AS c FROM ledger WHERE ts >= ? AND byok = 0 AND install = ?").get(dayStart(), install)
  ) as { c: number };
  return row.c;
}

/**
 * Credits spent today by every install minted from the same network as `install`. An install with
 * no recorded network (self-hosted, or minted before networks were recorded) is counted alone.
 */
export function networkCreditsToday(install: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(l.credits),0) AS c FROM ledger l
       WHERE l.ts >= ? AND l.byok = 0 AND l.install IN (
         SELECT i.token FROM installs i
         WHERE i.ip_bucket IS NOT NULL AND i.ip_bucket = (SELECT ip_bucket FROM installs WHERE token = ?)
       )`,
    )
    .get(dayStart(), install) as { c: number };
  return row.c;
}

/**
 * One network's daily allowance, shared by every install minted from it: the bound that makes
 * minting cheap to allow. Twice the per-install allowance, so two people on one Wi-Fi each get a
 * full day, and no single address can spend more than 6000 of the 20000 global.
 */
export const networkCap = () => Number(process.env.NANSEN_PER_IP_DAILY_CREDITS ?? 6000);

/**
 * The backend's whole daily budget. `NANSEN_DAILY_CREDIT_CAP` is the pre-hosting name and stays
 * honoured, so a self-hoster's existing setting keeps meaning what it meant.
 */
export const globalCap = () => Number(process.env.NANSEN_GLOBAL_DAILY_CREDITS ?? process.env.NANSEN_DAILY_CREDIT_CAP ?? 3000);

/**
 * One install's daily allowance. Defaults to the same 3000 a self-hoster gets, so a hosted user
 * has the same experience as running it locally; the global ceiling is the real brake.
 */
export const installCap = () => Number(process.env.NANSEN_PER_INSTALL_DAILY_CREDITS ?? 3000);

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

function logCall(endpoint: string, status: number, credits: number | null, latency: number, install: string, byok: boolean) {
  getDb()
    .prepare("INSERT INTO ledger (ts, endpoint, status, credits, latency_ms, install, byok) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(Date.now(), endpoint, status, credits, latency, install, byok ? 1 : 0);
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

  const { install, userKey } = requestContext();
  // Concurrent identical calls share one fetch, but only within the same kind of key: a call on a
  // user's own key must not hand its failure ("your Nansen key was rejected") to a stranger, and
  // costs nothing extra to keep separate.
  const flightKey = userKey ? `byok|${key}` : key;
  const pending = inflight.get(flightKey);
  // Joining a fetch someone else already paid for is free, so it happens before any budget check.
  if (pending) return pending as Promise<NansenResult<T>>;

  // The budget is checked here, for this caller, and never inside the shared promise below:
  // otherwise an over-limit user who happened to start a fetch would pass "daily limit reached"
  // to everyone who joined it in the same instant. A user's own key spends their credits, not
  // ours, so neither ceiling applies to it.
  if (!userKey) {
    const over =
      creditsToday() >= globalCap()
        ? "global"
        : creditsToday(install) >= installCap() || networkCreditsToday(install) >= networkCap()
          ? "install"
          : null;
    if (over) {
      if (hit) return { data: hit.value as T, cached: true, stale: true, storedAt: hit.storedAt, creditsUsed: null };
      throw new BudgetExceeded(over);
    }
  }

  const p = (async (): Promise<NansenResult<T>> => {
    const apiKey = userKey ?? resolveApiKey().key;
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
      logCall(opts.name, res.status, Number.isFinite(credits) ? credits : null, Date.now() - started, install, userKey !== null);

      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        await sleep(Math.min(10, Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        if (hit) return { data: hit.value as T, cached: true, stale: true, storedAt: hit.storedAt, creditsUsed: credits };
        // A rejected user key is theirs to fix, and "access denied" alone would read as our
        // outage, so say whose key it was.
        const denied = res.status === 401 || res.status === 403;
        const reason = denied && userKey ? "your Nansen key was rejected" : denied ? "access denied" : res.status === 429 ? "rate limit reached" : res.status === 400 || res.status === 422 ? "request not supported" : "service temporarily unavailable";
        throw new NansenError(res.status, `Nansen ${opts.name}: ${reason}`);
      }
      const data = (await res.json()) as T;
      writeCache(key, data, opts.ttlMs);
      return { data, cached: false, stale: false, storedAt: Date.now(), creditsUsed: credits };
    }
  })();

  inflight.set(flightKey, p as Promise<NansenResult<unknown>>);
  try {
    return await p;
  } finally {
    inflight.delete(flightKey);
  }
}

/** Test helper. */
export function _resetClientState() {
  mem.clear();
  inflight.clear();
  tokens = RATE;
}
