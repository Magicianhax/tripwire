/**
 * Pure mapping from a background-bridge response to a typed `ApiResult`, split out of
 * `lib/api.ts` (which imports the extension runtime) so it is unit-testable in plain node.
 */
import type { BridgeResponse } from "./bridge";
import type { ApiErrorBody } from "./api-types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function errorMessage(json: unknown): string {
  const body = json as ApiErrorBody | null;
  if (body && typeof body === "object" && "error" in body) {
    if ((body.error === "nansen" || body.error === "budget" || body.error === "internal") && "message" in body) {
      return body.message;
    }
    return body.error;
  }
  return "unknown_error";
}

/** `response` is `undefined` when no listener answered (service worker asleep or crashed, or
 * the message was dropped) -- surfaced as a status-0 failure, never thrown. */
export function toResult<T>(response: BridgeResponse | undefined): ApiResult<T> {
  if (!response || typeof response !== "object") return { ok: false, status: 0, error: "no_response" };
  if (response.ok) return { ok: true, data: response.json as T };
  return { ok: false, status: response.status, error: errorMessage(response.json) };
}
