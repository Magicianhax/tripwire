/**
 * Message handling extracted from entrypoints/background.ts so it is testable without a
 * browser: createBridge takes injectable fetch + backend-url lookup and returns a plain
 * `handle(message)` function. entrypoints/background.ts wires this to
 * browser.runtime.onMessage with the real fetch and browser.storage.local.
 */

export type ApiMessage = {
  type: "api";
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
};

export type HealthMessage = { type: "health" };

export type BridgeMessage = ApiMessage | HealthMessage;

export type BridgeResponse = { ok: boolean; status: number; json: unknown };

export type BridgeDeps = {
  /** Injectable fetch (real `fetch` in the background entrypoint, a mock in tests). */
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  /** Reads the configured backend URL (falls back to http://127.0.0.1:3000 upstream). */
  getBackendUrl: () => string | Promise<string>;
};

const PATH_RE = /^\/api\/[a-z-]+$/;
const TIMEOUT_MS = 25_000;

export function createBridge({ fetchImpl, getBackendUrl }: BridgeDeps): { handle(message: BridgeMessage): Promise<BridgeResponse> } {
  const inFlight = new Map<string, Promise<BridgeResponse>>();

  async function doFetch(method: string, path: string, body: unknown | undefined): Promise<BridgeResponse> {
    let res: Response;
    try {
      const backendUrl = await getBackendUrl();
      res = await fetchImpl(`${backendUrl}${path}`, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 0, json: { error: "backend_unreachable" } };
    }
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  function dedupedFetch(method: string, path: string, body: unknown | undefined): Promise<BridgeResponse> {
    const key = `${method} ${path} ${body !== undefined ? JSON.stringify(body) : ""}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = doFetch(method, path, body).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  async function handle(message: BridgeMessage): Promise<BridgeResponse> {
    if (message.type === "health") {
      return dedupedFetch("GET", "/api/health", undefined);
    }
    const { method, path, body } = message;
    if (!PATH_RE.test(path)) {
      return { ok: false, status: 400, json: { error: "bad path" } };
    }
    return dedupedFetch(method, path, body);
  }

  return { handle };
}
