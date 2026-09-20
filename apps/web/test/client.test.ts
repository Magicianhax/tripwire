import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { BudgetExceeded, _resetClientState, creditsToday, nansenPost } from "@/lib/nansen/client";

let dir: string;
const call = (body: unknown = { a: 1 }) => nansenPost<{ ok: number }>({ name: "flowIntel", path: "tgm/flow-intelligence", body, ttlMs: 60_000 });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = (credits = 1) => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "x-nansen-credits-used": String(credits) } });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-"));
  process.env.TRIPWIRE_DB = path.join(dir, "t.db");
  process.env.NANSEN_API_KEY = "test-key";
  process.env.NANSEN_DAILY_CREDIT_CAP = "100";
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
  _resetClientState();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetDb();
});

describe("nansenPost", () => {
  it("sends apikey header and caches the second call", async () => {
    const f = mockFetch(ok());
    const a = await call();
    const b = await call();
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ apikey: "test-key" });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
  });

  it("cache key ignores property order", async () => {
    const f = mockFetch(ok());
    await call({ a: 1, b: 2 });
    await call({ b: 2, a: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent identical calls", async () => {
    const f = mockFetch(ok());
    await Promise.all([call(), call(), call()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries once after 429", async () => {
    const f = mockFetch(new Response("slow down", { status: 429, headers: { "retry-after": "0" } }), ok());
    const r = await call();
    expect(r.data.ok).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("records credits in the ledger and enforces the daily cap", async () => {
    process.env.NANSEN_DAILY_CREDIT_CAP = "5";
    mockFetch(ok(5));
    await call({ n: 1 });
    expect(creditsToday()).toBe(5);
    await expect(call({ n: 2 })).rejects.toBeInstanceOf(BudgetExceeded);
  });

  it("throws NansenError without leaking the key", async () => {
    mockFetch(new Response("bad", { status: 500 }));
    await expect(call()).rejects.toThrow(/service temporarily unavailable/);
    await call().catch((e: Error) => expect(e.message).not.toContain("test-key"));
  });

  it("replay mode reads fixtures and never fetches", async () => {
    process.env.TRIPWIRE_REPLAY = "1";
    process.env.TRIPWIRE_FIXTURES = dir;
    fs.writeFileSync(path.join(dir, "flowIntel.json"), JSON.stringify({ ok: 7 }));
    const f = mockFetch();
    const r = await call();
    expect(r.data.ok).toBe(7);
    expect(f).not.toHaveBeenCalled();
  });
});
