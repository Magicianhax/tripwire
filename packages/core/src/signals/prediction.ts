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
 * a candidate's name) never count toward a Yes/No comparison. */
export function yesNoSide(side: string): "yes" | "no" | null {
  const s = side.trim().toLowerCase();
  return s === "yes" || s === "no" ? s : null;
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
 * Proven-winner money per side: for each Yes/No holder with a settled record above zero,
 * weight = record × position value. Shared by the smart_side_disagrees signal and the
 * extension's prediction panel so the two can never disagree.
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

/**
 * How the *sampled* holders' money is split between the two sides, and how much of it sits in
 * the ten largest positions (Round 1.2.6).
 *
 * This describes the rows the response returned — the largest tracked holders — and nothing
 * else. It is not "of Yes" and not "of the market": the caller's copy has to name the sample,
 * because Polymarket's real holder count is far larger than any page of it.
 */
export type SideTotals = {
  yesUsd: number | null;
  noUsd: number | null;
  otherUsd: number | null;
  /** Holders in the sample, whatever their side. */
  sample: number;
  /** Holders whose position could be valued at all. */
  valued: number;
  /** Share of the valued sample's money held by its ten largest positions, 0-100. */
  top10SharePct: number | null;
};

export function sideTotals(holders: PmHolder[] | null | undefined): SideTotals {
  const empty: SideTotals = { yesUsd: null, noUsd: null, otherUsd: null, sample: 0, valued: 0, top10SharePct: null };
  if (!holders || holders.length === 0) return empty;
  let yesUsd: number | null = null;
  let noUsd: number | null = null;
  let otherUsd: number | null = null;
  const values: number[] = [];
  for (const h of holders) {
    const v = positionValueUsd(h);
    if (v === null) continue;
    values.push(v);
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
  };
}

export type PredictionSignalInput = {
  outcome?: "yes" | "no";
  holders?: PmHolder[] | null;
  /** Settled Polymarket record keyed by holder key (see holderKey). */
  records?: Record<string, HolderRecord> | null;
};

export function predictionSignals(input: PredictionSignalInput): Signal[] {
  const { outcome, holders, records } = input;
  let value: number | null = null;
  let proven = 0;
  let checked = 0;
  if (outcome && holders && holders.length && records) {
    checked = Object.values(records).filter((r) => r.pnlUsd !== null).length;
    const split = provenWinnerSplit(holders, (h) => records[holderKey(h)]?.pnlUsd);
    proven = split.proven;
    const all = split.yes + split.no;
    const opp = outcome === "yes" ? split.no : split.yes;
    value = all > 0 ? (opp / all) * 100 : null;
  }
  const other = outcome === "yes" ? "No" : "Yes";
  return [
    {
      id: "smart_side_disagrees",
      kind: "prediction",
      value,
      severity: value !== null && value > 70 ? "high" : value !== null && value > 50 ? "warn" : "info",
      label:
        value === null
          ? outcome
            ? "No proven winners among top holders"
            : "Pick Yes or No to compare with proven winners"
          : `${pct(value)} of proven-winner money is on ${other}`,
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
