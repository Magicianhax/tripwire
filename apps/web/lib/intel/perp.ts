import {
  perpSignals,
  type PerpPosition,
  type PerpPositionIntelligence,
  type PerpScreenerRow,
  type PerpTarget,
  type PerpTrade,
  type Signal,
} from "@tripwire/core";
import { nansen, PERP_PNL_WINDOW_DAYS } from "../nansen/endpoints";
import { settle } from "./util";

export type PerpPanel = {
  coin: string;
  /**
   * Which load this panel came from. A chip-mode panel can reach the card — the runner carries
   * its cheap result into the popover while the panel fetch is in flight — so the sections that
   * only panel mode pays for must be able to tell "not asked for" from "asked, and empty".
   */
  mode: "chip" | "panel";
  screener: PerpScreenerRow | null;
  positions: PerpPosition[] | null;
  /**
   * Whether `tgm/perp-positions` said its 50-row page was the whole population (Round 1.3.7).
   * Null when the response carried no `pagination` block at all — which is a third answer, not
   * a synonym for "complete".
   */
  positionsIsLastPage: boolean | null;
  /** How many rows that page actually returned, so the ladder's aside states its own sample. */
  positionsReturned: number | null;
  trades: PerpTrade[] | null;
  /** smart-trader / whale / public-figure exposure. Panel mode only: it costs a credit. */
  cohorts: PerpPositionIntelligence | null;
  /** When the cohort row was read, so the section can state its as-of rather than imply "now". */
  cohortsAtIso: string | null;
  /**
   * Why the opens strip is empty, when it is. Kept out of `errors` on purpose: `panel.errors`
   * drives the card's "Unavailable:" list and reads as the whole check having failed, and a
   * strip that could not load is a section-level gap, not a broken verdict (Round 1.3.4).
   */
  tradesError: string | null;
  cohortsError: string | null;
  errors: string[];
};

export async function buildPerpIntel(t: PerpTarget, mode: "chip" | "panel"): Promise<{ signals: Signal[]; panel: PerpPanel }> {
  const coin = t.coin.toUpperCase();
  const [screener, positions, trades, cohorts] = await Promise.all([
    settle(nansen.perpScreener(coin), (d) => d.data?.find((r) => r.token_symbol?.toUpperCase() === coin) ?? d.data?.[0]),
    settle(nansen.perpPositions(coin), (d) => d),
    mode === "panel" ? settle(nansen.smPerpTrades(coin), (d) => d.data) : Promise.resolve(null),
    // 1 credit, panel only — never the chip.
    mode === "panel" ? settle(nansen.positionIntelligence(coin), (d) => d.data?.[0] ?? null) : Promise.resolve(null),
  ]);
  const rows = positions.value?.data ?? null;
  const markPrice = screener.value?.mark_price ?? rows?.[0]?.mark_price ?? null;
  return {
    signals: perpSignals({ side: t.side, screener: screener.value, positions: rows, markPrice }),
    panel: {
      coin,
      mode,
      screener: screener.value,
      positions: rows,
      positionsIsLastPage: positions.value?.pagination?.is_last_page ?? null,
      positionsReturned: rows?.length ?? null,
      trades: trades?.value ?? null,
      cohorts: cohorts?.value ?? null,
      cohortsAtIso: cohorts?.value ? new Date().toISOString() : null,
      tradesError: trades?.error ?? null,
      cohortsError: cohorts?.error ?? null,
      // Only the two calls the verdict rests on. A failed strip or cohort row must not make a
      // healthy check read as a broken one.
      errors: [screener.error, positions.error].filter((e): e is string => !!e),
    },
  };
}

// ---- Round 2.5: one trader's win rate, bought a click at a time -------------------------------

export type PerpWinRate = {
  address: string;
  /** 0-1 as Nansen reports it, or null. Never rounded into a claim it did not make. */
  winRate: number | null;
  closedTrades: number | null;
  winningTrades: number | null;
  realizedPnlUsd: number | null;
  /** A percentage, converted from Nansen's fraction. */
  realizedPnlPct: number | null;
  tradedCoinCount: number | null;
  /** The window the figure covers, which is the same 30 days the leaderboard beside it uses. */
  windowDays: number;
  credits: number;
  error: string | null;
};

/** Measured: `profiler/perp-pnl-summary` bills 1. */
export const PERP_WIN_RATE_CREDITS = 1;

/**
 * The win rate behind one leaderboard row.
 *
 * **An explicit click, never a hover.** The leaderboard is twelve rows in the expanded card, so
 * a hover trigger would be twelve credits from one careless mouse pass across the table — the
 * same trap Round 1.5 hit from the other direction with view activation. The button states its
 * price before it is pressed.
 *
 * The window is `PERP_PNL_WINDOW_DAYS`, which is what `perpPnlLeaderboard` already asks for, so
 * the win rate and the PnL it sits beside describe the same 30 days rather than two periods
 * that happen to share a row. The leaderboard's own response carries no win-rate field at all.
 */
export async function buildPerpWinRate(address: string): Promise<PerpWinRate> {
  const r = await settle(nansen.perpPnlSummary(address), (d) => d.data);
  const s = r.value;
  const pct = s?.realized_pnl_percent;
  return {
    address,
    winRate: s?.win_rate ?? null,
    closedTrades: s?.closed_trade_count ?? null,
    winningTrades: s?.winning_trade_count ?? null,
    realizedPnlUsd: s?.realized_pnl_usd ?? null,
    realizedPnlPct: typeof pct === "number" && Number.isFinite(pct) ? pct * 100 : null,
    tradedCoinCount: s?.traded_coin_count ?? null,
    windowDays: PERP_PNL_WINDOW_DAYS,
    credits: PERP_WIN_RATE_CREDITS,
    error: r.error,
  };
}
