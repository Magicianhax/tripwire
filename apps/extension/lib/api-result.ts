/**
 * Pure mapping from a background-bridge response to a typed `ApiResult`, split out of
 * `lib/api.ts` (which imports the extension runtime) so it is unit-testable in plain node.
 */
import type { BridgeResponse } from "./bridge";
import type { ApiErrorBody } from "./api-types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** A zod issue's path as the reader sees it: `target.side`, `sections.0`. */
function issuePath(issue: unknown): string | null {
  const path = (issue as { path?: unknown })?.path;
  if (!Array.isArray(path) || path.length === 0) return null;
  return path.map(String).join(".");
}

/**
 * A wrong shape, rather than a wrong value: a key the backend's schema does not know, or a
 * field of the wrong type. That is what a content script running against a newer backend
 * produces, which is why this one sentence ends with what to do about it. A value the schema
 * knows and refuses (out of range, not in the enum) is not a mismatch and gets no such advice.
 */
function schemaMismatch(issues: unknown[]): boolean {
  return issues.some((issue) => {
    const code = (issue as { code?: unknown })?.code;
    return code === "unrecognized_keys" || code === "invalid_type";
  });
}

/**
 * The sentence the strip prints after "Tripwire couldn't check this: ".
 *
 * A 400 used to arrive as the bare words "invalid request", which named neither the field the
 * backend refused nor anything the reader could do. It now names the rejected paths (three at
 * most, they are a diagnosis and not a list) and, when the shape itself did not match, says to
 * reload the extension.
 */
function errorMessage(json: unknown): string {
  const body = json as ApiErrorBody | null;
  if (body && typeof body === "object" && "error" in body) {
    if ((body.error === "nansen" || body.error === "budget" || body.error === "internal") && "message" in body) {
      return body.message;
    }
    if (body.error === "invalid request" && Array.isArray(body.issues)) {
      const paths = [...new Set(body.issues.map(issuePath).filter((p): p is string => p !== null))].slice(0, 3);
      const named = paths.length > 0 ? `invalid request (${paths.join(", ")})` : "invalid request";
      return schemaMismatch(body.issues) ? `${named}. Reload the extension to match the backend.` : named;
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
