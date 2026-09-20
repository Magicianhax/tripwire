import { pct } from "../format";
import type { PmHolder } from "../nansen-types";
import type { Signal } from "../types";

/**
 * One holder's Polymarket track record, as the card and the signal both read it.
 *
 * `pnlUsd` is **settled money only**. The figure this replaced was a sum of `total_pnl_usd`
 * across every `pnl-by-address` row including the market being judged, so an open losing
 * position in *this* market moved the weight that decides whether its holder is a "proven
 * winner" (Round 1.2.5). `realized_pnl_usd` from `prediction-market/address-summary` excludes
 * every open position by construction, which fixes that at the source (Round 1.2.8).
 *
 * Every field is nullable: a wallet the summary has never seen is a record we do not have, not
 * a record of zero.
 */
export type HolderRecord = {
  /** Settled PnL in USD. Never mixes in the unrealized value of an open position. */
  pnlUsd: number | null;
  /** Fraction, not a percentage: 0.1219 is 12.2%. */
  winRate: number | null;
  marketsWon: number | null;
  marketsTraded: number | null;
  walletAgeDays: number | null;
  /** How many settled markets the figure was summed over, when the source can say. */
  settledMarkets: number | null;
};

export const EMPTY_RECORD: HolderRecord = {
  pnlUsd: null,
  winRate: null,
  marketsWon: null,
  marketsTraded: null,
  walletAgeDays: null,
  settledMarkets: null,
};

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** `prediction-market/address-summary` -> a record. 1 credit, bought once per holder. */
export function recordFromAddressSummary(row: {
  realized_pnl_usd?: number | null;
  win_rate?: number | null;
  markets_won?: number | null;
  markets_traded?: number | null;
  wallet_age_days?: number | null;
} | null | undefined): HolderRecord {
  if (!row) return EMPTY_RECORD;
  return {
    pnlUsd: num(row.realized_pnl_usd),
    winRate: num(row.win_rate),
    marketsWon: num(row.markets_won),
    marketsTraded: num(row.markets_traded),
    walletAgeDays: num(row.wallet_age_days),
    settledMarkets: null,
  };
}

/**
 * `prediction-market/pnl-by-address` -> a record, counting **settled markets only**.
 *
 * Not on the card path (Round 1.2.8 buys the 1-credit summary instead, which carries a win rate
 * the per-market page does not). It stays because it is the only shape that can state how many
 * settled markets a figure covers, and because it is what the fixture measurement in
 * `packages/core/test/prediction-record.test.ts` pins: on the recorded wallet the all-rows sum
 * is $14,337.53 and the settled-only sum is $16,815.68, a $2,478 swing produced entirely by
 * open positions — one of which is the market being judged.
 */
export function recordFromPnlRows(
  rows: { total_pnl_usd?: number | null; market_resolved?: boolean | null }[] | null | undefined,
): HolderRecord {
  if (!rows || rows.length === 0) return EMPTY_RECORD;
  const settled = rows.filter((r) => r.market_resolved === true);
  if (settled.length === 0) return { ...EMPTY_RECORD, settledMarkets: 0 };
  let sum = 0;
  let seen = 0;
  for (const r of settled) {
    const v = num(r.total_pnl_usd);
    if (v === null) continue;
    sum += v;
    seen++;
  }
  return { ...EMPTY_RECORD, pnlUsd: seen > 0 ? sum : null, settledMarkets: settled.length };
}

/** Top holders often trade via a SAFE proxy; owner_address "0x" means none. */
export const holderKey = (h: PmHolder) =>
  h.owner_address && h.owner_address !== "0x" ? h.owner_address.toLowerCase() : h.address.toLowerCase();

/** "yes" / "no" for a Yes/No holder side (any case), else null: other outcome names ("Up",
 * a candidate's name) never count toward a Yes/No comparison.
 *
 * **Only safe when the market's outcomes really are Yes and No.** On `["BAL", "NO"]` — a live
 * NFL spread whose second outcome is New Orleans — this returns `"no"` for a side that means a
 * football team. Anything that decides what a holder is backing must use `outcomeIndexOf`
 * against the resolved market's own outcome set instead (Round 2.2).
 */
export function yesNoSide(side: string): "yes" | "no" | null {
  const s = side.trim().toLowerCase();
  return s === "yes" || s === "no" ? s : null;
}

