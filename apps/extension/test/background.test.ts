import { describe, expect, it, vi } from "vitest";
import { createBridge } from "../lib/bridge";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createBridge", () => {
  it("rejects paths that are not a plain /api/<name> segment", async () => {
    const fetchImpl = vi.fn();
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });

    const traversal = await bridge.handle({ type: "api", method: "GET", path: "/api/../x" });
    expect(traversal).toEqual({ ok: false, status: 400, json: { error: "bad path" } });

    const absolute = await bridge.handle({ type: "api", method: "GET", path: "https://evil.example" });
    expect(absolute).toEqual({ ok: false, status: 400, json: { error: "bad path" } });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dedupes two concurrent identical POSTs into a single fetch", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });

    const p1 = bridge.handle({ type: "api", method: "POST", path: "/api/guard", body: { x: 1 } });
    const p2 = bridge.handle({ type: "api", method: "POST", path: "/api/guard", body: { x: 1 } });

    // getBackendUrl/fetchImpl are invoked past the first microtask tick inside the bridge;
    // wait for that rather than asserting synchronously.
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    resolveFetch(jsonResponse(200, { ok: true }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true, status: 200, json: { ok: true } });
    expect(r2).toEqual({ ok: true, status: 200, json: { ok: true } });
  });

  it("maps a network failure to status 0 backend_unreachable", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });

    const res = await bridge.handle({ type: "api", method: "GET", path: "/api/rules" });
    expect(res).toEqual({ ok: false, status: 0, json: { error: "backend_unreachable" } });
  });

  it("passes a health message through as GET /api/health", async () => {
    const fetchImpl = vi.fn((url: string, _init?: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:3000/api/health");
      return Promise.resolve(jsonResponse(200, { ok: true, keySource: "env", replay: false, creditsToday: 0, cap: 3000 }));
    });
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });

    const res = await bridge.handle({ type: "health" });
    expect(res).toEqual({ ok: true, status: 200, json: { ok: true, keySource: "env", replay: false, creditsToday: 0, cap: 3000 } });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("does not dedupe distinct paths or bodies", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(200, { ok: true })));
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });

    await Promise.all([
      bridge.handle({ type: "api", method: "POST", path: "/api/guard", body: { x: 1 } }),
      bridge.handle({ type: "api", method: "POST", path: "/api/guard", body: { x: 2 } }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
