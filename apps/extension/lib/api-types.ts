/**
 * Response shapes for apps/web's API routes, mirrored from
 * .superpowers/sdd/2026-09-17-tripwire/task-7-report.md (the extension cannot import
 * apps/web's route-local types directly, so these are re-declared here using the shared
 * row types from @tripwire/core).
 */
import type {
  Candle,
  Chain,
  Evidence,
  FlowRow,
  IndicatorsResp,
  NetflowRow,
  PerpPosition,
  PerpScreenerRow,
  PerpTrade,
  PmHolder,
  PmTrade,
  Rule,
  Signal,
  SignalId,
  Target,
  Verdict,
  WhoRow,
} from "@tripwire/core";

export type RulesPreset = "degen" | "balanced" | "paranoid" | "custom";

export type KeySource = "env" | "nansen-cli" | "none";

export type HealthResponse = {
  ok: true;
  keySource: KeySource;
  replay: boolean;
  creditsToday: number;
  cap: number;
};

export type TokenRef = {
  chain: Chain;
  tokenAddress: string;
  symbol: string;
  name: string;
  volume24h: number | null;
  marketCap: number | null;
};

export type ResolveResponse = { best: TokenRef | null; candidates: TokenRef[] };

export type HitDto = {
  ruleId: string;
  action: "warn" | "block";
  text: string;
  signalId: SignalId;
  label: string;
  value: number | null;
  evidence: Evidence[];
};

export type SpotPanel = {
  flow: FlowRow | null;
  flowTimeframe: string;
  sincePost: { timeframe: string; flow: FlowRow | null } | null;
  netflow: { h1: number | null; h24: number | null; d7: number | null; d30: number | null; symbol: string | null } | null;
  indicators: { type: string; score: string; percentile: number | null }[] | null;
  marketCapUsd: number | null;
  topBuyers: WhoRow[] | null;
  topSellers: WhoRow[] | null;
  candles: Candle[] | null;
  postTimeIso: string | null;
  errors: string[];
};

export type PerpPanel = {
  coin: string;
  screener: PerpScreenerRow | null;
  positions: PerpPosition[] | null;
  trades: PerpTrade[] | null;
  errors: string[];
};

export type PredictionPanel = {
  market: { id: string; question: string; slug: string; yesPrice: number | null; endDate: string | null } | null;
  holders: (PmHolder & { key: string; pnl: number | null })[] | null;
  trades: PmTrade[] | null;
  errors: string[];
};

export type PostIntelResponse = {
  verdict: Verdict;
  /** UNCHECKED only: the short reason ("Nansen credit cap reached"), else null. */
  headline?: string | null;
  hits: HitDto[];
  unavailable: SignalId[];
  signals: Signal[];
  panel: SpotPanel;
  rulesPreset: RulesPreset;
};

export type GuardResponse = {
  target: Target;
  verdict: Verdict;
  /** UNCHECKED only: the short reason ("Pick a market", "Nansen credit cap reached"), else null. */
  headline?: string | null;
  hits: HitDto[];
  unavailable: SignalId[];
  signals: Signal[];
  panel: SpotPanel | PerpPanel | PredictionPanel;
  rulesPreset: RulesPreset;
};

export type PersonIntelResponse = {
  entity: string | null;
  tags: string[];
  holding: { valueUsd: number; symbol: string | null } | null;
  topHoldings: { symbol: string; chain: string; valueUsd: number }[];
  matchedBy: "displayName" | "handle" | null;
  signal?: Signal;
};

export type RulesResponse = { preset: RulesPreset; rules: Rule[] };

export type LedgerSummary = {
  totalCalls: number;
  successfulCalls: number;
  creditsTotal: number;
  creditsToday: number;
  callsToday: number;
  byEndpoint: { endpoint: string; calls: number; credits: number; avgMs: number; errors: number }[];
  recent: { ts: number; endpoint: string; status: number; credits: number | null; latency_ms: number }[];
};

export type OverrideResponse = { ok: true };

export type ApiErrorBody =
  | { error: "invalid request"; issues: unknown[] }
  | { error: "origin not allowed" }
  | { error: "budget"; message: string }
  | { error: "nansen"; status: number; message: string }
  | { error: "internal"; message: string }
  | { error: "bad path" }
  | { error: "backend_unreachable" };
