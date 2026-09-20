import { classify, cleanLabel, isEvmAddress, nansenWalletUrl, type Chain, type LabelKind } from "@tripwire/core";
import { isReplay, PremiumDisabled } from "../nansen/client";
import {
  nansen,
  RELATED_WALLET_CHAINS,
  WALLET_ACTIVITY_WINDOW_DAYS,
  WALLET_COUNTERPARTY_WINDOW_DAYS,
  WALLET_PNL_WINDOW_DAYS,
  type AddressBalanceRow,
  type AddressTransactionRow,
  type FirstFunderRow,
  type RelatedWalletRow,
} from "../nansen/endpoints";
import { replayResolution, resolveEns, resolveSns } from "../wallet/names";
import { hyperliquidProfile, polymarketProfile, type HyperliquidBadge, type PolymarketBadge } from "./badges";
import { settle, type Sourced } from "./util";

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
 * Round 1.5.1 — the label a wallet card can actually get.
 *
 * What was here before asked `search/general` for the address and kept an entity row **whose
 * `address` matched**. `search/general` entities are `{name, tags, rank}`: there is no address
 * field, so the condition could never be true, the line was a permanent empty state, and the
 * only way out of it was the 100-credit button. The call is gone with it — it was free, but a
 * free call that cannot answer is still a round trip and a false impression of having asked.
 *
 * `profiler/dex-trades` carries `trader_address_label` on its rows: Nansen's own name for the
 * trader, bought for 1 credit, on the chain the wallet actually holds value on. Optional, and
 * on a wallet with no DEX trades in the window the page is empty — so the empty state survives
 * and nothing is invented. The row shape is read defensively for the same reason
 * `extractLabels` is: the recorded page has no rows to pin it with.
 */
export function labelFromDexTrades(rows: { trader_address_label?: string | null }[] | undefined): WalletLabel | null {
  const raw = rows?.map((row) => row?.trader_address_label).find((label): label is string => typeof label === "string" && label.trim().length > 0);
  if (!raw) return null;
  const clean = cleanLabel(raw.trim());
  return { text: clean.text || raw.trim(), kind: clean.kind, tags: [] };
}

