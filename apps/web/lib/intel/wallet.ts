import { classify, cleanLabel, isEvmAddress, nansenWalletUrl, type Chain, type LabelKind } from "@tripwire/core";
import { isReplay, PremiumDisabled } from "../nansen/client";
import { nansen, WALLET_PNL_WINDOW_DAYS, type AddressBalanceRow } from "../nansen/endpoints";
import { replayResolution, resolveEns, resolveSns } from "../wallet/names";
import { hyperliquidProfile, polymarketProfile, type HyperliquidBadge, type PolymarketBadge } from "./badges";
import { settle } from "./util";

/**
 * The wallet lens: everything Tripwire knows about one wallet somebody shared.
 *
 * Shape of the work: resolve the string to an address, then gather each block in parallel and
 * let every one of them fail on its own. A wallet with no Polymarket record and a Nansen call
 * that timed out still shows its holdings; nothing here ever throws past a single block.
 *
 * Cost, measured: `profiler/address/current-balance` and `profiler/address/pnl-summary` are 1
 * credit each, the three `prediction-market/*` calls are 1 credit each, Hyperliquid's public
 * info API and `search/general` are free. So 2 credits for a Solana wallet and 5 for an EVM
 * one, per address per cache window. `profiler/labels` (100 credits) is not in this path at
 * all — see `walletLabels`.
 */

export const HOLDINGS_SHOWN = 20;

export type WalletHolding = {
  symbol: string;
  name: string | null;
  chain: string;
  tokenAddress: string;
  amount: number | null;
  valueUsd: number;
};

export type WalletLabel = { text: string; kind: LabelKind; tags: string[] };

export type WalletPortfolio = {
  totalUsd: number;
  holdings: WalletHolding[];
  /** Every chain the wallet holds value on, most valuable first. */
  chains: string[];
  tokenCount: number;
  chainHoldings: { chain: string; valueUsd: number }[];
  holdingsTruncated: boolean;
};

export type WalletPnl = {
  realizedPnlUsd: number | null;
  realizedPnlPercent: number | null;
  winRate: number | null;
  tradeCount: number | null;
  tokenCount: number | null;
  windowDays: number;
  topPnlTokens: { symbol: string; chain: string; tokenAddress: string; realizedPnlUsd: number | null }[];
};

export type WalletLens = {
  /** Exactly what the user clicked, so the card can say "vitalik.eth" and not just an address. */
  input: string;
  /** Replay fixtures are demonstration data, not holdings belonging to the requested address. */
  sampleData: boolean;
  resolved: boolean;
  address: string | null;
  chainGuess: Chain | null;
  /** The name the address was resolved from, and which source answered. */
  name: { value: string; source: string } | null;
  label: WalletLabel | null;
  portfolio: WalletPortfolio | null;
  pnl: WalletPnl | null;
  hyperliquid: Omit<HyperliquidBadge, "link"> | null;
  polymarket: Omit<PolymarketBadge, "link"> | null;
  nansenUrl: string | null;
  /** Free sources that answered, named for the card's footer. */
  sources: string[];
  /** Nansen credits this response was worth at full price (cache hits still report it). */
  credits: number;
  /** Set when nothing could be resolved: the one sentence to show instead of the card body. */
  message: string | null;
  errors: string[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const unresolved = (input: string, message: string): WalletLens => ({
  input,
  sampleData: isReplay(),
  resolved: false,
  address: null,
  chainGuess: null,
  name: null,
  label: null,
  portfolio: null,
  pnl: null,
  hyperliquid: null,
  polymarket: null,
  nansenUrl: null,
  sources: [],
  credits: 0,
  message,
  errors: [],
});

type Resolution = { address: string; kind: "evm" | "solana"; name: { value: string; source: string } | null };

/** Turn whatever the user clicked into an address, or explain why it can't be one. */
export async function resolveWalletQuery(query: string): Promise<Resolution | { error: string }> {
  const ref = classify(query.trim());
  if (!ref) return { error: `"${query}" is not an address or an ENS name.` };
  if (ref.kind === "evm" || ref.kind === "solana") return { address: ref.query, kind: ref.kind, name: null };
  if (ref.kind === "sns") return { error: resolveSns(ref.query).message! };

  const resolution = replayResolution() ?? (await resolveEns(ref.query));
  if (!resolution.address) return { error: resolution.message ?? `${ref.query} could not be resolved.` };
  return { address: resolution.address, kind: "evm", name: { value: ref.query, source: resolution.source ?? "ens" } };
}

/** Chain ids Nansen returns that Tripwire has a logo and a slug for. */
const isKnownChain = (chain: string): chain is Chain =>
  (["solana", "ethereum", "base", "arbitrum", "bnb", "polygon", "optimism", "avalanche"] as string[]).includes(chain);

function portfolioOf(rows: AddressBalanceRow[], truncated: boolean): WalletPortfolio {
  const held = rows.filter((r) => (r.value_usd ?? 0) > 0).sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0));
  const byChain = new Map<string, number>();
  for (const r of held) byChain.set(r.chain, (byChain.get(r.chain) ?? 0) + (r.value_usd ?? 0));
  return {
    totalUsd: held.reduce((s, r) => s + (r.value_usd ?? 0), 0),
    tokenCount: held.length,
    chainHoldings: [...byChain].map(([chain, valueUsd]) => ({ chain, valueUsd })).sort((a, b) => b.valueUsd - a.valueUsd),
    holdingsTruncated: truncated,
    chains: [...byChain.entries()].sort((a, b) => b[1] - a[1]).map(([chain]) => chain),
    holdings: held.slice(0, HOLDINGS_SHOWN).map((r) => ({
      symbol: r.token_symbol,
      name: r.token_name ?? null,
      chain: r.chain,
      tokenAddress: r.token_address,
      amount: num(r.token_amount),
      valueUsd: r.value_usd ?? 0,
    })),
  };
}

