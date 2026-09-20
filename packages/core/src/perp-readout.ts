/**
 * Readout logic for the perp card (Round 1.3), the sibling of `spot-readout.ts`.
 *
 * Nothing here fetches and nothing here feeds a verdict. These are the small decisions about
 * what a perp field *means* that the card would otherwise make inline — and the reason they sit
 * in core is that the one they got wrong (a null Smart Money row painting an even bar) was
 * invisible to both suites because it lived in a JSX default.
 */
import type { PerpPositionIntelligence, PerpScreenerRow, PerpTrade } from "./nansen-types";

// --- Smart Money long/short (1.3.1) ----------------------------------------------------------

/**
 * The three things a long/short split can be, kept apart on purpose:
 *
 * - `unknown` — Nansen returned no position figures at all. The card must say so; it must not
 *   draw half a mint bar and half a red one, which reads as "the market is evenly split" and is
 *   the exact opposite of what we know.
 * - `empty` — Nansen answered, and the answer is that no Smart Money is positioned here. That
 *   is a fact, and a different one from not knowing.
 * - `split` — real money on at least one side, so a percentage means something.
 *
 * The guard is on both figures being null, **not** on the total being zero: a genuinely
 * balanced market (equal longs and shorts) is a real 50/50 and has to survive.
 */
export type LongShortSplit =
  | { state: "unknown" }
  | { state: "empty" }
  | {
      state: "split";
      longUsd: number;
      shortUsd: number;
      longPct: number;
      shortPct: number;
      /** Null when Nansen reported the side's money but not its wallet count. */
      longCount: number | null;
      shortCount: number | null;
    };

const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function smartMoneyLongShort(screener: PerpScreenerRow | null | undefined): LongShortSplit {
  const longs = finite(screener?.current_smart_money_position_longs_usd);
  const shorts = finite(screener?.current_smart_money_position_shorts_usd);
  if (longs === null && shorts === null) return { state: "unknown" };
  const longUsd = longs ?? 0;
  // Nansen reports the short side as a negative number; the bar needs its magnitude.
  const shortUsd = Math.abs(shorts ?? 0);
  const total = longUsd + shortUsd;
  if (total === 0) return { state: "empty" };
  const longPct = (longUsd / total) * 100;
  return {
    state: "split",
    longUsd,
    shortUsd,
    longPct,
    shortPct: 100 - longPct,
    longCount: finite(screener?.smart_money_longs_count),
    shortCount: finite(screener?.smart_money_shorts_count),
  };
}

// --- Three cohorts, three scales (1.3.3) -----------------------------------------------------

export const POSITION_COHORT_IDS = ["smart_trader", "whale", "public_figure"] as const;
export type PositionCohortId = (typeof POSITION_COHORT_IDS)[number];

export const POSITION_COHORT_NAMES: Record<PositionCohortId, string> = {
  smart_trader: "Smart traders",
  whale: "Whales",
  public_figure: "Public figures",
};

export type PositionCohort = {
  id: PositionCohortId;
  name: string;
  /** `unknown` when this cohort's two figures are both null — never an even bar. */
  state: "unknown" | "empty" | "split";
  longsUsd: number | null;
  shortsUsd: number | null;
  /** Longs **plus** shorts, which is what Nansen's `*_total_usd` is. Never a net figure. */
  grossUsd: number | null;
  longPct: number | null;
};

/**
 * One bar per cohort, each normalised to **its own** gross total.
 *
 * Whale exposure runs about ten times the smart-trader figure on the recorded ETH row
 * ($2.13B against $108M), so a shared scale would flatten the smart bar into a sliver and
 * the one cohort the product is named after would become unreadable.
 */
export function positionCohorts(row: PerpPositionIntelligence | null | undefined): PositionCohort[] {
  return POSITION_COHORT_IDS.map((id) => {
    const longsUsd = finite(row?.[`${id}_longs_usd`]);
    const shortsUsd = finite(row?.[`${id}_shorts_usd`]);
    const name = POSITION_COHORT_NAMES[id];
    if (longsUsd === null && shortsUsd === null) {
      return { id, name, state: "unknown" as const, longsUsd: null, shortsUsd: null, grossUsd: null, longPct: null };
    }
    const longs = longsUsd ?? 0;
    const shorts = Math.abs(shortsUsd ?? 0);
    const summed = longs + shorts;
    // Nansen states the gross itself; the sum is the fallback, and a test pins that the two agree.
    const grossUsd = finite(row?.[`${id}_total_usd`]) ?? summed;
    if (summed === 0) return { id, name, state: "empty" as const, longsUsd, shortsUsd, grossUsd, longPct: null };
    return { id, name, state: "split" as const, longsUsd, shortsUsd, grossUsd, longPct: (longs / summed) * 100 };
  });
}

