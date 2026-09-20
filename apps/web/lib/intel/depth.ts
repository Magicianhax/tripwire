import { DEPTH_SECTION_CREDITS, type Candle, type OiHistorySeries, type PerpPosition, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import { hlBookDepth, hlCandles, hlFundingHistory, hlMarket, hlPerpAtOpenInterestCap, type BookDepth, type FundingPoint, type HlMarket } from "../hyperliquid/perp";
import {
  balanceChangePct,
  stillHoldingSummary,
  tapeKeepsRow,
  tapeSpan,
  toFlowWarnings,
  TAPE_MIN_USD,
  TAPE_ROWS,
  type StillHoldingSummary,
  type TapeRow,
} from "@tripwire/core";
import { crossVenueFunding } from "../venues";
import { tokenMarketStructure, type TokenMarketStructure } from "../dexscreener/token";
import { nansen } from "../nansen/endpoints";
import { clobBook, type ClobLevel } from "../polymarket/clob";
import { resolveMarket, toMarket } from "./prediction";
import { settle } from "./util";

/**
 * The card's *depth*: everything a tab asks for after the card is already on screen.
 *
 * Nothing in here runs on a card open. Each section is requested by the tab that shows it (or by
 * the expanded view), each one settles independently, and each one names the endpoint behind it
 * when it fails. The two paid sections (`perpTraders`, `spotHolders`) are the reason this split
 * exists: they may never fire just because somebody glanced at a token.
 */

// ---- Defensive row reading -------------------------------------------------------------------
// Every Nansen shape below was observed once, in the recording run. A renamed field must cost a
// column, never the tab, so each value is looked up under the names it plausibly carries.

type Row = Record<string, unknown>;

function pickNum(row: Row, names: string[]): number | null {
  for (const n of names) {
    const v = row[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function pickStr(row: Row, names: string[]): string | null {
  for (const n of names) {
    const v = row[n];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

const rowsOf = (d: { data?: unknown } | null | undefined): Row[] =>
  Array.isArray((d as { data?: unknown })?.data) ? ((d as { data: unknown[] }).data.filter((r) => r && typeof r === "object") as Row[]) : [];

// ---- Perp: market, venues, chart ---------------------------------------------------------------

export type PerpMarketSection = {
  market: HlMarket | null;
  book: BookDepth | null;
  funding: FundingPoint[] | null;
  /**
   * Whether Hyperliquid lists this coin among the perps at their open-interest cap (Round 2.5).
   * **Null is "we could not ask"**, which is a different answer from `false`: the card says
   * nothing on a null and never turns either into a block.
   */
  atOpenInterestCap: boolean | null;
  errors: string[];
};

export async function perpMarketSection(coin: string): Promise<PerpMarketSection> {
  const [market, book, funding, atCap] = await Promise.all([
    settle(hlMarket(coin).then((data) => ({ data, cached: false, stale: false })), (d) => d),
    settle(hlBookDepth(coin).then((data) => ({ data, cached: false, stale: false })), (d) => d),
    settle(hlFundingHistory(coin).then((data) => ({ data, cached: false, stale: false })), (d) => (d.length > 0 ? d : null)),
    // Free, and its own failure is already a null rather than a throw.
    hlPerpAtOpenInterestCap(coin),
  ]);
  return {
    market: market.value,
    book: book.value,
    funding: funding.value,
    atOpenInterestCap: atCap,
    errors: [market.error, book.error, funding.error].filter((e): e is string => !!e),
  };
}

export type PerpVenuesSection = {
  rows: PerpVenueQuote[];
  unmapped: PerpVenueId[];
  /** Binance's open interest over the last day — the only over-time source in the table, which
   * is why the series names the venue that produced it (Round 2.5). */
  oiHistory: OiHistorySeries | null;
  errors: string[];
};

export async function perpVenuesSection(coin: string): Promise<PerpVenuesSection> {
  try {
    const table = await crossVenueFunding(coin);
    return { rows: table.rows, unmapped: table.unmapped, oiHistory: table.oiHistory, errors: [] };
  } catch (e) {
    return { rows: [], unmapped: [], oiHistory: null, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

// ---- Perp: the liquidation ladder for a cohort other than Smart Money (Round 2.5) ---------------

/**
 * The cohorts `tgm/perp-positions` will answer for, beyond the `smart_money` the card already
 * buys on every panel open.
 *
 * Not a free-text parameter: an unknown value is refused here rather than sent, because a
 * rejected request still costs a round trip and a ledger row.
 */
export const PERP_LADDER_COHORTS = ["all_traders", "whale", "public_figure"] as const;
export type PerpLadderCohort = (typeof PERP_LADDER_COHORTS)[number];

export type PerpCohortLadderSection = {
  cohort: PerpLadderCohort;
  positions: PerpPosition[] | null;
  /** Whether the page was the whole population, and how many rows it actually returned — the
   * same two facts the Smart Money ladder states (Round 1.3.7). */
  isLastPage: boolean | null;
  returned: number | null;
  credits: number;
  errors: string[];
};

/**
 * One cohort's largest open positions. **5 credits, and it is never part of a card's own load**
 * or of opening a tab: the Liquidations tab draws the Smart Money ladder the panel already
 * bought, and this fires only when somebody presses a button that states its price.
 *
 * `per_page` stays at the Smart Money call's 50 rather than climbing toward the endpoint's
 * 1000. The ladder buckets into twelve price bands and the table pages six rows at a time, so
 * rows 51 and beyond would be bridge payload nobody can reach — and the aside says out loud
 * that 50 was a cap, which is the honest version of the same fact.
 */
export async function perpCohortLadderSection(coin: string, cohort: PerpLadderCohort): Promise<PerpCohortLadderSection> {
  if (!PERP_LADDER_COHORTS.includes(cohort)) throw new Error(`Unknown perp cohort "${cohort}"`);
  const r = await settle(nansen.perpPositionsCohort(coin, cohort), (d) => d);
  return {
    cohort,
    positions: r.value?.data ?? null,
    isLastPage: r.value?.pagination?.is_last_page ?? null,
    returned: r.value?.data?.length ?? null,
    credits: PERP_COHORT_LADDER_CREDITS,
    errors: r.error ? [r.error] : [],
  };
}

/** Measured, not read off the price list: `tgm/perp-positions` bills 5 whichever cohort it is
 * asked for, which the round's own recording run confirmed. */
export const PERP_COHORT_LADDER_CREDITS = 5;

export type PerpChartSection = { interval: string; candles: Candle[] | null; errors: string[] };

export async function perpChartSection(coin: string, window: string): Promise<PerpChartSection> {
  const r = await settle(hlCandles(coin, window).then((data) => ({ data, cached: false, stale: false })), (d) => d);
  return { interval: r.value?.interval ?? "", candles: r.value?.candles ?? null, errors: r.error ? [r.error] : [] };
}

// ---- Perp: traders (the paid section) -----------------------------------------------------------

export type PerpLeaderRow = {
  address: string | null;
  label: string | null;
  side: string | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  positionValueUsd: number | null;
  holdingAmount: number | null;
  roiPct: number | null;
  tradeCount: number | null;
};

export type PerpDepthTrade = {
  address: string | null;
  label: string | null;
  side: string | null;
  action: string | null;
  valueUsd: number | null;
  priceUsd: number | null;
  tokenAmount: number | null;
  orderType: string | null;
  timestamp: string | null;
};

/** One of an account's five largest open positions, as the leaderboard reports them. */
export type TopAccountPosition = { coin: string; side: string | null; valueUsd: number | null; entryPrice: number | null; unrealizedPnlUsd: number | null };

export type TopAccount = {
  address: string | null;
  label: string | null;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  /** Nansen reports ROI as a fraction (0.15 = 15%); this is the percentage. */
  roiPct: number | null;
  accountValueUsd: number | null;
  volumeUsd: number | null;
  /** This account's open position in the coin the card is about, when it has one. */
  hereNow: TopAccountPosition | null;
};

export type PerpTradersSection = {
  leaderboard: PerpLeaderRow[] | null;
  trades: PerpDepthTrade[] | null;
  topAccounts: TopAccount[] | null;
  /** How many of the top accounts are in this coin right now, for the section's own sentence. */
  topAccountsHere: number;
  credits: number;
  errors: string[];
};

const ADDRESS_FIELDS = ["trader_address", "address", "user_address", "wallet_address"];
const LABEL_FIELDS = ["trader_address_label", "address_label", "label", "entity", "name"];

/**
 * `tgm/perp-pnl-leaderboard` reports no side: it reports `holding_amount`, signed the way the
 * position is. A trader who has closed out holds nothing, so their side is genuinely unknown
 * rather than flat.
 */
function sideOfHolding(amount: number | null): string | null {
  if (amount === null || amount === 0) return null;
  return amount > 0 ? "Long" : "Short";
}

function toLeaderRow(r: Row): PerpLeaderRow {
  const holding = pickNum(r, ["holding_amount"]);
  // `roi_percent_total` is a fraction (0.07 = 7%), the same convention as `roi` next door.
  const roi = pickNum(r, ["roi_percent_total", "roi_percent_realised", "roi"]);
  return {
    address: pickStr(r, ADDRESS_FIELDS),
    label: pickStr(r, LABEL_FIELDS),
    side: pickStr(r, ["side", "position_side"]) ?? sideOfHolding(holding),
    // Nansen spells these the British way on this endpoint and the American way on the
    // leaderboard next door. Both are read, so neither rename can blank a column.
    realizedPnlUsd: pickNum(r, ["pnl_usd_realised", "pnl_usd_realized", "realized_pnl_usd"]),
    unrealizedPnlUsd: pickNum(r, ["pnl_usd_unrealised", "pnl_usd_unrealized", "unrealized_pnl_usd", "upnl_usd"]),
    totalPnlUsd: pickNum(r, ["pnl_usd_total", "total_pnl_usd", "total_pnl", "pnl_usd"]),
    positionValueUsd: pickNum(r, ["position_value_usd", "notional_usd"]),
    holdingAmount: holding,
    roiPct: roi === null ? null : roi * 100,
    tradeCount: pickNum(r, ["nof_trades", "total_trades"]),
  };
}

function toDepthTrade(r: Row): PerpDepthTrade {
  return {
    address: pickStr(r, ADDRESS_FIELDS),
    label: pickStr(r, LABEL_FIELDS),
    side: pickStr(r, ["side", "position_side", "direction"]),
    action: pickStr(r, ["action", "trade_action", "event"]),
    valueUsd: pickNum(r, ["value_usd", "notional_usd", "usd_value"]),
    priceUsd: pickNum(r, ["price_usd", "price", "avg_price"]),
    tokenAmount: pickNum(r, ["token_amount", "size", "size_base"]),
    orderType: pickStr(r, ["type", "order_type"]),
    timestamp: pickStr(r, ["block_timestamp", "timestamp", "time", "traded_at"]),
  };
}

/** A row is worth a line only if it names somebody. */
const namesSomeone = (r: { address: string | null; label: string | null }) => !!(r.address || r.label);

/** The account's open position in `coin`, out of the five the leaderboard reports. */
function positionIn(r: Row, coin: string): TopAccountPosition | null {
  const raw = r["top_positions"];
  if (!Array.isArray(raw)) return null;
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const row = p as Row;
    const name = pickStr(row, ["coin", "token_symbol", "symbol"]);
    if (!name || name.toUpperCase() !== coin.toUpperCase()) continue;
    return {
      coin: name,
      side: pickStr(row, ["side", "position_side"]),
      valueUsd: pickNum(row, ["position_value_usd", "value_usd"]),
      entryPrice: pickNum(row, ["entry_price", "entry_px"]),
      unrealizedPnlUsd: pickNum(row, ["unrealized_pnl_usd", "upnl_usd"]),
    };
  }
  return null;
}

export async function perpTradersSection(coin: string): Promise<PerpTradersSection> {
  // Three independent calls, settled one by one: a dead leaderboard never costs us the trades.
  const [leaders, trades, accounts] = await Promise.all([
    settle(nansen.perpPnlLeaderboard(coin), (d) => rowsOf(d).map(toLeaderRow).filter(namesSomeone)),
    settle(nansen.tokenPerpTrades(coin), (d) => rowsOf(d).map(toDepthTrade).filter(namesSomeone)),
    settle(nansen.hyperliquidLeaderboard(), (d) => rowsOf(d)),
  ]);

  // "Top HL accounts active in this coin". The overall leaderboard carries each account's five
  // largest open positions, so membership is read from the account's own book rather than
  // inferred from whether it happens to appear in the per-coin calls.
  const topAccounts =
    accounts.value
      ?.map((r): TopAccount => {
        const roi = pickNum(r, ["roi"]);
        return {
          address: pickStr(r, ADDRESS_FIELDS),
          label: pickStr(r, LABEL_FIELDS),
          totalPnlUsd: pickNum(r, ["total_pnl", "pnl_usd_total", "total_pnl_usd"]),
          realizedPnlUsd: pickNum(r, ["realized_pnl_usd", "pnl_usd_realised"]),
          unrealizedPnlUsd: pickNum(r, ["unrealized_pnl_usd", "pnl_usd_unrealised"]),
          roiPct: roi === null ? null : roi * 100,
          accountValueUsd: pickNum(r, ["account_value", "account_value_usd", "equity_usd"]),
          volumeUsd: pickNum(r, ["volume_usd"]),
          hereNow: positionIn(r, coin),
        };
      })
      .filter(namesSomeone)
      // The ones actually in this market lead; the rest keep the leaderboard's own order.
      .sort((a, b) => Number(!!b.hereNow) - Number(!!a.hereNow)) ?? null;

  return {
    leaderboard: leaders.value,
    trades: trades.value,
    topAccounts,
    topAccountsHere: (topAccounts ?? []).filter((a) => a.hereNow).length,
    credits: DEPTH_SECTION_CREDITS.perpTraders,
    errors: [leaders.error, trades.error, accounts.error].filter((e): e is string => !!e),
  };
}

// ---- Spot: holder concentration (the other paid section) --------------------------------------

export type SpotHolderRow = {
  address: string | null;
  label: string | null;
  valueUsd: number | null;
  tokenAmount: number | null;
  sharePct: number | null;
  /**
   * Round 2.1. `balance_change_24h/7d/30d` are raw **token amounts** on the wire; a change of
   * +5,614,328 next to a USD column tells a reader nothing, so each one is carried as a percent
   * of the wallet's own balance. Null means Nansen sent no figure, which is not a flat balance.
   */
  change24hPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  /** Lifetime token amounts in and out. Kept raw: the section only reads whether the out side is
   * exactly zero, which is a fact about the wallet, not a rate to be printed. */
  totalInflow: number | null;
  totalOutflow: number | null;
};

export type SpotHoldersSection = {
  holders: SpotHolderRow[] | null;
  top10SharePct: number | null;
  /**
   * Round 2.1. How many of the returned holders have never sent a single token out, and whether
   * every returned holder reports a 24h change of exactly zero.
   *
   * The second one exists because the recorded sample did exactly that on one token and not on
   * another: rather than writing a caveat into a comment nobody reads, the card states the
   * measurement it is actually looking at.
   */
  neverSentOutCount: number | null;
  allChange24hZero: boolean | null;
  /** `tgm/holders` carries its own `warnings[]`. Documented limitations, never failures — the
   * same channel discipline as flow intelligence (1.1.7). */
  warnings: string[];
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export async function spotHoldersSection(chain: string, tokenAddress: string): Promise<SpotHoldersSection> {
  const r = await settle(nansen.tokenHolders(chain, tokenAddress), (d) => {
    const amountOf = (row: Row) => pickNum(row, ["token_amount", "balance"]);
    return {
      rows: rowsOf(d).map((row): SpotHolderRow => {
        const amount = amountOf(row);
        return {
          address: pickStr(row, ["address", "holder_address", "wallet_address"]),
          label: pickStr(row, LABEL_FIELDS),
          valueUsd: pickNum(row, ["value_usd", "balance_usd", "holding_usd"]),
          tokenAmount: amount,
          // Nansen reports ownership as a percentage already.
          sharePct: pickNum(row, ["ownership_percentage", "share_of_supply", "supply_share_pct"]),
          change24hPct: balanceChangePct(pickNum(row, ["balance_change_24h"]), amount),
          change7dPct: balanceChangePct(pickNum(row, ["balance_change_7d"]), amount),
          change30dPct: balanceChangePct(pickNum(row, ["balance_change_30d"]), amount),
          totalInflow: pickNum(row, ["total_inflow"]),
          totalOutflow: pickNum(row, ["total_outflow"]),
        };
      }),
      raw: rowsOf(d),
      warnings: toFlowWarnings((d as { warnings?: unknown }).warnings),
      isLastPage: (d as { pagination?: { is_last_page?: boolean } }).pagination?.is_last_page ?? null,
    };
  });
  const holders = r.value && r.value.rows.length > 0 ? r.value.rows : null;
  const shares = (holders ?? []).slice(0, 10).map((h) => h.sharePct);
  const top10 = shares.some((s) => s !== null) ? shares.reduce((sum: number, s) => sum + (s ?? 0), 0) : null;
  const change24h = (r.value?.raw ?? []).map((row) => pickNum(row, ["balance_change_24h"])).filter((v): v is number => v !== null);
  return {
    holders,
    top10SharePct: top10,
    neverSentOutCount: holders ? holders.filter((h) => h.totalOutflow === 0).length : null,
    // Null when no row reported the figure at all: "nobody told us" is not "every holder was flat".
    allChange24hZero: change24h.length > 0 ? change24h.every((v) => v === 0) : null,
    warnings: r.value?.warnings ?? [],
    isLastPage: r.value?.isLastPage ?? null,
    credits: DEPTH_SECTION_CREDITS.spotHolders,
    errors: r.error ? [r.error] : [],
  };
}

// ---- Spot: market structure from Dexscreener (Round 1.6.1, 0 credits) --------------------------

export type SpotMarketSection = {
  structure: TokenMarketStructure | null;
  errors: string[];
};

/**
 * Pair age, short-window price change and buy/sell transaction counts, from a public source.
 *
 * Zero Nansen credits and one public request per token per minute. The 30-pool body is parsed
 * and discarded inside `lib/dexscreener/token.ts`; only the small structure above crosses the
 * bridge, and `boosts`, `socials` and `websites` are not in its schema at all.
 */
export async function spotMarketSection(chain: string, tokenAddress: string): Promise<SpotMarketSection> {
  try {
    return { structure: await tokenMarketStructure({ chain: chain as never, tokenAddress }), errors: [] };
  } catch (e) {
    return { structure: null, errors: [`Dexscreener market structure: ${e instanceof Error ? e.message : e}`] };
  }
}

// ---- Spot: the labelled trade tape (Round 2.1, 1 credit) ---------------------------------------

export type SpotTapeSection = {
  trades: TapeRow[] | null;
  /** The span the fetched page actually covers, which the card states instead of the window it
   * asked for: 100 trades on a liquid token covered fourteen minutes in the recording run. */
  spanFromIso: string | null;
  spanToIso: string | null;
  /** Rows Nansen returned, rows that earned a line, and the floor the second number used. */
  fetched: number;
  kept: number;
  minUsd: number;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

const TAPE_ACTION: Record<string, "buy" | "sell"> = { buy: "buy", sell: "sell", buys: "buy", sells: "sell" };

export async function spotTapeSection(chain: string, tokenAddress: string): Promise<SpotTapeSection> {
  const r = await settle(nansen.tokenDexTrades(chain, tokenAddress), (d) => {
    const rows = rowsOf(d).map((row): TapeRow => {
      const action = pickStr(row, ["action", "side", "trade_action"]);
      return {
        timestampIso: pickStr(row, ["block_timestamp", "timestamp"]) ?? "",
        address: pickStr(row, ["trader_address", "address", "wallet_address"]),
        label: pickStr(row, ["trader_address_label", "address_label", "label"]),
        action: action ? (TAPE_ACTION[action.trim().toLowerCase()] ?? null) : null,
        valueUsd: pickNum(row, ["estimated_value_usd", "value_usd", "usd_value"]),
        tokenAmount: pickNum(row, ["token_amount", "amount"]),
        priceUsd: pickNum(row, ["estimated_swap_price_usd", "price_usd", "price"]),
        txHash: pickStr(row, ["transaction_hash", "tx_hash"]),
        counterSymbol: pickStr(row, ["traded_token_name", "traded_token_symbol"]),
      };
    });
    return { rows, isLastPage: (d as { pagination?: { is_last_page?: boolean } }).pagination?.is_last_page ?? null };
  });

  const all = (r.value?.rows ?? []).filter((t) => t.timestampIso !== "");
  // A labelled wallet's trade is the evidence at any size; everything else clears the floor.
  const kept = all.filter((t) => tapeKeepsRow(t.label, t.valueUsd)).slice(0, TAPE_ROWS);
  const span = tapeSpan(kept);
  return {
    trades: kept.length > 0 ? kept : null,
    spanFromIso: span?.fromIso ?? null,
    spanToIso: span?.toIso ?? null,
    fetched: all.length,
    kept: kept.length,
    minUsd: TAPE_MIN_USD,
    isLastPage: r.value?.isLastPage ?? null,
    credits: DEPTH_SECTION_CREDITS.spotTape,
    errors: r.error ? [r.error] : [],
  };
}

// ---- Spot: the winners leaderboard (Round 2.1, 5 credits) --------------------------------------

export type SpotWinnerRow = {
  address: string | null;
  label: string | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  /** Nansen sends ROI as a fraction (0.0679 = 6.79%); this is the percentage. */
  roiPct: number | null;
  holdingAmount: number | null;
  holdingUsd: number | null;
  /** `max_balance_held_usd`: what the position was worth at its largest. */
  peakUsd: number | null;
  /** `still_holding_balance_ratio`, 0 to 1. Unlike the perp sibling, this one is populated on
   * spot: the recorded page runs the whole range from 0 to exactly 1. */
  stillHoldingRatio: number | null;
  tradeCount: number | null;
};

export type SpotWinnersSection = {
  winners: SpotWinnerRow[] | null;
  /** "Have the winners already sold?", weighted by peak position value. Null when the sample
   * cannot support the sentence. */
  stillHolding: StillHoldingSummary | null;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export async function spotWinnersSection(chain: string, tokenAddress: string): Promise<SpotWinnersSection> {
  const r = await settle(nansen.tokenPnlLeaderboard(chain, tokenAddress), (d) => {
    const rows = rowsOf(d).map((row): SpotWinnerRow => {
      const roi = pickNum(row, ["roi_percent_total", "roi_percent_realised", "roi_percent_realized"]);
      return {
        address: pickStr(row, ADDRESS_FIELDS),
        label: pickStr(row, LABEL_FIELDS),
        realizedPnlUsd: pickNum(row, ["pnl_usd_realised", "pnl_usd_realized", "realized_pnl_usd"]),
        unrealizedPnlUsd: pickNum(row, ["pnl_usd_unrealised", "pnl_usd_unrealized", "unrealized_pnl_usd"]),
        totalPnlUsd: pickNum(row, ["pnl_usd_total", "total_pnl_usd", "pnl_usd"]),
        roiPct: roi === null ? null : roi * 100,
        holdingAmount: pickNum(row, ["holding_amount"]),
        holdingUsd: pickNum(row, ["holding_usd"]),
        peakUsd: pickNum(row, ["max_balance_held_usd"]),
        stillHoldingRatio: pickNum(row, ["still_holding_balance_ratio"]),
        tradeCount: pickNum(row, ["nof_trades", "total_trades"]),
      };
    });
    return { rows, isLastPage: (d as { pagination?: { is_last_page?: boolean } }).pagination?.is_last_page ?? null };
  });
  const winners = r.value && r.value.rows.length > 0 ? r.value.rows : null;
  return {
    winners,
    stillHolding: winners ? stillHoldingSummary(winners) : null,
    isLastPage: r.value?.isLastPage ?? null,
    credits: DEPTH_SECTION_CREDITS.spotWinners,
    errors: r.error ? [r.error] : [],
  };
}

// ---- Spot: transfers behind the exchange flow line (Round 2.1, 1 credit) ------------------------

export type SpotTransferRow = {
  timestampIso: string;
  txHash: string | null;
  fromAddress: string | null;
  fromLabel: string | null;
  toAddress: string | null;
  toLabel: string | null;
  /** Nansen's own word for the movement ("transfer"). Rendered verbatim, never interpreted. */
  kind: string | null;
  /** A token quantity, not a dollar figure. */
  amount: number | null;
  /** Null for an unpriced token, which is a dash and never a zero. */
  valueUsd: number | null;
};

export type SpotTransfersSection = {
  transfers: SpotTransferRow[] | null;
  windowHours: number;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export async function spotTransfersSection(chain: string, tokenAddress: string): Promise<SpotTransfersSection> {
  const r = await settle(nansen.tokenTransfers(chain, tokenAddress), (d) => {
    const rows = rowsOf(d).map(
      (row): SpotTransferRow => ({
        timestampIso: pickStr(row, ["block_timestamp", "timestamp"]) ?? "",
        txHash: pickStr(row, ["transaction_hash", "tx_hash"]),
        fromAddress: pickStr(row, ["from_address", "sender"]),
        fromLabel: pickStr(row, ["from_address_label"]),
        toAddress: pickStr(row, ["to_address", "receiver"]),
        toLabel: pickStr(row, ["to_address_label"]),
        kind: pickStr(row, ["transaction_type", "transfer_type"]),
        amount: pickNum(row, ["transfer_amount", "amount"]),
        valueUsd: pickNum(row, ["transfer_value_usd", "value_usd"]),
      }),
    );
    return { rows, isLastPage: (d as { pagination?: { is_last_page?: boolean } }).pagination?.is_last_page ?? null };
  });
  const transfers = (r.value?.rows ?? []).filter((t) => t.timestampIso !== "");
  return {
    transfers: transfers.length > 0 ? transfers : null,
    windowHours: 24,
    isLastPage: r.value?.isLastPage ?? null,
    credits: DEPTH_SECTION_CREDITS.spotTransfers,
    errors: r.error ? [r.error] : [],
  };
}

// ---- Spot: open Jupiter DCA vaults (Round 2.1, 1 credit, Solana only) ---------------------------

export type SpotDcaRow = {
  address: string | null;
  label: string | null;
  /** All three are **token amounts**. No USD figure is derived from them: Nansen did not send
   * one, and inventing a dollar value for a pending order would state a price it never gave. */
  depositAmount: number | null;
  depositSpent: number | null;
  remainingAmount: number | null;
  side: string | null;
  createdAtIso: string | null;
};

export type SpotDcaSection = {
  /** `null` means the call was never made for this target (a non-Solana token); an **empty
   * array** means Nansen answered with no open vaults, which is the normal case and is not the
   * same thing. */
  vaults: SpotDcaRow[] | null;
  /** True once the call has actually been made and answered. */
  asked: boolean;
  credits: number;
  errors: string[];
};

/**
 * Jupiter's scheduled demand: the one read that sees buying nobody has done yet.
 *
 * The chain guard is **hard**. The endpoint has no chain parameter and is Solana-only, so an EVM
 * card would spend a credit to be told nothing. A non-Solana target never reaches the call and
 * the section reports `asked: false`.
 */
export async function spotDcaSection(chain: string, tokenAddress: string): Promise<SpotDcaSection> {
  if (chain.trim().toLowerCase() !== "solana") {
    return { vaults: null, asked: false, credits: 0, errors: [] };
  }
  const r = await settle(nansen.jupDca(tokenAddress), (d) =>
    rowsOf(d).map(
      (row): SpotDcaRow => ({
        address: pickStr(row, ["user_address", "address", "owner_address", "trader_address"]),
        label: pickStr(row, ["user_address_label", "address_label", "label"]),
        depositAmount: pickNum(row, ["deposit_amount", "in_deposited"]),
        depositSpent: pickNum(row, ["deposit_spent", "in_used"]),
        remainingAmount: pickNum(row, ["remaining_amount", "in_left"]),
        side: pickStr(row, ["side", "action", "direction"]),
        createdAtIso: pickStr(row, ["created_at", "block_timestamp", "open_time"]),
      }),
    ),
  );
  return {
    vaults: r.error ? null : (r.value ?? []),
    asked: true,
    credits: DEPTH_SECTION_CREDITS.spotDca,
    errors: r.error ? [r.error] : [],
  };
}

// ---- Prediction: the resting book ---------------------------------------------------------------

export type BookLevel = { price: number; size: number; cumulative: number };
/** One outcome's two sides. Polymarket books are per outcome ("Yes", "No"), not per market. */
export type OutcomeBook = { outcome: string; bids: BookLevel[]; asks: BookLevel[]; bestBid: number | null; bestAsk: number | null; spread: number | null };
export type PredictionBookSection = { books: OutcomeBook[] | null; snapshotIso: string | null; errors: string[] };

/** Levels per side that cross the bridge. The CLOB answers every resting level down to a tenth
 * of a cent; the card draws the top of the book and nothing below it. */
export const BOOK_LEVELS = 15;

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Sorted, capped, and cumulated from the touch outward, so the depth bar means "size resting
 * between the best price and here" rather than a per-level size the eye has to add up. */
function sideLevels(raw: ClobLevel[] | undefined, direction: "desc" | "asc"): BookLevel[] {
  const levels: { price: number; size: number }[] = [];
  for (const l of raw ?? []) {
    const price = toNum(l?.price);
    const size = toNum(l?.size);
    if (price === null || size === null || size <= 0) continue;
    levels.push({ price, size });
  }
  levels.sort((a, b) => (direction === "desc" ? b.price - a.price : a.price - b.price));
  let cumulative = 0;
  return levels.slice(0, BOOK_LEVELS).map((l) => {
    cumulative += l.size;
    return { price: l.price, size: l.size, cumulative };
  });
}

/**
 * Both sides of both outcomes, for free (Round 1.2.7).
 *
 * This replaced a 1-credit `prediction-market/orderbook` page that asked for 40 rows with no
 * ordering and came back 40-of-40 `('No','buy')` — one outcome, one side, so `bestAsk` and the
 * spread were structurally null. Polymarket's own CLOB answers one token's whole book,
 * unauthenticated, so the card asks it once per outcome token and pays nothing.
 *
 * The outcome names and the token ids both come from the Gamma market the card already resolved
 * and cached for an hour, so this costs no extra lookup either. A token whose book fails names
 * itself and the other outcome still renders.
 */
export async function predictionBookSection(slug: string): Promise<PredictionBookSection> {
  let market: Awaited<ReturnType<typeof resolveMarket>>["market"] = null;
  try {
    market = (await resolveMarket(slug)).market;
  } catch (e) {
    return { books: null, snapshotIso: null, errors: [`Polymarket lookup failed: ${e instanceof Error ? e.message : e}`] };
  }
  if (!market) return { books: null, snapshotIso: null, errors: ["Market not found"] };
  const dto = toMarket(market, null);
  const tokenIds = dto.clobTokenIds ?? [];
  if (tokenIds.length === 0) return { books: null, snapshotIso: null, errors: ["This market publishes no order-book tokens"] };

  let outcomes: string[] = [];
  try {
    const parsed = JSON.parse(market.outcomes ?? "null") as unknown;
    if (Array.isArray(parsed)) outcomes = parsed.map((o) => String(o));
  } catch {
    outcomes = [];
  }

  const errors: string[] = [];
  let snapshotMs: number | null = null;
  const books: OutcomeBook[] = [];
  const results = await Promise.all(
    tokenIds.map(async (id, i) => {
      const outcome = outcomes[i] ?? `Outcome ${i + 1}`;
      try {
        return { outcome, book: await clobBook(id) };
      } catch (e) {
        errors.push(`${outcome} order book: ${e instanceof Error ? e.message : e}`);
        return { outcome, book: null };
      }
    }),
  );
  for (const { outcome, book } of results) {
    if (!book) continue;
    const bids = sideLevels(book.bids, "desc");
    const asks = sideLevels(book.asks, "asc");
    if (bids.length === 0 && asks.length === 0) continue;
    const ts = toNum(book.timestamp);
    if (ts !== null && (snapshotMs === null || ts > snapshotMs)) snapshotMs = ts;
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    books.push({ outcome, bids, asks, bestBid, bestAsk, spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null });
  }
  return {
    books: books.length > 0 ? books : null,
    snapshotIso: snapshotMs !== null ? new Date(snapshotMs).toISOString() : null,
    errors,
  };
}
