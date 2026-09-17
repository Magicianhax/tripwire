import { normalizeHandle } from "@tripwire/core";
import { hyperliquidInfo } from "../hyperliquid/client";
import { linksFor, type WalletLink } from "../links";
import { ENTITY_PNL_WINDOW_DAYS, nansen, PERP_PNL_WINDOW_DAYS } from "../nansen/endpoints";
import { matchNansenEntity } from "./person";
import { settle } from "./util";

/**
 * Author badges for an X account. Never guesses ownership:
 * - Nansen: only on an exact normalized entity match (matchNansenEntity). 2 credits when matched
 *   (current-balance + pnl-summary), 0 otherwise (search is free).
 * - Hyperliquid / Polymarket: only for a user link or a curated, source-verified entry.
 *   Hyperliquid: public info API (free) + Nansen perp-pnl-summary (1 credit).
 *   Polymarket: Nansen address-summary + pnl-by-address + trades-by-address (3 credits).
 * Each venue fails on its own: a failed call becomes null plus an error line, never a 5xx.
 */

type LinkRef = { address: string; source: WalletLink["source"]; sourceUrl: string | null };

export type NansenBadge = {
  entity: string;
  tags: string[];
  matchedBy: "displayName" | "handle";
  totalHoldingsUsd: number | null;
  topHoldings: { symbol: string; chain: string; valueUsd: number }[];
  realizedPnlUsd: number | null;
  winRate: number | null;
  pnlWindowDays: number;
  errors: string[];
};

export type HyperliquidPosition = {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPx: number | null;
  markPx: number | null;
  liquidationPx: number | null;
  unrealizedPnlUsd: number | null;
  leverage: number | null;
  valueUsd: number | null;
};

export type HyperliquidFill = { time: number; coin: string; dir: string; px: number | null; sz: number | null; closedPnlUsd: number | null };

export type HyperliquidBadge = {
  link: LinkRef;
  accountValueUsd: number | null;
  marginUsedUsd: number | null;
  positions: HyperliquidPosition[] | null;
  fills: HyperliquidFill[] | null;
  /** Sum of closedPnl over every fill the API returned (its most recent window). */
  fillsRealizedPnlUsd: number | null;
  fillsWindow: { count: number; fromMs: number; toMs: number } | null;
  nansenPerp: { realizedPnlUsd: number | null; winRate: number | null; windowDays: number } | null;
  errors: string[];
};

export type PolymarketPosition = { marketId: string; question: string; side: string; costUsd: number | null; valueUsd: number; pnlUsd: number | null };
export type PolymarketTrade = { timestamp: string; action: "Buy" | "Sell" | null; side: string | null; size: number | null; price: number | null; usdcValue: number | null; question: string | null };

export type PolymarketBadge = {
  link: LinkRef;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  winRate: number | null;
  marketsTraded: number | null;
  marketsWon: number | null;
  openPositions: PolymarketPosition[] | null;
  trades: PolymarketTrade[] | null;
  errors: string[];
};

export type AuthorBadges = {
  handle: string;
  nansen?: NansenBadge;
  hyperliquid?: HyperliquidBadge;
  polymarket?: PolymarketBadge;
  /** A venue that could not even be looked up (e.g. Nansen search failed). */
  errors: string[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const errorsOf = (...sources: { error: string | null }[]) => sources.map((s) => s.error).filter((e): e is string => e !== null);
const linkRef = (l: WalletLink): LinkRef => ({ address: l.address, source: l.source, sourceUrl: l.sourceUrl });

async function nansenBadge(match: { name: string; tags: string[]; matchedBy: "displayName" | "handle" }): Promise<NansenBadge> {
  const [balances, pnl] = await Promise.all([
    settle(nansen.entityBalances(match.name), (d) => d.data ?? []),
    settle(nansen.entityPnlSummary(match.name), (d) => d),
  ]);
  const rows = (balances.value ?? []).filter((r) => (r.value_usd ?? 0) > 0);
  return {
    entity: match.name,
    tags: match.tags,
    matchedBy: match.matchedBy,
    totalHoldingsUsd: balances.value ? rows.reduce((s, r) => s + (r.value_usd ?? 0), 0) : null,
    topHoldings: rows
      .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0))
      .slice(0, 3)
      .map((r) => ({ symbol: r.token_symbol, chain: r.chain, valueUsd: r.value_usd ?? 0 })),
    realizedPnlUsd: num(pnl.value?.realized_pnl_usd),
    winRate: num(pnl.value?.win_rate),
    pnlWindowDays: ENTITY_PNL_WINDOW_DAYS,
    errors: errorsOf(balances, pnl),
  };
}

