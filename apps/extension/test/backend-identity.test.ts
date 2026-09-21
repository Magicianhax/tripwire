import { describe, expect, it, vi } from "vitest";
import { BACKEND_URL_RE, createInstallTokens, DEFAULT_BACKEND_URL, readBackendUrl, type Store } from "../lib/backend";
import { createBridge } from "../lib/bridge";

const memStore = (init: Record<string, unknown> = {}): Store & { data: Record<string, unknown> } => {
  const data = { ...init };
  return {
    data,
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, items),
  };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("backend URL", () => {
  it("defaults to the hosted backend and accepts only it or loopback", async () => {
    expect(DEFAULT_BACKEND_URL).toBe("https://tripwire.magician.wtf");
    expect(await readBackendUrl(memStore())).toBe(DEFAULT_BACKEND_URL);
    expect(await readBackendUrl(memStore({ backendUrl: "http://127.0.0.1:3229" }))).toBe("http://127.0.0.1:3229");
    // A stored URL that is neither would receive the install token and the user's key.
    expect(await readBackendUrl(memStore({ backendUrl: "https://evil.example" }))).toBe(DEFAULT_BACKEND_URL);
    expect(BACKEND_URL_RE.test("https://tripwire.magician.wtf.evil.example")).toBe(false);
  });
});

describe("install tokens", () => {
  it("mint once per backend, even when first calls race", async () => {
    const store = memStore();
    const fetchImpl = vi.fn(async () => json({ token: "t-1" }));
    const tokens = createInstallTokens(store, fetchImpl);
    const [a, b] = await Promise.all([tokens.get(DEFAULT_BACKEND_URL), tokens.get(DEFAULT_BACKEND_URL)]);
    expect([a, b]).toEqual(["t-1", "t-1"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await tokens.get(DEFAULT_BACKEND_URL)).toBe("t-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keep a hosted token away from a self-hosted backend", async () => {
    const store = memStore({ installTokens: { [DEFAULT_BACKEND_URL]: "hosted" } });
    const fetchImpl = vi.fn(async () => json({ token: "self" }));
    const tokens = createInstallTokens(store, fetchImpl);
    expect(await tokens.get("http://127.0.0.1:3000")).toBe("self");
    expect(await tokens.get(DEFAULT_BACKEND_URL)).toBe("hosted");
  });

  it("answer null, not a crash, when minting is refused", async () => {
    const tokens = createInstallTokens(memStore(), async () => json({ error: "mint_refused" }));
    expect(await tokens.get(DEFAULT_BACKEND_URL)).toBeNull();
  });
});

describe("bridge identity", () => {
  it("sends the headers it is given and re-mints once on an unknown install", async () => {
    let token = "stale";
    const calls: Headers[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      calls.push(h);
      return h.get("authorization") === "Bearer stale" ? json({ error: "install" }, 401) : json({ ok: true });
    });
    const onUnauthorized = vi.fn(async () => {
      token = "fresh";
    });
    const bridge = createBridge({
      fetchImpl,
      getBackendUrl: () => DEFAULT_BACKEND_URL,
      getHeaders: async () => ({ Authorization: `Bearer ${token}`, "X-Nansen-Key": "k" }),
      onUnauthorized,
    });
    const res = await bridge.handle({ type: "api", method: "GET", path: "/api/rules" });
    expect(res.ok).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls.map((h) => h.get("authorization"))).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(calls[1]!.get("x-nansen-key")).toBe("k");
  });

  it("does not loop when the fresh token is refused too", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "install" }, 401));
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => DEFAULT_BACKEND_URL, getHeaders: async () => ({}), onUnauthorized: async () => {} });
    const res = await bridge.handle({ type: "api", method: "GET", path: "/api/rules" });
    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