/**
 * An outcome name, normalized for comparison only: trimmed and lower-cased.
 *
 * Never fuzzy and never a prefix match. One live event carries 329 markets whose names differ by
 * a single character ("Spread -3.5", "Spread -4.5"); a near match there picks a different trade.
 */
export const outcomeKey = (s: string): string => s.trim().toLowerCase();

/** Exactly two outcomes, named Yes then No. The only shape `yesNoSide` may be trusted on. */
export function isYesNoOutcomes(outcomes: string[] | null | undefined): boolean {
  return Array.isArray(outcomes) && outcomes.length === 2 && outcomeKey(outcomes[0]!) === "yes" && outcomeKey(outcomes[1]!) === "no";
}

/**
 * Where a side string sits in **this market's** outcome set, or null.
 *
 * The resolved market's `outcomes` array is the only authority: `outcomeIndexOf("NO", ["BAL",
 * "NO"])` is 1 (New Orleans), not "the no side". An exact, case-insensitive match or nothing —
 * and a set that repeats a name is ambiguous, so it matches nothing rather than the first one.
 */
export function outcomeIndexOf(side: string | null | undefined, outcomes: string[] | null | undefined): number | null {
  if (typeof side !== "string" || !Array.isArray(outcomes) || outcomes.length === 0) return null;
  const key = outcomeKey(side);
  if (key === "") return null;
  let found: number | null = null;
  for (let i = 0; i < outcomes.length; i++) {
    if (outcomeKey(String(outcomes[i])) !== key) continue;
    if (found !== null) return null;
    found = i;
  }
  return found;
}

/**
 * Which outcome of this market the page is buying, or null — never a guess.
 *
 * `outcomeLabel` is the raw text the venue adapter read from the market-scoped control, so it is
 * matched against the market's own outcome set first. A label that was read and does **not**
 * appear in that set resolves to nothing: the page and Gamma disagree about what this market's
 * outcomes are called, and the honest answer there is UNCHECKED. The legacy `outcome` flag is
 * only consulted on a market whose outcomes really are Yes and No.
 */
export function targetOutcomeIndex(
  t: { outcome?: "yes" | "no"; outcomeLabel?: string },
  outcomes: string[] | null | undefined,
): number | null {
  if (!Array.isArray(outcomes) || outcomes.length < 2) return null;
  const labelled = typeof t.outcomeLabel === "string" && t.outcomeLabel.trim() !== "";
  if (labelled) return outcomeIndexOf(t.outcomeLabel, outcomes);
  if (t.outcome && isYesNoOutcomes(outcomes)) return t.outcome === "yes" ? 0 : 1;
  return null;
}

/** What a position is worth now, at the current price if the response carries one, else at the
 * price its holder paid. Null when neither is known — never 0. */
export function positionValueUsd(h: PmHolder): number | null {
  const price = h.current_price ?? h.avg_entry_price;
  if (price === null || price === undefined || !Number.isFinite(price)) return null;
  if (!Number.isFinite(h.position_size)) return null;
  return h.position_size * price;
}

/**
 * Proven-winner money per side on a **Yes/No** market: for each Yes/No holder with a settled
 * record above zero, weight = record × position value.
 *
 * Kept for the two-sided callers that already read `{ yes, no }`. Anything that has the market's
 * outcome set must call `provenWinnerWeights` instead, which is the same arithmetic keyed on
 * that set rather than on the words "yes" and "no" (Round 2.2).
 */
export function provenWinnerSplit<H extends PmHolder>(
  holders: H[],
  pnlFor: (holder: H) => number | null | undefined,
): { yes: number; no: number; proven: number } {
  let yes = 0;
  let no = 0;
  let proven = 0;
  for (const h of holders) {
    const side = yesNoSide(h.side);
    if (!side) continue;
    const record = pnlFor(h);
    if (record === null || record === undefined || record <= 0) continue;
    const w = record * (positionValueUsd(h) ?? 0);
    if (w <= 0) continue;
    proven++;
    if (side === "yes") yes += w;
    else no += w;
  }
  return { yes, no, proven };
}

/** Proven-winner money per outcome of a named outcome set, plus what could not be attributed. */
export type ProvenWeights = {
  /** Index-aligned with the market's `outcomes` array. Empty when no set was given. */
  byOutcome: number[];
  /** Holders that carried weight into one of those outcomes. */
  proven: number;
  /** Weight from a proven winner whose `side` is not in the set. Reported, never folded in. */
  unmatchedUsd: number;
};