type ClearinghouseState = {
  marginSummary?: { accountValue?: string; totalMarginUsed?: string };
  assetPositions?: {
    position: { coin: string; szi: string; entryPx?: string | null; positionValue?: string | null; unrealizedPnl?: string | null; liquidationPx?: string | null; leverage?: { value?: number } | null };
  }[];
};
type UserFill = { coin: string; px: string; sz: string; time: number; dir: string; closedPnl: string };

/**
 * One address's Hyperliquid account, without any claim about who owns it. The author badge adds
 * the link it came from; the wallet lens passes the address the user clicked and skips the
 * Nansen perp summary, which is the only part of this that costs a credit.
 */
export async function hyperliquidProfile(address: string, opts: { nansenPerp?: boolean } = {}): Promise<Omit<HyperliquidBadge, "link">> {
  const [state, fills, perp] = await Promise.all([
    settle(hyperliquidInfo<ClearinghouseState>("clearinghouseState", address), (d) => d),
    settle(hyperliquidInfo<UserFill[]>("userFills", address), (d) => (Array.isArray(d) ? d : null)),
    opts.nansenPerp === false
      ? Promise.resolve({ value: null, error: null, cached: false, stale: false })
      : settle(nansen.perpPnlSummary(address), (d) => d.data),
  ]);

  const positions = state.value
    ? (state.value.assetPositions ?? []).map(({ position: p }): HyperliquidPosition => {
        const signed = num(p.szi) ?? 0;
        const size = Math.abs(signed);
        const valueUsd = num(p.positionValue);
        return {
          coin: p.coin,
          side: signed < 0 ? "short" : "long",
          size,
          entryPx: num(p.entryPx),
          markPx: valueUsd !== null && size > 0 ? valueUsd / size : null,
          liquidationPx: num(p.liquidationPx),
          unrealizedPnlUsd: num(p.unrealizedPnl),
          leverage: num(p.leverage?.value),
          valueUsd,
        };
      })
    : null;
  positions?.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const all = fills.value ? [...fills.value].sort((a, b) => b.time - a.time) : null;
  return {
    accountValueUsd: num(state.value?.marginSummary?.accountValue),
    marginUsedUsd: num(state.value?.marginSummary?.totalMarginUsed),
    positions,
    fills: all ? all.slice(0, 10).map((f) => ({ time: f.time, coin: f.coin, dir: f.dir, px: num(f.px), sz: num(f.sz), closedPnlUsd: num(f.closedPnl) })) : null,
    fillsRealizedPnlUsd: all ? all.reduce((s, f) => s + (num(f.closedPnl) ?? 0), 0) : null,
    fillsWindow: all && all.length > 0 ? { count: all.length, fromMs: all[all.length - 1]!.time, toMs: all[0]!.time } : null,
    nansenPerp: perp.value ? { realizedPnlUsd: num(perp.value.realized_pnl_usd), winRate: num(perp.value.win_rate), windowDays: PERP_PNL_WINDOW_DAYS } : null,
    errors: errorsOf(state, fills, perp),
  };
}

