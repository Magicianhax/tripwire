export const CHAINS = [
  "solana",
  "ethereum",
  "base",
  "arbitrum",
  "bnb",
  "polygon",
  "optimism",
  "avalanche",
] as const;
export type Chain = (typeof CHAINS)[number];

export type SpotTarget = { kind: "spot"; chain: Chain; tokenAddress: string; symbol?: string };
export type PerpTarget = { kind: "perp"; coin: string; side?: "long" | "short" };
export type PredictionTarget = {
  kind: "prediction";
  slug: string;
  marketId?: string;
  outcome?: "yes" | "no";
};
export type Target = SpotTarget | PerpTarget | PredictionTarget;
export type TargetKind = Target["kind"];

export type SignalId =
  | "exit_pressure"
  | "fresh_buy_share"
  | "sm_netflow_24h"
  | "risk_high_count"
  | "author_holds_token"
  | "sm_opposite_side_pct"
  | "inside_liq_band"
  | "smart_side_disagrees";

export type Evidence = { endpoint: string; field: string; value: string };

export type Signal = {
  id: SignalId;
  kind: TargetKind;
  severity: "info" | "warn" | "high";
  /** null = data unavailable; never counts toward CLEAR */
  value: number | null;
  label: string;
  evidence: Evidence[];
};

export type Verdict = "CLEAR" | "CAUTION" | "TRIPWIRE" | "UNCHECKED";
