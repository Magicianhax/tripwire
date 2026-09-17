import { pctVol, usd } from "../format";
import type { FlowRow, IndicatorsResp, NetflowRow } from "../nansen-types";
import type { Signal } from "../types";

export type SpotSignalInput = {
  flow?: FlowRow | null;
  netflow?: NetflowRow | null;
  indicators?: IndicatorsResp | null;
  author?: { entity: string; valueUsd: number } | null;
  /** 24h spot volume in USD (`tgm/token-information` -> `spot_metrics.volume_total_usd`). The
   * denominator every flow signal is normalized by; `null` means we could not measure it. */
  vol24?: number | null;
  /** Price change over 7 days, in percent. */
  priceChange7dPct?: number | null;
  /** Price change over 24 hours, in percent: the fallback when a token has no 7d history. */
  priceChange24hPct?: number | null;
};

const FLOW = "tgm/flow-intelligence";
const TOKEN_INFO = "tgm/token-information";
const OHLCV = "tgm/token-ohlcv";

/**
 * Risk indicator types that describe the token itself. `cex-flows` and `btc-reflexivity` are
 * deliberately outside it: the first is a flow story already told (and far better) by
 * `labeled_exit_pct`, the second is market beta rather than token-specific danger.
 *
 * `risk_high_count` is not in any shipped preset (see rules/presets.ts) because with this set it
 * scored 0 on every token in the calibration sample.
 */
export const TOKEN_RISKS = new Set(["concentration-risk", "liquidity-risk", "token-supply-inflation"]);

// --- Activity guards (docs/CALIBRATION.md §4.1) -------------------------------------------
/** Below this much 24h volume, a percentage of volume is noise. */
export const MIN_VOL24_USD = 250_000;
/** Labeled segments must have moved at least this share of 24h volume to be worth reading. */
export const MIN_LABELED_GROSS_SHARE = 0.005;
/** Wallets behind a labeled flow before it can warn, and before it can block. */
export const MIN_WALLETS_WARN = 3;
export const MIN_WALLETS_BLOCK = 5;
/** Smart Money traders behind a netflow number before it can warn. */
export const MIN_SM_TRADERS = 3;
/** Fresh-wallet inflow must be at least this share of 24h volume to count as absorption. */
export const MIN_FRESH_SHARE = 0.005;

/**
 * Nansen returns null net flow when a segment had no wallets in the window.
 * With wallet_count 0 that is a real zero; with a null count it is missing data.
 */
function seg(value: number | null, count: number | null): number | null {
  if (value !== null) return value;
  return count === 0 ? 0 : null;
}

/** `avg_flow_usd × wallet_count` for one segment: the two-sided turnover it accounts for. */
function gross(avg: number | null | undefined, count: number | null | undefined): number {
  if (typeof avg !== "number" || !Number.isFinite(avg) || typeof count !== "number" || !Number.isFinite(count)) return 0;
  return Math.abs(avg) * count;
}

const wallets = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** "$287K of $2.0M": the numerator and the denominator, because a percentage of volume only
 * means something with the volume beside it. */
