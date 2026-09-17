import { pct } from "../format";
import type { PmHolder } from "../nansen-types";
import type { Signal } from "../types";

export type PredictionSignalInput = {
  outcome?: "yes" | "no";
  holders?: PmHolder[] | null;
  /** lifetime Polymarket PnL keyed by holder key (see holderKey) */
  pnl?: Record<string, number> | null;
};

/** Top holders often trade via a SAFE proxy; owner_address "0x" means none. */
export const holderKey = (h: PmHolder) =>
  h.owner_address && h.owner_address !== "0x" ? h.owner_address.toLowerCase() : h.address.toLowerCase();

/** "yes" / "no" for a Yes/No holder side (any case), else null: other outcome names ("Up",
 * a candidate's name) never count toward a Yes/No comparison. */
export function yesNoSide(side: string): "yes" | "no" | null {
  const s = side.trim().toLowerCase();
  return s === "yes" || s === "no" ? s : null;
}

/**
 * Proven-winner money per side: for each Yes/No holder with lifetime PnL > 0, weight =
 * PnL × position_size × price (current, else entry). Shared by the smart_side_disagrees
 * signal and the extension's prediction panel so the two can never disagree.
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
    const w = record * h.position_size * (h.current_price ?? h.avg_entry_price ?? 0);
    if (w <= 0) continue;
    proven++;
    if (side === "yes") yes += w;
    else no += w;
  }
  return { yes, no, proven };
}

export function predictionSignals(input: PredictionSignalInput): Signal[] {
  const { outcome, holders, pnl } = input;
  let value: number | null = null;
  let proven = 0;
  if (outcome && holders && holders.length && pnl) {
    const split = provenWinnerSplit(holders, (h) => pnl[holderKey(h)]);
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
              { endpoint: "prediction-market/pnl-by-address", field: "total_pnl_usd > 0", value: `${proven} proven` },
            ],
    },
  ];
}

