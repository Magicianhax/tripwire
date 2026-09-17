import { describe, expect, it, vi } from "vitest";
import { createResultCache } from "../lib/x/cache";

type Result = { ok: boolean; value?: string };

describe("createResultCache", () => {
  it("shares one load between concurrent gets for the same key", () => {
    const cache = createResultCache<string, Result>();
    const load = vi.fn(() => Promise.resolve<Result>({ ok: true, value: "a" }));

    const p1 = cache.get("k", load);
    const p2 = cache.get("k", load);

    expect(p1).toBe(p2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps an ok:true result cached for later gets (no reload)", async () => {
    const cache = createResultCache<string, Result>();
    const load = vi.fn(() => Promise.resolve<Result>({ ok: true, value: "a" }));

    const first = await cache.get("k", load);
    const second = await cache.get("k", load);

    expect(first).toEqual({ ok: true, value: "a" });
    expect(second).toEqual({ ok: true, value: "a" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts an ok:false result so a later get reloads", async () => {
    const cache = createResultCache<string, Result>();
    let calls = 0;
    const load = vi.fn(() => {
      calls++;
      return Promise.resolve<Result>(calls === 1 ? { ok: false } : { ok: true, value: "retry" });
    });

    const first = await cache.get("k", load);
    expect(first).toEqual({ ok: false });
    expect(load).toHaveBeenCalledTimes(1);

    const second = await cache.get("k", load);
    expect(second).toEqual({ ok: true, value: "retry" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts a rejected load so a later get reloads", async () => {
    const cache = createResultCache<string, Result>();
    let calls = 0;
    const load = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("boom"));
      return Promise.resolve<Result>({ ok: true, value: "recovered" });
    });

    await expect(cache.get("k", load)).rejects.toThrow("boom");
    expect(load).toHaveBeenCalledTimes(1);

    const second = await cache.get("k", load);
    expect(second).toEqual({ ok: true, value: "recovered" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps distinct keys independent", async () => {
    const cache = createResultCache<string, Result>();
    const loadA = vi.fn(() => Promise.resolve<Result>({ ok: true, value: "a" }));
    const loadB = vi.fn(() => Promise.resolve<Result>({ ok: false }));

    await cache.get("a", loadA);
    await cache.get("b", loadB);
    await cache.get("a", loadA);
    await cache.get("b", loadB); // b was evicted (ok:false), so this reloads

    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(2);
  });

  it("drop() forgets a cached success, so the next get reloads it (a wallet link changed)", async () => {
    const cache = createResultCache<string, Result>();
    const load = vi.fn(() => Promise.resolve<Result>({ ok: true, value: "a" }));

    await cache.get("a", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(1);

    cache.drop("a");
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
