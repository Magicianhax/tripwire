/**
 * Message handling extracted from entrypoints/background.ts so it is testable without a
 * browser: createBridge takes injectable fetch + backend-url lookup and returns a plain
 * `handle(message)` function. entrypoints/background.ts wires this to
 * browser.runtime.onMessage with the real fetch and browser.storage.local.
 */

export type ApiMessage = {
  type: "api";
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
};

export type HealthMessage = { type: "health" };

/**
 * A token's logo, fetched by the background and handed back as a data URL.
 *
 * The obvious implementation — point the card's `<img>` straight at
 * `http://127.0.0.1:3000/api/token-logo?…` — does not work from a content script. Chrome's
 * Private Network Access rules refuse a request from an https page into the loopback address
 * space ("Permission was denied for this request to access the `loopback` address space"), so
 * every card logged a CORS failure and fell back to the monogram. The background service worker
 * has the host permission and is not subject to that rule, so it does the fetch and the picture
 * arrives as bytes the page never requested from anywhere.
 */
export type TokenLogoMessage = { type: "tokenLogo"; chain: string; address: string };

export type BridgeMessage = ApiMessage | HealthMessage | TokenLogoMessage;

export type BridgeResponse = { ok: boolean; status: number; json: unknown };

export type BridgeDeps = {
  /** Injectable fetch (real `fetch` in the background entrypoint, a mock in tests). */
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  /** Reads the configured backend URL (falls back to http://127.0.0.1:3000 upstream). */
  getBackendUrl: () => string | Promise<string>;
};

/** One optional sub-path, for `/api/wallet/labels`; still nothing but lowercase and hyphens. */
const PATH_RE = /^\/api\/[a-z-]+(\/[a-z-]+)?$/;
const TIMEOUT_MS = 25_000;
/** Matches the backend's own cap (apps/web/lib/token-logo.ts). */
const MAX_LOGO_BYTES = 200 * 1024;

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

  /** The proxied logo as a data URL. Bounded by the same 200KB the backend enforces. */
  async function tokenLogo(chain: string, address: string): Promise<BridgeResponse> {
    if (!/^[a-z]{2,20}$/.test(chain) || !/^[A-Za-z0-9]{32,64}$/.test(address)) {
      return { ok: false, status: 400, json: { error: "bad token" } };
    }
    try {
      const backendUrl = await getBackendUrl();
      const res = await fetchImpl(`${backendUrl}/api/token-logo?chain=${chain}&address=${address}&v=2`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) return { ok: false, status: res.status, json: null };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, status: 502, json: null };
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { ok: true, status: 200, json: { dataUrl: `data:${type.split(";")[0]};base64,${btoa(binary)}` } };
    } catch {
      return { ok: false, status: 0, json: { error: "backend_unreachable" } };
    }
  }

  async function handle(message: BridgeMessage): Promise<BridgeResponse> {
    if (message.type === "health") {
      return dedupedFetch("GET", "/api/health", undefined);
    }
    if (message.type === "tokenLogo") {
      return tokenLogo(message.chain, message.address);
    }
    const { method, path, body } = message;
    if (!PATH_RE.test(path)) {
      return { ok: false, status: 400, json: { error: "bad path" } };
    }
    return dedupedFetch(method, path, body);
  }

  return { handle };
}

export function isBridgeMessage(message: unknown): message is BridgeMessage {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  return type === "api" || type === "health" || type === "tokenLogo";
}

export type MessageListenerDeps = {
  handle: (message: BridgeMessage) => Promise<BridgeResponse>;
  /** `browser.runtime.id`: only messages from this extension's own contexts are answered. */
  runtimeId: string;
  onResponse?: (response: BridgeResponse) => void;
};

/**
 * The `runtime.onMessage` listener. Chrome's native API ignores a returned Promise (only the
 * webextension polyfill honours it), so this answers through `sendResponse` and returns `true`
 * to keep the channel open. Returns `false` (no answer) for anything that isn't a bridge
 * message from this very extension.
 */
export function createMessageListener({ handle, runtimeId, onResponse }: MessageListenerDeps) {
  return (message: unknown, sender: { id?: string }, sendResponse: (response: BridgeResponse) => void): boolean => {
    if (!sender || sender.id !== runtimeId) return false;
    if (!isBridgeMessage(message)) return false;
    handle(message)
      .catch((): BridgeResponse => ({ ok: false, status: 0, json: { error: "bridge_failed" } }))
      .then((response) => {
        onResponse?.(response);
        sendResponse(response);
      });
    return true;
  };
}
