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

/** The distances from mark the Liquidations tab totals up. Cumulative: ±5% includes ±3%. */
export const LIQ_BANDS = [3, 5, 10] as const;

export type LiquidationBand = { pct: number; usd: number; count: number; longUsd: number; shortUsd: number };

/**
 * How much Smart Money money is sitting on a liquidation price within ±3%, ±5% and ±10% of
 * mark — the number that says whether a 4% candle would cascade.
 *
 * Null (rather than zeroes) when there is no mark price or no positions at all: "we don't know"
 * and "nothing is close" are different answers, and only one of them is reassuring.
 */
export function liquidationBands(positions: PerpPosition[] | null | undefined, markPrice: number | null | undefined): LiquidationBand[] | null {
  if (!markPrice || markPrice <= 0 || !positions || positions.length === 0) return null;
  return LIQ_BANDS.map((pct) => {
    const band: LiquidationBand = { pct, usd: 0, count: 0, longUsd: 0, shortUsd: 0 };
    for (const p of positions) {
      const liq = p.liquidation_price;
      if (liq === null || liq === undefined || liq <= 0) continue;
      if ((Math.abs(liq - markPrice) / markPrice) * 100 > pct) continue;
      band.usd += p.position_value_usd;
      band.count++;
      if (p.side === "Long") band.longUsd += p.position_value_usd;
      else band.shortUsd += p.position_value_usd;
    }
    return band;
  });
}

/** Distance from mark to this position's liquidation, as a signed percentage of mark. */
export function distanceToLiquidationPct(position: PerpPosition, markPrice: number | null | undefined): number | null {
  const liq = position.liquidation_price;
  if (!markPrice || markPrice <= 0 || liq === null || liq === undefined || liq <= 0) return null;
  return ((liq - markPrice) / markPrice) * 100;
}

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