/**
 * `provenWinnerSplit` generalized to any market's own outcome set (Round 2.2).
 *
 * The side of a holder is resolved with `outcomeIndexOf`, so on `["BAL", "NO"]` a holder whose
 * side reads "NO" is counted for New Orleans and not for "the no side". A side the set does not
 * contain is never dropped silently: its weight lands in `unmatchedUsd`, which the caller has to
 * decide about rather than round away.
 */
export function provenWinnerWeights<H extends PmHolder>(
  holders: H[] | null | undefined,
  outcomes: string[] | null | undefined,
  pnlFor: (holder: H) => number | null | undefined,
): ProvenWeights {
  const byOutcome = Array.isArray(outcomes) ? outcomes.map(() => 0) : [];
  let proven = 0;
  let unmatchedUsd = 0;
  for (const h of holders ?? []) {
    const record = pnlFor(h);
    if (record === null || record === undefined || record <= 0) continue;
    const w = record * (positionValueUsd(h) ?? 0);
    if (w <= 0) continue;
    const i = outcomeIndexOf(h.side, outcomes);
    if (i === null) {
      unmatchedUsd += w;
      continue;
    }
    byOutcome[i]! += w;
    proven++;
  }
  return { byOutcome, proven, unmatchedUsd };
}

/**
 * How the *sampled* holders' money is split between the two sides, and how much of it sits in
 * the ten largest positions (Round 1.2.6).
 *
 * This describes the rows the response returned — the largest tracked holders — and nothing
 * else. It is not "of Yes" and not "of the market": the caller's copy has to name the sample,
 * because Polymarket's real holder count is far larger than any page of it.
 */
export type SideTotals = {
  /** Yes/No markets only. Null on any other outcome set, so "NO" (New Orleans) never lands here. */
  yesUsd: number | null;
  noUsd: number | null;
  otherUsd: number | null;
  /** Holders in the sample, whatever their side. */
  sample: number;
  /** Holders whose position could be valued at all. */
  valued: number;
  /** Share of the valued sample's money held by its ten largest positions, 0-100. */
  top10SharePct: number | null;
  /**
   * Money per outcome, index-aligned with the market's `outcomes` array (Round 2.2). Null when
   * the caller did not hand over an outcome set, which is the only case where the two-sided
   * fields above are the whole story.
   */
  byOutcome: number[] | null;
  /** Valued money whose side is in no outcome of the set. Null when there is no set. */
  unmatchedUsd: number | null;
};

/**
 * How the sampled holders' money splits, either across the market's own outcome set or — with no
 * set to hand — across Yes and No.
 *
 * With `outcomes` given, `byOutcome` is the authority and `yesUsd`/`noUsd` are filled **only**
 * when that set really is Yes then No. A `["BAL", "NO"]` market therefore reports its two teams
 * in `byOutcome` and leaves the Yes/No fields null, rather than filing New Orleans under "no".
 */
export function sideTotals(holders: PmHolder[] | null | undefined, outcomes?: string[] | null): SideTotals {
  const named = Array.isArray(outcomes) && outcomes.length > 0;
  const twoSided = !named || isYesNoOutcomes(outcomes);
  const empty: SideTotals = {
    yesUsd: null,
    noUsd: null,
    otherUsd: null,
    sample: 0,
    valued: 0,
    top10SharePct: null,
    byOutcome: named ? outcomes!.map(() => 0) : null,
    unmatchedUsd: named ? 0 : null,
  };
  if (!holders || holders.length === 0) return empty;
  let yesUsd: number | null = null;
  let noUsd: number | null = null;
  let otherUsd: number | null = null;
  const byOutcome = named ? outcomes!.map(() => 0) : null;
  let unmatchedUsd = named ? 0 : null;
  const values: number[] = [];
  for (const h of holders) {
    const v = positionValueUsd(h);
    if (v === null) continue;
    values.push(v);
    if (named) {
      const i = outcomeIndexOf(h.side, outcomes);
      if (i === null) unmatchedUsd = (unmatchedUsd ?? 0) + v;
      else byOutcome![i]! += v;
    }
    if (!twoSided) continue;
    const side = yesNoSide(h.side);
    if (side === "yes") yesUsd = (yesUsd ?? 0) + v;
    else if (side === "no") noUsd = (noUsd ?? 0) + v;
    else otherUsd = (otherUsd ?? 0) + v;
  }
  if (values.length === 0) return { ...empty, sample: holders.length };
  const total = values.reduce((s, v) => s + v, 0);
  const top10 = [...values].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0);
  return {
    yesUsd,
    noUsd,
    otherUsd,
    sample: holders.length,
    valued: values.length,
    top10SharePct: total > 0 ? (top10 / total) * 100 : null,
    byOutcome,
    unmatchedUsd,
  };
}

