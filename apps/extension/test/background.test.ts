import { describe, expect, it, vi } from "vitest";
import { toResult } from "../lib/api-result";
import { createBridge, createMessageListener } from "../lib/bridge";

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

  it("allows one sub-path, for the gated label lookup", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { labels: [] }));
    const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });
    await bridge.handle({ type: "api", method: "POST", path: "/api/wallet/labels", body: { address: "0x1" } });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:3000/api/wallet/labels", expect.anything());
    expect(await bridge.handle({ type: "api", method: "POST", path: "/api/a/b/c" })).toEqual({ ok: false, status: 400, json: { error: "bad path" } });
  });

  describe("tokenLogo", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const SOL = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
    const image = (type: string, bytes: Uint8Array = png) =>
      new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": type } });

    it("fetches the local proxy and hands the bytes back as a data URL", async () => {
      const fetchImpl = vi.fn(async () => image("image/jpeg"));
      const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });
      const result = await bridge.handle({ type: "tokenLogo", chain: "solana", address: SOL });
      expect(fetchImpl).toHaveBeenCalledWith(`http://127.0.0.1:3000/api/token-logo?chain=solana&address=${SOL}&v=2`, expect.anything());
      expect(result).toEqual({ ok: true, status: 200, json: { dataUrl: "data:image/jpeg;base64,iVBORw==" } });
    });

    it("refuses anything that is not an image, and anything oversized", async () => {
      const bridge = (res: Response) => createBridge({ fetchImpl: async () => res, getBackendUrl: () => "http://127.0.0.1:3000" });
      expect((await bridge(jsonResponse(404, { error: "no_logo" })).handle({ type: "tokenLogo", chain: "solana", address: SOL })).ok).toBe(false);
      expect((await bridge(image("text/html")).handle({ type: "tokenLogo", chain: "solana", address: SOL })).ok).toBe(false);
      const big = new Response(new ArrayBuffer(200 * 1024 + 1), { status: 200, headers: { "Content-Type": "image/png" } });
      expect((await bridge(big).handle({ type: "tokenLogo", chain: "solana", address: SOL })).ok).toBe(false);
    });

    it("never asks for a chain or an address that is not shaped like one", async () => {
      const fetchImpl = vi.fn();
      const bridge = createBridge({ fetchImpl, getBackendUrl: () => "http://127.0.0.1:3000" });
      expect(await bridge.handle({ type: "tokenLogo", chain: "../../etc", address: SOL })).toEqual({ ok: false, status: 400, json: { error: "bad token" } });
      expect(await bridge.handle({ type: "tokenLogo", chain: "solana", address: "?x=1" })).toEqual({ ok: false, status: 400, json: { error: "bad token" } });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
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

describe("createMessageListener", () => {
  const ok = { ok: true, status: 200, json: { ok: true } };

  it("answers via sendResponse and returns true (keeps the channel open) for our own extension", async () => {
    const handle = vi.fn(() => Promise.resolve(ok));
    const onResponse = vi.fn();
    const listener = createMessageListener({ handle, runtimeId: "ourid", onResponse });
    const sendResponse = vi.fn();

    const keepOpen = listener({ type: "health" }, { id: "ourid" }, sendResponse);

    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(ok));
    expect(onResponse).toHaveBeenCalledWith(ok);
  });

  it("ignores messages from another extension", () => {
    const handle = vi.fn(() => Promise.resolve(ok));
    const listener = createMessageListener({ handle, runtimeId: "ourid" });
    const sendResponse = vi.fn();

    expect(listener({ type: "health" }, { id: "otherextension" }, sendResponse)).toBe(false);
    expect(listener({ type: "health" }, {}, sendResponse)).toBe(false);
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("ignores non-bridge messages", () => {
    const handle = vi.fn(() => Promise.resolve(ok));
    const listener = createMessageListener({ handle, runtimeId: "ourid" });
    expect(listener({ type: "other" }, { id: "ourid" }, vi.fn())).toBe(false);
    expect(listener(null, { id: "ourid" }, vi.fn())).toBe(false);
    expect(handle).not.toHaveBeenCalled();
  });

  it("still answers (status 0) if the handler rejects", async () => {
    const listener = createMessageListener({ handle: () => Promise.reject(new Error("boom")), runtimeId: "ourid" });
    const sendResponse = vi.fn();
    listener({ type: "health" }, { id: "ourid" }, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: false, status: 0, json: { error: "bridge_failed" } }));
  });
});

describe("toResult", () => {
  it("maps an undefined response (no listener answered) to no_response", () => {
    expect(toResult(undefined)).toEqual({ ok: false, status: 0, error: "no_response" });
  });

  it("passes a successful bridge response through", () => {
    expect(toResult({ ok: true, status: 200, json: { a: 1 } })).toEqual({ ok: true, data: { a: 1 } });
  });
});