/**
 * `search/general` on the address. Free, and usually empty: Nansen's search indexes entity
 * names and tokens, not raw addresses (measured — `total_results: 0` for the fixture wallet).
 * A named search result is usable only if it also identifies the exact requested address.
 * A name-only entity match is not proof of wallet ownership. The paid label source costs
 * 100 credits and is deliberately outside this path.
 */
export function walletLabelOf(address: string, entities: { name: string; tags: string[]; address?: string }[] | undefined): WalletLabel | null {
  const match = entities?.find((entity) => entity.address && (isEvmAddress(address) ? entity.address.toLowerCase() === address.toLowerCase() : entity.address === address));
  if (!match) return null;
  const clean = cleanLabel(match.name);
  return { text: clean.text || match.name, kind: clean.kind, tags: match.tags ?? [] };
}

export async function buildWalletLens(input: { query: string; chainHint?: Chain }): Promise<WalletLens> {
  const resolution = await resolveWalletQuery(input.query);
  if ("error" in resolution) return unresolved(input.query, resolution.error);

  const { address, kind, name } = resolution;
  const evm = kind === "evm";

  const [balances, pnl, search, hl, pm] = await Promise.all([
    settle(nansen.addressBalances(address), (d) => d),
    settle(nansen.addressPnlSummary(address), (d) => d),
    settle(nansen.searchGeneral(address, "any", 5), (d) => d),
    // Hyperliquid's own public API only: free, and the account is EVM-keyed.
    evm ? attempt(() => hyperliquidProfile(address, { nansenPerp: false })) : Promise.resolve({ value: null, error: null }),
    evm ? attempt(() => polymarketProfile(address)) : Promise.resolve({ value: null, error: null }),
  ]);

  const rows = balances.value?.data ?? [];
  const portfolio = balances.value ? portfolioOf(rows, balances.value.pagination?.is_last_page === false || (balances.value.pagination === undefined && rows.length >= 200)) : null;
  const chainGuess: Chain | null =
    kind === "solana"
      ? "solana"
      : (input.chainHint ?? (portfolio?.chains.find(isKnownChain) as Chain | undefined) ?? (isEvmAddress(address) ? "ethereum" : null));

  // A block whose every call failed is not an empty account, it is an unanswered question:
  // drop it so its tab is hidden, and carry its reasons up to the card's error list.
  const hyperliquid = hasHyperliquidData(hl.value) ? hl.value : null;
  const polymarket = hasPolymarketData(pm.value) ? pm.value : null;

  const errors: string[] = [];
  if (balances.error) errors.push(`Nansen holdings: ${balances.error}`);
  if (pnl.error) errors.push(`Nansen PnL: ${pnl.error}`);
  for (const line of [hl.error, ...(hyperliquid ? [] : (hl.value?.errors ?? []))]) if (line) errors.push(`Hyperliquid: ${line}`);
  for (const line of [pm.error, ...(polymarket ? [] : (pm.value?.errors ?? []))]) if (line) errors.push(`Polymarket: ${line}`);

  const sources = ["Nansen Profiler"];
  if (name) sources.push(name.source === "replay" ? "ENS (replay)" : `ENS (${name.source})`);
  if (hyperliquid) sources.push("Hyperliquid public API");
  if (polymarket) sources.push("Nansen prediction market");

  return {
    input: input.query,
    sampleData: isReplay(),
    resolved: true,
    address,
    chainGuess,
    name,
    label: walletLabelOf(address, search.value?.entities),
    portfolio,
    pnl: pnl.value
      ? {
          realizedPnlUsd: num(pnl.value.realized_pnl_usd),
          realizedPnlPercent: num(pnl.value.realized_pnl_percent),
          winRate: num(pnl.value.win_rate),
          tradeCount: num(pnl.value.traded_times),
          tokenCount: num(pnl.value.traded_token_count),
          windowDays: WALLET_PNL_WINDOW_DAYS,
          topPnlTokens: (pnl.value.top5_tokens ?? []).slice(0, 5).map((row) => ({ symbol: row.token_symbol, chain: row.chain, tokenAddress: row.token_address, realizedPnlUsd: num(row.realized_pnl) })),
        }
      : null,
    hyperliquid,
    polymarket,
    nansenUrl: nansenWalletUrl(address, chainGuess),
    sources,
    credits: 2 + (evm ? 3 : 0),
    message: null,
    errors,
  };
}