export type PredictionSignalInput = {
  /** Legacy Yes/No flag. Only consulted when the market's outcomes really are Yes then No. */
  outcome?: "yes" | "no";
  /** The resolved market's own outcome set, in Gamma's order. */
  outcomes?: string[] | null;
  /** Which outcome of that set the page is buying, from `targetOutcomeIndex`. */
  outcomeIndex?: number | null;
  holders?: PmHolder[] | null;
  /** Settled Polymarket record keyed by holder key (see holderKey). */
  records?: Record<string, HolderRecord> | null;
};

/** The outcome set the signal reasons over: what the market says, else Yes/No when a legacy
 * Yes/No flag is all the caller has. Null when neither is known. */
function signalOutcomes(input: PredictionSignalInput): string[] | null {
  if (Array.isArray(input.outcomes) && input.outcomes.length >= 2) return input.outcomes;
  return input.outcome ? ["Yes", "No"] : null;
}

/**
 * What the opposing money is called, for the sentence. Two outcomes have a name for the other
 * one; three or more do not, and "the other outcomes" is the only true way to say it.
 */
function opposingName(outcomes: string[] | null, index: number): string {
  if (!outcomes) return "the other side";
  if (outcomes.length === 2) return String(outcomes[index === 0 ? 1 : 0]);
  return "the other outcomes";
}

/**
 * `smart_side_disagrees`: the share of proven-winner money sitting on anything other than the
 * outcome the page is buying.
 *
 * Round 2.2 widened the input from Yes/No to any outcome set. **The mapping did not move** — the
 * 50 / 70 boundaries and the `null` → UNCHECKED rule are exactly what Round 1.2 shipped, and
 * `docs/CALIBRATION.md` §8 owns the measurement that would let them move. What changed is that a
 * market whose outcomes are `["BAL", "NO"]` now produces a value at all, computed against its own
 * two teams instead of being blanked as "not a Yes/No market".
 */
export function predictionSignals(input: PredictionSignalInput): Signal[] {
  const { holders, records } = input;
  const outcomes = signalOutcomes(input);
  const index = input.outcomeIndex ?? (input.outcome && isYesNoOutcomes(outcomes) ? (input.outcome === "yes" ? 0 : 1) : null);
  let value: number | null = null;
  let proven = 0;
  let checked = 0;
  if (index !== null && outcomes && holders && holders.length && records) {
    checked = Object.values(records).filter((r) => r.pnlUsd !== null).length;
    const split = provenWinnerWeights(holders, outcomes, (h) => records[holderKey(h)]?.pnlUsd);
    proven = split.proven;
    // Money on a side this market does not list is not "the other outcome": it is weight we
    // cannot attribute, so it stays out of both halves of the ratio.
    const all = split.byOutcome.reduce((sum, v) => sum + v, 0);
    const opp = all - (split.byOutcome[index] ?? 0);
    value = all > 0 ? (opp / all) * 100 : null;
  }
  const prompt = outcomes && outcomes.length === 2 ? `Pick ${outcomes[0]} or ${outcomes[1]} to compare with proven winners` : "Pick an outcome to compare with proven winners";
  return [
    {
      id: "smart_side_disagrees",
      kind: "prediction",
      value,
      severity: value !== null && value > 70 ? "high" : value !== null && value > 50 ? "warn" : "info",
      label: value === null ? (index !== null ? "No proven winners among top holders" : prompt) : `${pct(value)} of proven-winner money is on ${opposingName(outcomes, index!)}`,
      evidence:
        value === null
          ? []
          : [
              { endpoint: "prediction-market/top-holders", field: "position_size × price", value: `${holders!.length} holders` },
              // Says what was bought and what came back, so the line can never imply a longer
              // record than the number of wallets whose record we actually hold.
              { endpoint: "prediction-market/address-summary", field: "realized_pnl_usd > 0", value: `${proven} proven of ${checked} checked` },
            ],
    },
  ];
}