export async function buildWalletLens(input: { query: string; chainHint?: Chain }): Promise<WalletLens> {
  const resolution = await resolveWalletQuery(input.query);
  if ("error" in resolution) return unresolved(input.query, resolution.error);

  const { address, kind, name } = resolution;
  const evm = kind === "evm";

  const [balances, pnl, hl, pm] = await Promise.all([
    settle(nansen.addressBalances(address), (d) => d),
    settle(nansen.addressPnlSummary(address), (d) => d),
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
    // Round 1.5.1: no label on card open. The only source that can answer costs a credit and
    // waits for the Summary view's button (POST /api/wallet/defi).
    label: null,
    portfolio,
    pnl: pnl.value
      ? {
          realizedPnlUsd: num(pnl.value.realized_pnl_usd),
          realizedPnlPercent: num(pnl.value.realized_pnl_percent),
          winRate: num(pnl.value.win_rate),
          tradeCount: num(pnl.value.traded_times),
          tokenCount: num(pnl.value.traded_token_count),
          windowDays: WALLET_PNL_WINDOW_DAYS,
          topPnlTokens: (pnl.value.top5_tokens ?? []).slice(0, 5).map((row) => ({
            symbol: row.token_symbol,
            chain: row.chain,
            tokenAddress: row.token_address,
            realizedPnlUsd: num(row.realized_pnl),
            // Round 1.5.2: a fraction (0.0071 is +0.71%), and already paid for.
            realizedRoi: num(row.realized_roi),
          })),
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

// ---- The 1-credit lazy views, each behind its own route and its own priced button ----

export type WalletDefi = {
  totalValueUsd: number | null;
  totalAssetsUsd: number | null;
  totalDebtsUsd: number | null;
  totalRewardsUsd: number | null;
  tokenCount: number | null;
  protocolCount: number | null;
  /** Nansen answered and reported no DeFi position at all. Distinct from "we could not ask". */
  reportedNone: boolean;
};

export type WalletDefiResult = {
  address: string;
  defi: WalletDefi | null;
  label: WalletLabel | null;
  /** The chain the label was asked for, so the caption can name it. */
  labelChain: string | null;
  credits: number;
  errors: string[];
};

export const WALLET_DEFI_CREDITS = 2;
export const WALLET_UNREALIZED_CREDITS = 1;

/**
 * Round 1.5.6 + 1.5.1, bought in one press of the Summary view's button: the DeFi side of the
 * portfolio and the wallet's Nansen trade label, 1 credit each.
 *
 * Neither figure is ever folded into the Tokens total. `current-balance` already lists aTokens,
 * stETH and LP receipts, so adding `total_value_usd` to it double-counts; and `total_debts_usd`
 * gets its own line rather than being netted into a headline, because a netted headline turns a
 * leveraged position into a small number and says nothing about the leverage.
 *
 * An answer Nansen never gave is `null` (UNCHECKED). An answer of all zeros is
 * `reportedNone: true` — still not `$0` on the card, because `portfolio/defi-holdings` has no
 * documented Solana support and "no positions found" is not "no positions".
 */
export async function buildWalletDefi(address: string, chain: string | undefined): Promise<WalletDefiResult> {
  const labelChain = chain?.trim() ? chain.trim() : null;
  const [defi, trades] = await Promise.all([
    settle(nansen.defiHoldings(address), (d) => d),
    labelChain ? settle(nansen.dexTrades(address, labelChain), (d) => d) : Promise.resolve({ value: null, error: null, cached: false, stale: false }),
  ]);

  const summary = defi.value?.summary ?? null;
  const figures = summary
    ? {
        totalValueUsd: num(summary.total_value_usd),
        totalAssetsUsd: num(summary.total_assets_usd),
        totalDebtsUsd: num(summary.total_debts_usd),
        totalRewardsUsd: num(summary.total_rewards_usd),
        tokenCount: num(summary.token_count),
        protocolCount: num(summary.protocol_count),
      }
    : null;

  const errors: string[] = [];
  if (defi.error) errors.push(`Nansen DeFi holdings: ${defi.error}`);
  if (trades.error) errors.push(`Nansen trade label: ${trades.error}`);

  return {
    address,
    defi: figures
      ? {
          ...figures,
          reportedNone: (figures.protocolCount ?? 0) === 0 && (figures.totalValueUsd ?? 0) === 0 && (defi.value?.protocols ?? []).length === 0,
        }
      : null,
    label: labelFromDexTrades(trades.value?.data),
    labelChain,
    credits: WALLET_DEFI_CREDITS,
    errors,
  };
}

export type WalletUnrealizedRow = {
  symbol: string;
  unrealizedPnlUsd: number | null;
  unrealizedRoi: number | null;
  costBasisUsd: number | null;
  holdingUsd: number | null;
  holdingAmount: number | null;
  avgSoldPriceUsd: number | null;
  buys: number | null;
  sells: number | null;
};

export type WalletUnrealizedResult = {
  address: string;
  rows: WalletUnrealizedRow[] | null;
  /** True when Nansen said there is another page: the rows shown are the largest, not all. */
  truncated: boolean;
  windowDays: number;
  credits: number;
  errors: string[];
};

/**
 * Round 1.5.7 — `profiler/address/pnl`, the unrealized half the Performance view never had.
 *
 * Two things were measured on the first live call rather than assumed. `chain: "all"` **is**
 * accepted, so one call covers a multi-chain wallet. But the rows it returns **carry no chain**:
 * the recorded wallet has three separate `ETH` rows sharing the `0xeee…eee` native sentinel.
 * So a row is never labelled with a chain, never linked to a token page, and never merged with
 * a same-symbol row — and the card says as much.
 */
export async function buildWalletUnrealized(address: string): Promise<WalletUnrealizedResult> {
  const pnl = await settle(nansen.addressPnl(address), (d) => d);
  const rows = pnl.value?.data ?? null;
  return {
    address,
    rows: rows
      ? rows.map((row) => ({
          symbol: typeof row.token_symbol === "string" && row.token_symbol.trim() ? row.token_symbol.trim().slice(0, 16) : "—",
          unrealizedPnlUsd: num(row.pnl_usd_unrealised),
          unrealizedRoi: num(row.roi_percent_unrealised),
          costBasisUsd: num(row.cost_basis_usd),
          holdingUsd: num(row.holding_usd),
          holdingAmount: num(row.holding_amount),
          avgSoldPriceUsd: num(row.avg_sold_price_usd),
          buys: num(row.nof_buys),
          sells: num(row.nof_sells),
        }))
      : null,
    truncated: pnl.value?.pagination?.is_last_page === false,
    windowDays: WALLET_PNL_WINDOW_DAYS,
    credits: WALLET_UNREALIZED_CREDITS,
    errors: pnl.error ? [`Nansen unrealized PnL: ${pnl.error}`] : [],
  };
}

// ---- Round 2.3: wallet depth — the activity feed, the origin story and the counterparties ----

/**
 * Nansen's `block_timestamp` comes back two ways: `"2021-11-07T16:34:35Z"` on the origin calls
 * and **`"2026-09-18T17:20:11"` with no zone at all** on `profiler/address/transactions`. A bare
 * datetime is read as *local* time by `new Date()`, which on a UTC+X machine would age every row
 * wrongly and could print a future timestamp. Nansen's figures are UTC, so the zone is restored
 * here, once, on the way out of the backend.
 */
export function utcIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Number.isNaN(new Date(zoned).getTime()) ? null : zoned;
}

/** Third-party text on its way to a Shadow-DOM render: trimmed, capped, never empty-as-empty. */
const text = (raw: unknown, max = 48): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
};

export type WalletActivityRow = {
  timeIso: string | null;
  /** Present on every recorded row: `chain: "all"` still says which chain each one happened on. */
  chain: string | null;
  /** Read off which array the legs are in, not inferred from addresses. */
  direction: "sent" | "received" | "both" | null;
  /** Nansen's row-level `volume_usd`. Null on 21 of 100 recorded rows: unpriced, not zero. */
  valueUsd: number | null;
  txHash: string | null;
  sourceType: string | null;
  /** The largest priced leg, else the first one. `legCount` says how many there were. */
  token: { symbol: string | null; amount: number | null; valueUsd: number | null } | null;
  legCount: number;
  /** The other end of that leg: Nansen's own label when it sent one, else just the address. */
  counterparty: { address: string | null; label: string | null } | null;
};

export type WalletActivityResult = {
  address: string;
  rows: WalletActivityRow[] | null;
  /** Nansen said there is another page: these are the newest rows, not the whole window. */
  truncated: boolean;
  windowDays: number;
  /** The newest returned timestamp. "Last active" is only ever this, and the card says so. */
  lastActiveIso: string | null;
  /** Every chain the returned rows touched, so the section can state its own coverage. */
  chains: string[];
  credits: number;
  errors: string[];
};

export const WALLET_ACTIVITY_CREDITS = 1;
export const WALLET_ORIGIN_MAX_CREDITS = 2;
export const WALLET_COUNTERPARTY_CREDITS = 5;

/**
 * Round 2.3 — `profiler/address/transactions`, the first time-ordered content a plain spot
 * wallet has had. 1 credit, behind the Activity view's priced button.
 *
 * Everything here is a read of a field Nansen sent. The direction comes from which array a leg
 * arrived in, not from comparing addresses; the counterparty is that leg's other address with
 * Nansen's own label when there is one and nothing added when there is not. A row is never
 * described as a deposit, an exit or a move to an exchange: `method` is a raw contract
 * signature and `source_type` is Nansen's own word, and neither is a motive.
 */
export async function buildWalletActivity(address: string): Promise<WalletActivityResult> {
  const result = await settle(nansen.addressTransactions(address), (d) => d);
  const raw = result.value?.data ?? null;
  const rows = raw ? raw.map(activityRow) : null;
  const times = (rows ?? []).map((r) => r.timeIso).filter((t): t is string => t !== null);
  return {
    address,
    rows,
    truncated: result.value?.pagination?.is_last_page === false,
    windowDays: WALLET_ACTIVITY_WINDOW_DAYS,
    lastActiveIso: times.length ? times.reduce((a, b) => (a > b ? a : b)) : null,
    chains: [...new Set((rows ?? []).map((r) => r.chain).filter((c): c is string => c !== null))],
    credits: WALLET_ACTIVITY_CREDITS,
    errors: result.error ? [`Nansen activity: ${result.error}`] : [],
  };
}

function activityRow(row: AddressTransactionRow): WalletActivityRow {
  const sent = (row.tokens_sent ?? []).map((leg) => ({ side: "sent" as const, leg }));
  const received = (row.tokens_received ?? []).map((leg) => ({ side: "received" as const, leg }));
  const legs = [...sent, ...received];
  // The leg with the largest dollar figure, or — when Nansen priced none of them, which is the
  // normal case on HyperEVM — the first one. Token amounts are not comparable across tokens, so
  // they are never used to rank.
  const primary =
    legs.reduce<(typeof legs)[number] | null>((best, candidate) => {
      const value = Math.abs(num(candidate.leg.value_usd) ?? 0);
      const bestValue = best ? Math.abs(num(best.leg.value_usd) ?? 0) : -1;
      return value > bestValue ? candidate : best;
    }, null) ?? legs[0] ?? null;
  const other = primary ? (primary.side === "sent" ? primary.leg.to_address : primary.leg.from_address) : null;
  const otherLabel = primary ? (primary.side === "sent" ? primary.leg.to_address_label : primary.leg.from_address_label) : null;
  return {
    timeIso: utcIso(row.block_timestamp),
    chain: text(row.chain, 24),
    direction: sent.length && received.length ? "both" : sent.length ? "sent" : received.length ? "received" : null,
    valueUsd: num(row.volume_usd),
    txHash: text(row.transaction_hash, 80),
    sourceType: text(row.source_type, 24),
    token: primary
      ? { symbol: text(primary.leg.token_symbol, 16), amount: num(primary.leg.token_amount), valueUsd: num(primary.leg.value_usd) }
      : null,
    legCount: legs.length,
    counterparty: primary ? { address: text(other, 80), label: text(otherLabel) } : null,
  };
}

export type WalletOriginResult = {
  address: string;
  /** Nansen's row, or null when the call failed. `firstFunderReportedNone` is the empty answer. */
  firstFunder: { address: string | null; name: string | null; timeIso: string | null; chain: string | null; txHash: string | null } | null;
  firstFunderReportedNone: boolean;
  /** False for a non-EVM address: the lookup is EVM-only, so it is never asked and never priced. */
  firstFunderAsked: boolean;
  related: { address: string | null; label: string | null; relation: string | null; timeIso: string | null; chain: string | null }[] | null;
  /** The chain related-wallets was asked about, so the section can name it. */
  relatedChain: string | null;
  /** Measured: related-wallets can return the first funder under `relation: "First Funder"`. */
  firstFunderAlsoRelated: boolean;
  credits: number;
  errors: string[];
};

/**
 * The largest of a wallet's chains that `profiler/address/related-wallets` actually accepts.
 *
 * The recorded wallet's biggest chain is `hyperevm`, which is **not** in that endpoint's enum —
 * passing "the wallet's biggest chain" straight through would 422 every time. The list came from
 * the endpoint's own error message (a free 422, no credit), so it is measured, not guessed.
 */
/** A call that was never made: `null` like a failure, but with nothing to report as one. */
const notAsked = <T>(): Promise<Sourced<T>> => Promise.resolve({ value: null, error: null, cached: false, stale: false });

export function pickRelatedChain(chains: readonly string[] | undefined): string | null {
  const allowed = new Set<string>(RELATED_WALLET_CHAINS);
  return (chains ?? []).map((c) => c.trim().toLowerCase()).find((c) => allowed.has(c)) ?? null;
}

/**
 * Round 2.3 — the origin story: `profiler/address/first-funder` (1 credit, EVM only) and
 * `profiler/address/related-wallets` (1 credit, chain-scoped). **Up to 2 credits**, because a
 * Solana address gets only the second and a wallet on no supported chain gets only the first.
 *
 * These feed no signal and no block, by the brief and by non-negotiable #2. `relation` is
 * carried through as the raw Nansen string; nothing here says "same owner", "linked to" or
 * "sybil", and the card never draws a conclusion Nansen did not state.
 */
export async function buildWalletOrigin(address: string, chains: string[] | undefined): Promise<WalletOriginResult> {
  const evm = isEvmAddress(address);
  const relatedChain = pickRelatedChain(chains);

  const [funder, related] = await Promise.all([
    evm ? settle(nansen.addressFirstFunder(address), (d) => d) : notAsked<{ data: FirstFunderRow[] }>(),
    relatedChain ? settle(nansen.addressRelatedWallets(address, relatedChain), (d) => d) : notAsked<{ data: RelatedWalletRow[] }>(),
  ]);

  const funderRows = funder.value?.data ?? null;
  const row = funderRows?.[0] ?? null;
  const firstFunder = row
    ? {
        address: text(row.first_funder_address, 80),
        name: text(row.first_funder_name),
        timeIso: utcIso(row.block_timestamp),
        chain: text(row.chain, 24),
        txHash: text(row.transaction_hash, 80),
      }
    : null;

  const relatedRows = related.value?.data
    ? related.value.data.map((r) => ({
        address: text(r.address, 80),
        label: text(r.address_label),
        relation: text(r.relation, 40),
        timeIso: utcIso(r.block_timestamp),
        chain: text(r.chain, 24),
      }))
    : null;

  const errors: string[] = [];
  if (funder.error) errors.push(`Nansen first funder: ${funder.error}`);
  if (related.error) errors.push(`Nansen related wallets: ${related.error}`);

  const funderKey = firstFunder?.address?.toLowerCase() ?? null;
  return {
    address,
    firstFunder,
    firstFunderReportedNone: evm && funderRows !== null && funderRows.length === 0,
    firstFunderAsked: evm,
    related: relatedRows,
    relatedChain,
    firstFunderAlsoRelated: funderKey !== null && (relatedRows ?? []).some((r) => r.address?.toLowerCase() === funderKey),
    credits: (evm ? 1 : 0) + (relatedChain ? 1 : 0),
    errors,
  };
}

export type WalletCounterpartyRow = {
  address: string | null;
  /** Nansen's own array, empty on 36 of the 50 recorded rows. Empty means unlabelled, not none. */
  labels: string[];
  interactions: number | null;
  volumeInUsd: number | null;
  volumeOutUsd: number | null;
  totalVolumeUsd: number | null;
  /** The token that moved most often between the two addresses, by Nansen's own transfer count. */
  topToken: string | null;
};

export type WalletCounterpartiesResult = {
  address: string;
  rows: WalletCounterpartyRow[] | null;
  /** Another page exists: the rows are the largest returned, not every counterparty. */
  truncated: boolean;
  windowDays: number;
  credits: number;
  errors: string[];
};

/**
 * Round 2.3 — `profiler/address/counterparties`, **5 credits**: the second five-credit call a
 * wallet card can make, and like `profiler/labels` it only happens on a button that prints the
 * price. `chain: "all"` was probed and accepted, so one press covers every chain.
 *
 * Volume in and volume out are shown as the two figures Nansen sends. "CEX exposure" is an
 * interpretation and is not computed here or on the card, and an unlabelled counterparty stays
 * an address rather than being described.
 */
export async function buildWalletCounterparties(address: string): Promise<WalletCounterpartiesResult> {
  const result = await settle(nansen.addressCounterparties(address), (d) => d);
  const raw = result.value?.data ?? null;
  return {
    address,
    rows: raw
      ? raw.map((row) => {
          const tokens = row.tokens_info ?? [];
          const top = tokens.reduce<(typeof tokens)[number] | null>((best, candidate) => {
            const n = num(candidate?.num_transfer) ?? 0;
            return best === null || n > (num(best.num_transfer) ?? 0) ? candidate : best;
          }, null);
          return {
            address: text(row.counterparty_address, 80),
            labels: (row.counterparty_address_label ?? []).map((l) => text(l)).filter((l): l is string => l !== null),
            interactions: num(row.interaction_count),
            volumeInUsd: num(row.volume_in_usd),
            volumeOutUsd: num(row.volume_out_usd),
            totalVolumeUsd: num(row.total_volume_usd),
            topToken: top ? text(top.token_symbol, 16) : null,
          };
        })
      : null,
    truncated: result.value?.pagination?.is_last_page === false,
    windowDays: WALLET_COUNTERPARTY_WINDOW_DAYS,
    credits: WALLET_COUNTERPARTY_CREDITS,
    errors: result.error ? [`Nansen counterparties: ${result.error}`] : [],
  };
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
