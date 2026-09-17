import type { SignalId, TargetKind } from "../types";

export type Rule = {
  id: string;
  kind: TargetKind;
  signal: SignalId;
  op: ">" | "<" | ">=" | "<=";
  threshold: number;
  action: "warn" | "block";
  enabled: boolean;
  /** Sentence template without the verb (the action supplies "Block"/"Warn"); "{n}" or "${n}"
   * is replaced by the threshold. */
  text: string;
};

export type PresetName = "degen" | "balanced" | "paranoid";

const r = (
  id: string,
  kind: TargetKind,
  signal: SignalId,
  op: Rule["op"],
  threshold: number,
  action: Rule["action"],
  text: string,
): Rule => ({ id, kind, signal, op, threshold, action, enabled: true, text });

// Spot rule sentences (docs/CALIBRATION.md §4.3). Every threshold is a share of the token's
// own 24h volume, so the same rule reads the same on a $4.8B cap and on a day-old launch.
const DISTRIBUTION = "labeled wallets sell more than {n}% of 24h volume into fresh-wallet buying";
const EXIT = "labeled wallets sell more than {n}% of 24h volume";
const SM24 = "Smart Money’s 24h net outflow exceeds {n}% of 24h volume";
const DRAWDOWN = "the price is down more than {n}% over 7 days";

/**
 * The shipped presets. Spot thresholds come from the 37-token calibration on 2026-09-17.
 *
 * `spot-risk` (`risk_high_count`) is deliberately absent: with TOKEN_RISKS as defined, no token
 * in the sample ever scored a single high indicator, so the rule contributed nothing to any
 * verdict. It stays available in the rules editor for custom rule sets.
 */
export const PRESETS: Record<PresetName, Rule[]> = {
  degen: [
    r("spot-distribution", "spot", "distribution_pct", "<", -6, "block", DISTRIBUTION),
    r("spot-exit-deep", "spot", "labeled_exit_pct", "<", -10, "block", EXIT),
    r("spot-exit", "spot", "labeled_exit_pct", "<", -4, "warn", EXIT),
    r("spot-sm24", "spot", "sm_netflow_pct", "<", -4, "warn", SM24),
    r("spot-drawdown", "spot", "drawdown_pct", "<=", -80, "warn", DRAWDOWN),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 85, "block", "more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 5_000_000, "warn", "more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 85, "block", "more than {n}% of proven-winner money is on the other side"),
  ],
  balanced: [
    r("spot-distribution", "spot", "distribution_pct", "<", -2, "block", DISTRIBUTION),
    r("spot-exit-deep", "spot", "labeled_exit_pct", "<", -5, "block", EXIT),
    r("spot-exit", "spot", "labeled_exit_pct", "<", -1, "warn", EXIT),
    r("spot-sm24", "spot", "sm_netflow_pct", "<", -1.5, "warn", SM24),
    r("spot-drawdown", "spot", "drawdown_pct", "<=", -50, "warn", DRAWDOWN),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 70, "block", "more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 1_000_000, "warn", "more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 70, "block", "more than {n}% of proven-winner money is on the other side"),
  ],
  paranoid: [
    r("spot-distribution", "spot", "distribution_pct", "<", -0.75, "block", DISTRIBUTION),
    r("spot-exit-deep", "spot", "labeled_exit_pct", "<", -2.5, "block", EXIT),
    r("spot-exit", "spot", "labeled_exit_pct", "<", -0.5, "warn", EXIT),
    r("spot-sm24", "spot", "sm_netflow_pct", "<", -0.75, "warn", SM24),
    r("spot-drawdown", "spot", "drawdown_pct", "<=", -30, "block", DRAWDOWN),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 55, "block", "more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 250_000, "block", "more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 55, "block", "more than {n}% of proven-winner money is on the other side"),
  ],
};
