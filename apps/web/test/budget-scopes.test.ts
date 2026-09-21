import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { uncheckedHeadline } from "@/lib/headline";
import { BudgetExceeded, _resetClientState, creditsToday, nansenPost } from "@/lib/nansen/client";
import { withRequestContext } from "@/lib/request-context";

const call = (body: unknown) => nansenPost<{ ok: number }>({ name: "flowIntel", path: "tgm/flow-intelligence", body, ttlMs: 60_000 });
const as = <T>(install: string, userKey: string | null, fn: () => Promise<T>) => withRequestContext({ install, userKey }, fn);
const ok = (credits: number) => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "x-nansen-credits-used": String(credits) } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-budget-")), "t.db");
  process.env.NANSEN_API_KEY = "operator-key";
  process.env.NANSEN_PER_INSTALL_DAILY_CREDITS = "5";
  process.env.NANSEN_GLOBAL_DAILY_CREDITS = "12";
  delete process.env.NANSEN_DAILY_CREDIT_CAP;
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
  _resetClientState();
  fetchMock = vi.fn(async () => ok(5));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetDb();
  delete process.env.NANSEN_PER_INSTALL_DAILY_CREDITS;
  delete process.env.NANSEN_GLOBAL_DAILY_CREDITS;
});

describe("per-install and global ceilings", () => {
  it("stops one install at its own allowance without touching anyone else's", async () => {
    await as("a", null, () => call({ n: 1 }));
    await expect(as("a", null, () => call({ n: 2 }))).rejects.toMatchObject({ scope: "install" });
    await expect(as("b", null, () => call({ n: 3 }))).resolves.toMatchObject({ cached: false });
    expect(creditsToday("a")).toBe(5);
    expect(creditsToday("b")).toBe(5);
  });

  it("stops everyone once the backend's whole day is spent", async () => {
    await as("a", null, () => call({ n: 1 }));
    await as("b", null, () => call({ n: 2 }));
    await as("c", null, () => call({ n: 3 })); // 15 >= 12
    const err = await as("d", null, () => call({ n: 4 })).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExceeded);
    expect(err.scope).toBe("global");
  });

  it("still serves anyone a cached answer, over the limit or not: the shared cache is free", async () => {
    await as("a", null, () => call({ n: 1 }));
    const again = await as("a", null, () => call({ n: 1 }));
    expect(again.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const other = await as("z", null, () => call({ n: 1 }));
    expect(other.cached).toBe(true);
  });

  it("never lends one caller's limit error to another caller joining the same fetch", async () => {
    await as("a", null, () => call({ n: 1 })); // a is now at its limit
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    const b = as("b", null, () => call({ n: 9 })); // b starts the fetch
    const a = as("a", null, () => call({ n: 9 })); // a joins it: free, so allowed
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release(ok(5));
    await expect(b).resolves.toMatchObject({ cached: false });
    await expect(a).resolves.toMatchObject({ cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("the per-network allowance", () => {
  it("is shared by every install minted from one network, and not by others", async () => {
    process.env.TRIPWIRE_HOSTED = "1";
    process.env.TRIPWIRE_IP_SALT = "salt";
    process.env.NANSEN_PER_INSTALL_DAILY_CREDITS = "100";
    process.env.NANSEN_PER_IP_DAILY_CREDITS = "10";
    process.env.NANSEN_GLOBAL_DAILY_CREDITS = "1000";
    const { mintInstall } = await import("@/lib/install");
    const a = mintInstall("5.5.5.5");
    const b = mintInstall("5.5.5.5");
    const c = mintInstall("6.6.6.6");
    await as(a, null, () => call({ n: 1 }));
    await as(b, null, () => call({ n: 2 })); // network now at 10
    await expect(as(b, null, () => call({ n: 3 }))).rejects.toMatchObject({ scope: "install" });
    await expect(as(a, null, () => call({ n: 4 }))).rejects.toMatchObject({ scope: "install" });
    await expect(as(c, null, () => call({ n: 5 }))).resolves.toMatchObject({ cached: false });
    delete process.env.TRIPWIRE_HOSTED;
    delete process.env.NANSEN_PER_IP_DAILY_CREDITS;
  });
});

describe("a user's own key", () => {
  it("lifts both ceilings, spends their key, and is not counted against ours", async () => {
    await as("a", null, () => call({ n: 1 }));
    await as("a", "users-own-key", () => call({ n: 2 }));
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect((init.headers as Record<string, string>).apikey).toBe("users-own-key");
    expect(creditsToday("a")).toBe(5);
  });

  it("is never written to the ledger or the cache", async () => {
    await as("a", "users-own-key", () => call({ n: 1 }));
    const { getDb } = await import("@/lib/db");
    const dump = JSON.stringify([getDb().prepare("SELECT * FROM ledger").all(), getDb().prepare("SELECT * FROM cache").all()]);
    expect(dump).not.toContain("users-own-key");
  });

  it("names whose key was rejected", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(as("a", "bad-key", () => call({ n: 1 }))).rejects.toThrow(/your Nansen key was rejected/);
  });
});

describe("headlines", () => {
  it("distinguish an install's limit from the backend's", () => {
    expect(uncheckedHeadline("UNCHECKED", [new BudgetExceeded("install").message])).toBe("Daily limit reached");
    expect(uncheckedHeadline("UNCHECKED", [new BudgetExceeded("global").message])).toBe("Nansen credit cap reached");
  });
});
