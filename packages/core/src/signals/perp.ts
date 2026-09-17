import { pct, usd } from "../format";
import type { PerpPosition, PerpScreenerRow } from "../nansen-types";
import type { Signal } from "../types";

export type PerpSignalInput = {
  side?: "long" | "short";
  screener?: PerpScreenerRow | null;
  positions?: PerpPosition[] | null;
  markPrice?: number | null;
};

export const LIQ_BAND_PCT = 3;

export function perpSignals(input: PerpSignalInput): Signal[] {
  const out: Signal[] = [];
  const s = input.screener;
  const longs = s?.current_smart_money_position_longs_usd ?? null;
  const shorts = s?.current_smart_money_position_shorts_usd ?? null;
  const total = longs !== null && shorts !== null ? longs + Math.abs(shorts) : 0;

  let opp: number | null = null;
  if (input.side && longs !== null && shorts !== null && total > 0) {
    opp = ((input.side === "long" ? Math.abs(shorts) : longs) / total) * 100;
  }
  const oppWord = input.side === "long" ? "short" : "long";
  out.push({
    id: "sm_opposite_side_pct",
    kind: "perp",
    value: opp,
    severity: opp !== null && opp > 70 ? "high" : opp !== null && opp > 50 ? "warn" : "info",
    label:
      opp === null
        ? input.side
          ? "Smart Money positioning unavailable"
          : "Pick long or short to compare with Smart Money"
        : `${pct(opp)} of Smart Money is ${oppWord}`,
    evidence:
      longs === null
        ? []
        : [
            { endpoint: "perp-screener", field: "current_smart_money_position_longs_usd", value: usd(longs) },
            { endpoint: "perp-screener", field: "current_smart_money_position_shorts_usd", value: usd(Math.abs(shorts ?? 0)) },
          ],
  });

  const mark = input.markPrice ?? s?.mark_price ?? null;
  let band: number | null = null;
  let count = 0;
  if (mark && input.positions && input.positions.length) {
    band = 0;
    for (const p of input.positions) {
      if (p.liquidation_price === null || p.liquidation_price <= 0) continue;
      if ((Math.abs(p.liquidation_price - mark) / mark) * 100 <= LIQ_BAND_PCT) {
        band += p.position_value_usd;
        count++;
      }
    }
  }
  out.push({
    id: "inside_liq_band",
    kind: "perp",
    value: band,
    severity: band !== null && band > 1_000_000 ? "warn" : "info",
    label:
      band === null
        ? "Smart Money liquidation levels unavailable"
        : `${usd(band)} of Smart Money liquidates within ±${LIQ_BAND_PCT}% (${count} positions)`,
    evidence: band === null ? [] : [{ endpoint: "tgm/perp-positions", field: "liquidation_price", value: `${count} within ±${LIQ_BAND_PCT}% of ${mark}` }],
  });
  return out;
}
