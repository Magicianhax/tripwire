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

export function predictionSignals(input: PredictionSignalInput): Signal[] {
  const { outcome, holders, pnl } = input;
  let value: number | null = null;
  let proven = 0;
  if (outcome && holders && holders.length && pnl) {
    let opp = 0;
    let all = 0;
    for (const h of holders) {
      const record = pnl[holderKey(h)];
      if (record === undefined || record <= 0) continue;
      const stake = h.position_size * (h.current_price ?? h.avg_entry_price ?? 0);
      const w = record * stake;
      if (w <= 0) continue;
      proven++;
      all += w;
      if (h.side.toLowerCase() !== outcome) opp += w;
    }
    value = all > 0 ? (opp / all) * 100 : null;
  }
  const other = outcome === "yes" ? "NO" : "YES";
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
            : "Pick YES or NO to compare with proven winners"
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

