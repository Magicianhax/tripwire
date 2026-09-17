/**
 * Typed wrappers around the background API bridge (lib/bridge.ts, wired up in
 * entrypoints/background.ts), for use from content scripts and the popup. Every call goes
 * through browser.runtime.sendMessage so it works from any extension context.
 */
import { browser } from "wxt/browser";
import type { Chain, SpotTarget, Target, Verdict } from "@tripwire/core";
import type { BridgeResponse } from "./bridge";
import type {
  ApiErrorBody,
  GuardResponse,
  HealthResponse,
  OverrideResponse,
  PersonIntelResponse,
  PostIntelResponse,
  ResolveResponse,
  RulesResponse,
} from "./api-types";

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

function toResult<T>(response: BridgeResponse): ApiResult<T> {
  if (response.ok) return { ok: true, data: response.json as T };
  return { ok: false, status: response.status, error: errorMessage(response.json) };
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ApiResult<T>> {
  const response = (await browser.runtime.sendMessage({ type: "api", method, path, body })) as BridgeResponse;
  return toResult<T>(response);
}

export async function health(): Promise<ApiResult<HealthResponse>> {
  const response = (await browser.runtime.sendMessage({ type: "health" })) as BridgeResponse;
  return toResult<HealthResponse>(response);
}

export function resolve(symbol: string, chainHint?: Chain): Promise<ApiResult<ResolveResponse>> {
  return call("POST", "/api/resolve", chainHint ? { symbol, chainHint } : { symbol });
}

export function postIntel(
  target: SpotTarget,
  postTimeIso?: string,
  mode: "chip" | "panel" = "chip",
): Promise<ApiResult<PostIntelResponse>> {
  return call("POST", "/api/post-intel", { target, postTimeIso, mode });
}

export function guard(target: Target, venue: string, mode: "chip" | "panel" = "chip"): Promise<ApiResult<GuardResponse>> {
  return call("POST", "/api/guard", { target, venue, mode });
}

export function personIntel(handle: string, displayName: string, target?: SpotTarget): Promise<ApiResult<PersonIntelResponse>> {
  return call("POST", "/api/person-intel", { handle, displayName, target });
}

export function getRules(): Promise<ApiResult<RulesResponse>> {
  return call("GET", "/api/rules");
}

export function setPreset(preset: "degen" | "balanced" | "paranoid"): Promise<ApiResult<RulesResponse>> {
  return call("PUT", "/api/rules", { preset });
}

export function override(target: Target, verdict: Verdict, ruleIds: string[], venue: string): Promise<ApiResult<OverrideResponse>> {
  return call("POST", "/api/override", { target, verdict, ruleIds, venue });
}