// --- The 5-credit trade call, repointed (1.3.4) ----------------------------------------------

/** How far back "opened in the last hour" reaches. */
export const OPENS_WINDOW_MS = 60 * 60_000;

/** `action` values that mean a position was newly opened, rather than added to or cut. */
const OPEN_ACTIONS = new Set(["open"]);

export type PerpOpens = {
  /** Opens inside the window, newest first. */
  opens: PerpTrade[];
  /** Every open in the response, however old — so an empty window can say when the last one was. */
  latestOpenIso: string | null;
  /** How many trades the response carried at all, for the empty line's own sentence. */
  tradeCount: number;
};

const timeOf = (t: PerpTrade): number => {
  const iso = t?.block_timestamp;
  if (typeof iso !== "string" || iso === "") return Number.NaN;
  // Nansen stamps these UTC with a trailing Z; a stamp without one is still UTC, not local.
  const ms = Date.parse(/[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? ms : Number.NaN;
};

/**
 * `smart-money/perp-trades` already costs 5 credits on every panel open and nothing rendered it.
 * It carries `action`, so the 24h page it returns filters down to the positions opened in the
 * last hour — the one thing in it a reader could act on.
 */
export function recentOpens(trades: PerpTrade[] | null | undefined, nowMs: number, windowMs = OPENS_WINDOW_MS): PerpOpens {
  const rows = Array.isArray(trades) ? trades : [];
  const allOpens = rows
    .filter((t) => OPEN_ACTIONS.has(String(t?.action ?? "").trim().toLowerCase()))
    .map((t) => ({ trade: t, ms: timeOf(t) }))
    .filter((t) => Number.isFinite(t.ms))
    .sort((a, b) => b.ms - a.ms);
  return {
    opens: allOpens.filter((t) => nowMs - t.ms <= windowMs && nowMs - t.ms >= -windowMs).map((t) => t.trade),
    latestOpenIso: allOpens[0]?.trade.block_timestamp ?? null,
    tradeCount: rows.length,
  };
}

// --- Is the ladder the whole set? (1.3.7) ----------------------------------------------------

/**
 * The aside above the position ladder. `tgm/perp-positions` asks for 50 rows and the response
 * says whether that was the whole population; without the flag "6 of 50" claims a completeness
 * nobody checked.
 */
export function positionLadderAside(shown: number, returned: number, isLastPage: boolean | null | undefined): string {
  if (isLastPage === true) return `${shown} of ${returned}`;
  if (isLastPage === false) return `${shown} of the ${returned} largest returned`;
  return `${shown} of ${returned} returned`;
}

// --- Hyperliquid account fields already on the wire (1.3.8) ----------------------------------

/**
 * `cumFunding` is signed from the account's point of view: Hyperliquid credits a negative
 * number when the account **paid** funding. Printing the raw figure beside a "funding" label
 * would leave a reader to guess which way it ran, and half of them would guess wrong.
 */
export type FundingFlow = { direction: "paid" | "received" | "flat" | "unknown"; usd: number | null; text: string };

export function fundingFlow(cumFunding: number | null | undefined): FundingFlow {
  const v = finite(cumFunding);
  if (v === null) return { direction: "unknown", usd: null, text: "Funding unavailable" };
  if (v === 0) return { direction: "flat", usd: 0, text: "No funding either way" };
  if (v < 0) return { direction: "paid", usd: Math.abs(v), text: "paid in funding" };
  return { direction: "received", usd: v, text: "received in funding" };
}

/**
 * Notional over account value: how levered the **account** is right now, which is a different
 * number from the `leverage.value` a trader configured on any one position. Both are rendered,
 * and they carry different labels, because 3.8x account-wide and "cross 30x" on the BTC leg are
 * both true at the same time.
 */
export function accountLeverage(totalNotionalUsd: number | null | undefined, accountValueUsd: number | null | undefined): number | null {
  const ntl = finite(totalNotionalUsd);
  const equity = finite(accountValueUsd);
  if (ntl === null || equity === null || equity <= 0) return null;
  return ntl / equity;
}

/**
 * What is left above the maintenance requirement, as a share of account value.
 *
 * This is **not** a liquidation forecast: Hyperliquid reports `liquidationPx: null` for a cross
 * position precisely because no single price liquidates it, and the copy beside this figure has
 * to say so rather than implying a level.
 */
export function maintenanceBufferPct(accountValueUsd: number | null | undefined, maintenanceUsd: number | null | undefined): number | null {
  const equity = finite(accountValueUsd);
  const maintenance = finite(maintenanceUsd);
  if (equity === null || maintenance === null || equity <= 0) return null;
  return ((equity - maintenance) / equity) * 100;
}