const hyperliquidBadge = async (link: WalletLink): Promise<HyperliquidBadge> => ({ link: linkRef(link), ...(await hyperliquidProfile(link.address)) });

/** One address's Polymarket record. Three Nansen calls, 1 credit each. */
export async function polymarketProfile(addressInput: string): Promise<Omit<PolymarketBadge, "link">> {
  const [summary, markets, trades] = await Promise.all([
    settle(nansen.pmAddressSummary(addressInput), (d) => d.data?.[0] ?? null),
    settle(nansen.pmMarketsByAddress(addressInput), (d) => d.data ?? []),
    settle(nansen.pmTradesByAddress(addressInput), (d) => d.data ?? []),
  ]);
  const s = summary.value;
  const address = addressInput.toLowerCase();
  return {
    totalPnlUsd: num(s?.total_pnl_usd),
    realizedPnlUsd: num(s?.realized_pnl_usd),
    unrealizedPnlUsd: num(s?.unrealized_pnl_usd),
    winRate: num(s?.win_rate),
    marketsTraded: num(s?.markets_traded),
    marketsWon: num(s?.markets_won),
    openPositions: markets.value
      ? markets.value
          .filter((m) => m.market_resolved === false && (m.unrealized_value_usd ?? 0) > 0)
          .sort((a, b) => (b.unrealized_value_usd ?? 0) - (a.unrealized_value_usd ?? 0))
          .slice(0, 5)
          .map((m) => ({
            marketId: m.market_id,
            question: m.question ?? "Unknown market",
            side: m.side_held ?? "—",
            costUsd: m.net_buy_cost_usd === null ? null : (m.net_buy_cost_usd ?? 0) - (m.net_sell_proceeds_usd ?? 0),
            valueUsd: m.unrealized_value_usd ?? 0,
            pnlUsd: num(m.total_pnl_usd),
          }))
      : null,
    trades: trades.value
      ? trades.value.slice(0, 5).map((t) => ({
          timestamp: t.timestamp,
          action: t.buyer?.toLowerCase() === address ? "Buy" : t.seller?.toLowerCase() === address ? "Sell" : null,
          side: t.side,
          size: num(t.size),
          price: num(t.price),
          usdcValue: num(t.usdc_value),
          question: t.market_question,
        }))
      : null,
    errors: errorsOf(summary, markets, trades),
  };
}

const polymarketBadge = async (link: WalletLink): Promise<PolymarketBadge> => ({ link: linkRef(link), ...(await polymarketProfile(link.address)) });

export async function buildAuthorBadges(input: { handle: string; displayName: string }): Promise<AuthorBadges> {
  const out: AuthorBadges = { handle: normalizeHandle(input.handle), errors: [] };
  const links = linksFor(input.handle);
  const hl = links.find((l) => l.venue === "hyperliquid");
  const pm = links.find((l) => l.venue === "polymarket");

  const [n, h, p] = await Promise.all([
    attempt(async () => {
      const match = await matchNansenEntity(input);
      return match ? nansenBadge(match) : undefined;
    }),
    attempt(async () => (hl ? hyperliquidBadge(hl) : undefined)),
    attempt(async () => (pm ? polymarketBadge(pm) : undefined)),
  ]);

  if (n.value) out.nansen = n.value;
  if (h.value) out.hyperliquid = h.value;
  if (p.value) out.polymarket = p.value;
  if (n.error) out.errors.push(`Nansen label lookup: ${n.error}`);
  if (h.error) out.errors.push(`Hyperliquid: ${h.error}`);
  if (p.error) out.errors.push(`Polymarket: ${p.error}`);
  return out;
}

/** One venue's work, with any throw turned into an error line so the others still return. */
async function attempt<T>(fn: () => Promise<T | undefined>): Promise<{ value: T | undefined; error: string | null }> {
  try {
    return { value: await fn(), error: null };
  } catch (e) {
    return { value: undefined, error: message(e) };
  }
}
