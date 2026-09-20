export const CHAINS = [
  "solana",
  "ethereum",
  "base",
  "arbitrum",
  "bnb",
  "polygon",
  "optimism",
  "avalanche",
  "robinhood",
] as const;
export type Chain = (typeof CHAINS)[number];

export type SpotTarget = { kind: "spot"; chain: Chain; tokenAddress: string; symbol?: string };
export type PerpTarget = { kind: "perp"; coin: string; side?: "long" | "short" };
export type PredictionTarget = {
  kind: "prediction";
  slug: string;
  marketId?: string;
  /** Yes/No markets only. Two thirds of Polymarket's top-100 markets have other outcomes. */
  outcome?: "yes" | "no";
  /**
   * The raw text of the outcome the venue adapter read from the market-scoped control ("Yes",
   * "BAL", "Ravens", "Over"). Resolved against the market's own `outcomes` array on the backend
   * and never interpreted here, because a market whose outcome is literally "NO" is New Orleans
   * (Round 2.2).
   */
  outcomeLabel?: string;
};
export type Target = SpotTarget | PerpTarget | PredictionTarget;
export type TargetKind = Target["kind"];

/**
 * What a target is *about*, as one string: the subject a verdict and a panel belong to.
 *
 * Only the identifying fields count. A spot token is its chain and contract (the symbol is a
 * name, not an identity, and an EVM address is case-insensitive); a perp is its coin and the
 * side being taken; a prediction is its market and the outcome the page has selected. Two
 * targets with the same key describe the same trade, so one's evidence may be shown under the
 * other's header — and two with different keys never may.
 */
export function targetKey(target: Target): string {
  switch (target.kind) {
    case "spot":
      return `spot:${target.chain}:${target.tokenAddress.toLowerCase()}`;
    case "perp":
      return `perp:${target.coin.toLowerCase()}:${target.side ?? ""}`;
    case "prediction":
      return `prediction:${target.slug}:${target.marketId ?? ""}:${(target.outcomeLabel ?? target.outcome ?? "").toLowerCase()}`;
  }
}

/** Whether two targets name the same subject. Two absent targets match; one absent never does. */
export function sameTarget(a: Target | null | undefined, b: Target | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return targetKey(a) === targetKey(b);
}

/** Every signal a rule may reference. The four spot flow/price signals are volume-normalized
 * (docs/CALIBRATION.md): the USD-denominated `exit_pressure`/`sm_netflow_24h` and the
 * degenerate `fresh_buy_share` were removed in the 2026-09-17 recalibration. */
export const SIGNAL_IDS = [
  "labeled_exit_pct",
  "distribution_pct",
  "sm_netflow_pct",
  "drawdown_pct",
  "risk_high_count",
  "author_holds_token",
  "sm_opposite_side_pct",
  "inside_liq_band",
  "smart_side_disagrees",
] as const;

export type SignalId = (typeof SIGNAL_IDS)[number];

/** How a signal's value and its rule threshold are written.
 * - `pct-volume`: a share of the token's 24h DEX volume ("−14.5% of volume")
 * - `pct`: a plain percentage ("−75%")
 * - `usd`: a dollar amount
 * - `count`: a whole number of things */
export type SignalUnit = "pct-volume" | "pct" | "usd" | "count";

export const SIGNAL_UNITS: Record<SignalId, SignalUnit> = {
  labeled_exit_pct: "pct-volume",
  distribution_pct: "pct-volume",
  sm_netflow_pct: "pct-volume",
  drawdown_pct: "pct",
  risk_high_count: "count",
  author_holds_token: "usd",
  sm_opposite_side_pct: "pct",
  inside_liq_band: "usd",
  smart_side_disagrees: "pct",
};

/** Signals whose rule thresholds always point downward (0 or negative) across every preset.
 * The rules editor shows the magnitude and re-applies the sign on save, and rule sentences
 * print the magnitude ("down more than 50%", not "down more than −50%"). */
export const NEGATIVE_SIGNALS: SignalId[] = ["labeled_exit_pct", "distribution_pct", "sm_netflow_pct", "drawdown_pct"];

export function isNegativeSignal(signal: SignalId): boolean {
  return NEGATIVE_SIGNALS.includes(signal);
}

export function isSignalId(value: unknown): value is SignalId {
  return typeof value === "string" && (SIGNAL_IDS as readonly string[]).includes(value);
}

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
