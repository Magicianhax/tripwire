/**
 * Typed wrappers around the background API bridge (lib/bridge.ts, wired up in
 * entrypoints/background.ts), for use from content scripts and the popup. Every call goes
 * through browser.runtime.sendMessage so it works from any extension context.
 */
import { browser } from "wxt/browser";
import type { Chain, SpotTarget, Target, Verdict } from "@tripwire/core";
import { toResult, type ApiResult } from "./api-result";
import type { BridgeResponse } from "./bridge";
import type {
  GuardResponse,
  HealthResponse,
  OverrideResponse,
  PersonIntelResponse,
  PostIntelResponse,
  ResolveResponse,
  RulesResponse,
} from "./api-types";

export type { ApiResult };

/** sendMessage resolves `undefined` when nothing answered, and rejects when no receiver exists
 * at all (e.g. the extension was reloaded under an open tab); both become a status-0 result. */
async function send(message: unknown): Promise<BridgeResponse | undefined> {
  try {
    return (await browser.runtime.sendMessage(message)) as BridgeResponse | undefined;
  } catch {
    return undefined;
  }
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ApiResult<T>> {
  return toResult<T>(await send({ type: "api", method, path, body }));
}

export async function health(): Promise<ApiResult<HealthResponse>> {
  return toResult<HealthResponse>(await send({ type: "health" }));
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
