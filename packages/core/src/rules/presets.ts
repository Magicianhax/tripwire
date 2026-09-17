import type { SignalId, TargetKind } from "../types";

export type Rule = {
  id: string;
  kind: TargetKind;
  signal: SignalId;
  op: ">" | "<" | ">=" | "<=";
  threshold: number;
  action: "warn" | "block";
  enabled: boolean;
  /** Sentence template; "{n}" is replaced by the threshold in the editor. */
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

export const PRESETS: Record<PresetName, Rule[]> = {
  degen: [
    r("spot-exit", "spot", "exit_pressure", "<", -500_000, "block", "Block when smart money, whales & public figures dump more than ${n}"),
    r("spot-fresh", "spot", "fresh_buy_share", ">", 90, "warn", "Warn when fresh wallets are more than {n}% of buying"),
    r("spot-sm24", "spot", "sm_netflow_24h", "<", -250_000, "warn", "Warn when Smart Money 24h net outflow exceeds ${n}"),
    r("spot-risk", "spot", "risk_high_count", ">=", 3, "block", "Block when {n}+ Nansen risk indicators are high"),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 85, "block", "Block when more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 5_000_000, "warn", "Warn when more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 85, "block", "Block when more than {n}% of proven-winner money is on the other side"),
  ],
  balanced: [
    r("spot-exit", "spot", "exit_pressure", "<", -100_000, "block", "Block when smart money, whales & public figures dump more than ${n}"),
    r("spot-fresh", "spot", "fresh_buy_share", ">", 70, "warn", "Warn when fresh wallets are more than {n}% of buying"),
    r("spot-sm24", "spot", "sm_netflow_24h", "<", -50_000, "warn", "Warn when Smart Money 24h net outflow exceeds ${n}"),
    r("spot-risk", "spot", "risk_high_count", ">=", 2, "block", "Block when {n}+ Nansen risk indicators are high"),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 70, "block", "Block when more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 1_000_000, "warn", "Warn when more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 70, "block", "Block when more than {n}% of proven-winner money is on the other side"),
  ],
  paranoid: [
    r("spot-exit", "spot", "exit_pressure", "<", -25_000, "block", "Block when smart money, whales & public figures dump more than ${n}"),
    r("spot-fresh", "spot", "fresh_buy_share", ">", 50, "block", "Block when fresh wallets are more than {n}% of buying"),
    r("spot-sm24", "spot", "sm_netflow_24h", "<", 0, "block", "Block when Smart Money 24h net outflow exceeds ${n}"),
    r("spot-risk", "spot", "risk_high_count", ">=", 1, "block", "Block when {n}+ Nansen risk indicators are high"),
    r("perp-opp", "perp", "sm_opposite_side_pct", ">", 55, "block", "Block when more than {n}% of Smart Money is on the other side"),
    r("perp-liq", "perp", "inside_liq_band", ">", 250_000, "block", "Block when more than ${n} of Smart Money liquidates near price"),
    r("pm-smart", "prediction", "smart_side_disagrees", ">", 55, "block", "Block when more than {n}% of proven-winner money is on the other side"),
  ],
};