/** An account Hyperliquid actually answered about, rather than one every call failed on. */
const hasHyperliquidData = (b: Omit<HyperliquidBadge, "link"> | null): b is Omit<HyperliquidBadge, "link"> =>
  b !== null && (b.accountValueUsd !== null || b.positions !== null || b.fills !== null);

const hasPolymarketData = (b: Omit<PolymarketBadge, "link"> | null): b is Omit<PolymarketBadge, "link"> =>
  b !== null && (b.totalPnlUsd !== null || b.openPositions !== null || b.trades !== null);

/** A block that may throw, turned into a value plus an error line (`settle` for non-Nansen work). */
async function attempt<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await fn(), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- The premium label lookup, behind its own route, its own gate and its own button ----

export const PREMIUM_LABELS_CREDITS = 100;

export const premiumAllowed = () => process.env.NANSEN_ALLOW_PREMIUM === "1";

export type WalletLabelsResult = { address: string; labels: string[]; credits: number; errors: string[] };

/**
 * `profiler/labels`, the 100-credit call. Never reached by `buildWalletLens`: only this
 * function calls it, only the labels route calls this, and the route refuses unless the
 * operator set `NANSEN_ALLOW_PREMIUM=1`.
 */
export async function walletLabels(address: string): Promise<WalletLabelsResult> {
  if (!premiumAllowed()) throw new PremiumDisabled("Nansen label lookup (profiler/labels)", PREMIUM_LABELS_CREDITS);
  const result = await settle(nansen.addressLabels(address), (d) => d);
  return {
    address,
    labels: extractLabels(result.value),
    credits: PREMIUM_LABELS_CREDITS,
    errors: result.error ? [`Nansen labels: ${result.error}`] : [],
  };
}

/** `profiler/labels` has no recorded fixture (it costs 100 credits), so its shape is read
 * defensively: any string array or `label`-ish field under the response or its `data` rows. */
export function extractLabels(payload: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v === null || v === undefined) return;
    if (typeof v === "string") {
      if (v.trim() && !out.includes(v)) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    if (typeof v === "object") {
      for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
        if (/label|tag|entity|name/i.test(key)) visit(value, depth + 1);
        else if (key === "data" || key === "results") visit(value, depth + 1);
      }
    }
  };
  visit(payload, 0);
  return out.slice(0, 20);
}