const ofVolume = (value: number, vol24: number) => `${usd(Math.abs(value))} of ${usd(vol24)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export type SpotDerived = {
  /** Labeled (smart trader + whale + public figure) net USD flow over the rule window. */
  labeledUsd: number | null;
  labeledWallets: number;
  labeledGrossUsd: number;
  freshUsd: number | null;
  /** Fresh-wallet inflow ÷ labeled outflow, only when labeled wallets are net sellers. */
  absorption: number | null;
  vol24: number | null;
  minActivity: boolean;
};

/** The intermediate figures behind the spot signals, exposed so the evidence card can show the
 * dollars and the absorption ratio next to the percentages. */
export function spotDerived(input: SpotSignalInput): SpotDerived {
  const f = input.flow ?? null;
  const vol24 = typeof input.vol24 === "number" && Number.isFinite(input.vol24) && input.vol24 > 0 ? input.vol24 : null;
  if (!f) return { labeledUsd: null, labeledWallets: 0, labeledGrossUsd: 0, freshUsd: null, absorption: null, vol24, minActivity: false };

  const stSeg = seg(f.smart_trader_net_flow_usd, f.smart_trader_wallet_count);
  const whSeg = seg(f.whale_net_flow_usd, f.whale_wallet_count);
  const pfSeg = seg(f.public_figure_net_flow_usd, f.public_figure_wallet_count);
  const allMissing = stSeg === null && whSeg === null && pfSeg === null;
  const labeledUsd = allMissing ? null : (stSeg ?? 0) + (whSeg ?? 0) + (pfSeg ?? 0);
  const labeledWallets = wallets(f.smart_trader_wallet_count) + wallets(f.whale_wallet_count) + wallets(f.public_figure_wallet_count);
  const labeledGrossUsd =
    gross(f.smart_trader_avg_flow_usd, f.smart_trader_wallet_count) +
    gross(f.whale_avg_flow_usd, f.whale_wallet_count) +
    gross(f.public_figure_avg_flow_usd, f.public_figure_wallet_count);
  const freshUsd = seg(f.fresh_wallets_net_flow_usd, f.fresh_wallets_wallet_count);

  const minActivity = vol24 !== null && vol24 >= MIN_VOL24_USD && labeledGrossUsd >= MIN_LABELED_GROSS_SHARE * vol24;
  const freshAbsorbing = vol24 !== null && freshUsd !== null && freshUsd > 0 && freshUsd >= MIN_FRESH_SHARE * vol24;
  const absorption = labeledUsd !== null && labeledUsd < 0 && freshAbsorbing ? freshUsd! / -labeledUsd : null;

  return { labeledUsd, labeledWallets, labeledGrossUsd, freshUsd, absorption, vol24, minActivity };
}

/**
 * Spot signals, all four flow/price ones normalized against 24h volume (docs/CALIBRATION.md).
 *
 * Two things the guards deliberately do:
 * - a guard that *fails on real data* yields 0, not null: "labeled wallets barely traded" is an
 *   answer, and a quiet token is CLEAR rather than UNCHECKED;
 * - a guard that cannot be *evaluated* (no flow row, no volume denominator) yields null, which
 *   is UNCHECKED. Missing data is never CLEAR.
 */
export function spotSignals(input: SpotSignalInput): Signal[] {
  const out: Signal[] = [];
  const d = spotDerived(input);
  const { vol24, labeledUsd, labeledWallets, labeledGrossUsd, freshUsd, absorption, minActivity } = d;

  const flowEvidence = [
    { endpoint: FLOW, field: "smart_trader_net_flow_usd", value: usd(input.flow?.smart_trader_net_flow_usd ?? null, true) },
    { endpoint: FLOW, field: "whale_net_flow_usd", value: usd(input.flow?.whale_net_flow_usd ?? null, true) },
    { endpoint: FLOW, field: "public_figure_net_flow_usd", value: usd(input.flow?.public_figure_net_flow_usd ?? null, true) },
    { endpoint: TOKEN_INFO, field: "spot_metrics.volume_total_usd", value: usd(vol24) },
  ];

  // --- labeled_exit_pct: labeled money's net flow as a share of the day's volume -----------
  if (labeledUsd === null || vol24 === null) {
    out.push(unavailable("labeled_exit_pct", labeledUsd === null ? "Labeled wallet flow unavailable" : "24h volume unavailable, so flows can't be sized"));
    out.push(unavailable("distribution_pct", labeledUsd === null ? "Labeled wallet flow unavailable" : "24h volume unavailable, so flows can't be sized"));
  } else {
    const quiet = `Not enough labeled trading to judge (${plural(labeledWallets, "wallet")}, ${pctVol((labeledGrossUsd / vol24) * 100)} of 24h volume)`;
    const enoughWarn = minActivity && labeledWallets >= MIN_WALLETS_WARN;
    const exitPct = enoughWarn ? (labeledUsd / vol24) * 100 : 0;

    out.push({
      id: "labeled_exit_pct",
      kind: "spot",
      value: exitPct,
      severity: exitPct < -1 ? "high" : exitPct < 0 ? "warn" : "info",
      label: !enoughWarn
        ? quiet
        : exitPct < 0
          ? `Smart money, whales and public figures sold ${pctVol(Math.abs(exitPct))} of 24h volume (${ofVolume(labeledUsd, vol24)}), ${plural(labeledWallets, "wallet")}`
          : `Labeled wallets net bought ${pctVol(exitPct)} of 24h volume (${ofVolume(labeledUsd, vol24)}), ${plural(labeledWallets, "wallet")}`,
      evidence: flowEvidence,
    });

    // --- distribution_pct: the exit-liquidity thesis proper -------------------------------
    const distributing = minActivity && labeledWallets >= MIN_WALLETS_BLOCK && exitPct < 0 && absorption !== null && absorption >= 1;
    out.push({
      id: "distribution_pct",
      kind: "spot",
      value: distributing ? exitPct : 0,
      severity: distributing ? "high" : "info",
      label: distributing
        ? `Smart money, whales and public figures sold ${pctVol(Math.abs(exitPct))} of 24h volume (${ofVolume(labeledUsd, vol24)}) and fresh wallets bought ${absorption!.toFixed(1)}x that`
        : !minActivity
          ? quiet
          : exitPct >= 0
            ? "Labeled wallets are not net sellers"
            : absorption === null
              ? "Labeled wallets are selling, but fresh wallets are not taking the other side"
              : `Fresh wallets are absorbing only ${absorption.toFixed(1)}x the labeled exit`,
      evidence: [...flowEvidence, { endpoint: FLOW, field: "fresh_wallets_net_flow_usd", value: usd(freshUsd, true) }],
    });
  }

  // --- sm_netflow_pct: Smart Money's 24h netflow as a share of the day's volume ------------
  const nf = input.netflow?.net_flow_24h_usd ?? null;
  const traders = wallets(input.netflow?.trader_count);
  if (nf === null || vol24 === null) {
    out.push(unavailable("sm_netflow_pct", nf === null ? "Smart Money netflow unavailable" : "24h volume unavailable, so flows can't be sized"));
  } else {
    const enough = minActivity && traders >= MIN_SM_TRADERS;
    const smPct = enough ? (nf / vol24) * 100 : 0;
    out.push({
      id: "sm_netflow_pct",
      kind: "spot",
      value: smPct,
      severity: smPct < 0 ? "warn" : "info",
      label: !enough
        ? `Not enough Smart Money trading to judge (${plural(traders, "trader")})`
        : `Smart Money ${smPct < 0 ? "sold" : "bought"} ${pctVol(Math.abs(smPct))} of 24h volume (${ofVolume(nf, vol24)}), ${plural(traders, "trader")}`,
      evidence: [
        { endpoint: "smart-money/netflow", field: "net_flow_24h_usd", value: usd(nf, true) },
        { endpoint: TOKEN_INFO, field: "spot_metrics.volume_total_usd", value: usd(vol24) },
      ],
    });
  }

  // --- drawdown_pct: how far the price already fell -----------------------------------------
  const drawdown = pickChange(input.priceChange7dPct, input.priceChange24hPct);
  if (drawdown === null) {
    out.push(unavailable("drawdown_pct", "Price history unavailable"));
  } else {
    const window = typeof input.priceChange7dPct === "number" && Number.isFinite(input.priceChange7dPct) ? "7 days" : "24 hours";
    out.push({
      id: "drawdown_pct",
      kind: "spot",
      value: drawdown,
      severity: drawdown <= -50 ? "high" : drawdown < 0 ? "warn" : "info",
      label: `Price is ${drawdown < 0 ? "down" : "up"} ${Math.abs(Math.round(drawdown))}% in ${window}`,
      evidence: [{ endpoint: OHLCV, field: window === "7 days" ? "close (7d)" : "close (24h)", value: `${drawdown < 0 ? "−" : "+"}${Math.abs(Math.round(drawdown))}%` }],
    });
  }

  // --- risk_high_count ----------------------------------------------------------------------
  if (input.indicators) {
    // Nansen does not always file indicators under the documented array, so scan both.
    const highs = [...(input.indicators.risk_indicators ?? []), ...(input.indicators.reward_indicators ?? [])].filter(
      (i) => i.score === "high" && TOKEN_RISKS.has(i.indicator_type),
    );
    out.push({
      id: "risk_high_count",
      kind: "spot",
      value: highs.length,
      severity: highs.length >= 2 ? "high" : highs.length === 1 ? "warn" : "info",
      label: highs.length ? `High risk: ${highs.map((h) => h.indicator_type.replace(/-/g, " ")).join(", ")}` : "No high risk indicators",
      evidence: highs.map((h) => ({ endpoint: "tgm/indicators", field: h.indicator_type, value: `high (p${h.signal_percentile ?? "?"})` })),
    });
  } else {
    out.push(unavailable("risk_high_count", "Risk indicators unavailable"));
  }

  if (input.author) {
    out.push({
      id: "author_holds_token",
      kind: "spot",
      value: input.author.valueUsd,
      severity: "info",
      label: input.author.valueUsd > 0 ? `${input.author.entity} holds ${usd(input.author.valueUsd)}` : `${input.author.entity} holds none`,
      evidence: [{ endpoint: "profiler/address/current-balance", field: "value_usd", value: usd(input.author.valueUsd) }],
    });
  }
  return out;
}

function pickChange(sevenDay: number | null | undefined, oneDay: number | null | undefined): number | null {
  if (typeof sevenDay === "number" && Number.isFinite(sevenDay)) return sevenDay;
  if (typeof oneDay === "number" && Number.isFinite(oneDay)) return oneDay;
  return null;
}

function unavailable(id: Signal["id"], label: string): Signal {
  return { id, kind: "spot", value: null, severity: "info", label, evidence: [] };
}
