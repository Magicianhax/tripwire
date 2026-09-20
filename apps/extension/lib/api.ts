/**
 * Typed wrappers around the background API bridge (lib/bridge.ts, wired up in
 * entrypoints/background.ts), for use from content scripts and the popup. Every call goes
 * through browser.runtime.sendMessage so it works from any extension context.
 */
import { browser } from "wxt/browser";
import type { Chain, DepthSection, SpotTarget, Target, Verdict, ViewTimeframe } from "@tripwire/core";
import { toResult, type ApiResult } from "./api-result";
import type { BridgeResponse } from "./bridge";
import type {
  AuthorBadgesResponse,
  MarketCatalog,
  DepthResponse,
  GuardResponse,
  LinkResponse,
  UnlinkResponse,
  WalletVenueId,
  HealthResponse,
  OverrideResponse,
  PersonIntelResponse,
  PostIntelResponse,
  ResolveResponse,
  RulesResponse,
  WalletDefiResponse,
  WalletLabelsResponse,
  WalletLensResponse,
  WalletUnrealizedResponse,
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

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<ApiResult<T>> {
  return toResult<T>(await send({ type: "api", method, path, body }));
}

export async function health(): Promise<ApiResult<HealthResponse>> {
  return toResult<HealthResponse>(await send({ type: "health" }));
}

export function resolve(symbol: string, chainHint?: Chain): Promise<ApiResult<ResolveResponse>> {
  return call("POST", "/api/resolve", chainHint ? { symbol, chainHint } : { symbol });
}

export function markets(symbol: string): Promise<ApiResult<MarketCatalog>> {
  return call("POST", "/api/markets", { symbol });
}

/** Resolve a Dexscreener pool to its exact base token through the local backend. */
export function resolvePair(chain: Chain, pairAddress: string): Promise<ApiResult<{ target: SpotTarget | null }>> {
  return call("POST", "/api/resolve-pair", { chain, pairAddress });
}

export function postIntel(
  target: SpotTarget,
  postTimeIso?: string,
  mode: "chip" | "panel" = "chip",
  timeframe?: ViewTimeframe,
): Promise<ApiResult<PostIntelResponse>> {
  return call("POST", "/api/post-intel", { target, postTimeIso, mode, timeframe });
}

export function guard(target: Target, venue: string, mode: "chip" | "panel" = "chip", timeframe?: ViewTimeframe): Promise<ApiResult<GuardResponse>> {
  return call("POST", "/api/guard", { target, venue, mode, timeframe });
}

/**
 * The card's lazy sections. Called by a tab, never on a card open: `sections` is exactly what
 * the tab about to be drawn needs, and the paid ones (perp traders, spot holders) only ever get
 * here because somebody opened that tab or expanded the card.
 */
export function depth(target: Target, sections: DepthSection[], timeframe?: ViewTimeframe): Promise<ApiResult<DepthResponse>> {
  return call("POST", "/api/depth", timeframe ? { target, sections, timeframe } : { target, sections });
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

export function authorBadges(handle: string, displayName: string): Promise<ApiResult<AuthorBadgesResponse>> {
  return call("POST", "/api/author-badges", { handle, displayName });
}

export function linkWallet(handle: string, venue: WalletVenueId, address: string): Promise<ApiResult<LinkResponse>> {
  return call("PUT", "/api/links", { handle, venue, address });
}

export function unlinkWallet(handle: string, venue: WalletVenueId): Promise<ApiResult<UnlinkResponse>> {
  return call("DELETE", "/api/links", { handle, venue });
}

/** The wallet lens: everything Tripwire knows about one wallet somebody shared. */
export function walletLens(query: string, chainHint?: Chain): Promise<ApiResult<WalletLensResponse>> {
  return call("POST", "/api/wallet", chainHint ? { query, chainHint } : { query });
}

/** The 100-credit Nansen label lookup. Only the card's own button, which states the price,
 * calls this; the backend refuses unless NANSEN_ALLOW_PREMIUM=1. */
export function walletLabels(address: string): Promise<ApiResult<WalletLabelsResponse>> {
  return call("POST", "/api/wallet/labels", { address });
}

/**
 * The wallet card's lazy views (Round 1.5.6 + 1.5.1, and 1.5.7). 2 credits and 1 credit.
 *
 * Reached only from a button on the open card that states the price — never from a card open
 * and never from switching views, because the view switcher is arrow-key navigable and a
 * spend per keypress is the same trap as a spend per hover.
 */
export function walletDefi(address: string, chain?: string | null): Promise<ApiResult<WalletDefiResponse>> {
  return call("POST", "/api/wallet/defi", chain ? { address, chain } : { address });
}

export function walletUnrealized(address: string): Promise<ApiResult<WalletUnrealizedResponse>> {
  return call("POST", "/api/wallet/unrealized", { address });
}
