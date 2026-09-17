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
  LabelKind,
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
  TokenInfo,
  Verdict,
  ViewTimeframe,
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
  /** The fired rule's comparison, for the secondary "rule: > $100K" clause. Optional: an older
   * backend doesn't send them, and the clause is simply omitted. */
  op?: ">" | "<" | ">=" | "<=";
  threshold?: number;
  label: string;
  value: number | null;
  evidence: Evidence[];
};

export type SpotChart = {
  timeframe: ViewTimeframe;
  /** The candle interval inside the window ("15m"). */
  interval: string;
  candles: Candle[] | null;
};

export type SpotPanel = {
  /** Name, symbol, logo and market figures from `tgm/token-information`. Optional: an older
   * backend doesn't send it, and the header falls back to the address. */
  token?: TokenInfo | null;
  /** The flow the verdict was computed from, always on the verdict window. */
  flow: FlowRow | null;
  flowTimeframe: string;
  /** The flow for the window the user picked. Optional for the same reason as `token`. */
  viewFlow?: FlowRow | null;
  viewTimeframe?: ViewTimeframe;
  netflow: { h1: number | null; h24: number | null; d7: number | null; d30: number | null; symbol: string | null; traders?: number | null } | null;
  indicators: { type: string; score: string; percentile: number | null }[] | null;
  marketCapUsd: number | null;
  topBuyers: WhoRow[] | null;
  topSellers: WhoRow[] | null;
  chart?: SpotChart | null;
  /** How much fresh-wallet money took the other side of the labeled exit ("2.8×"), or null. */
  absorption?: number | null;
  labeledUsd?: number | null;
  labeledWallets?: number;
  postTimeIso: string | null;
  /** Token logo (https) from Nansen token information. Optional: an older backend doesn't send
   * it, and the header shows a monogram. */
  logoUrl?: string | null;
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

// ---- Author badges (POST /api/author-badges, GET/PUT/DELETE /api/links) ----

export type WalletVenueId = "hyperliquid" | "polymarket";

export type BadgeLink = { address: string; source: "user" | "curated"; sourceUrl: string | null };

export type NansenBadge = {
  entity: string;
  tags: string[];
  matchedBy: "displayName" | "handle";
  totalHoldingsUsd: number | null;
  topHoldings: { symbol: string; chain: string; valueUsd: number }[];
  realizedPnlUsd: number | null;
  winRate: number | null;
  pnlWindowDays: number;
  errors: string[];
};

export type HyperliquidBadgePosition = {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPx: number | null;
  markPx: number | null;
  liquidationPx: number | null;
  unrealizedPnlUsd: number | null;
  leverage: number | null;
  valueUsd: number | null;
};

export type HyperliquidBadgeFill = { time: number; coin: string; dir: string; px: number | null; sz: number | null; closedPnlUsd: number | null };

export type HyperliquidBadge = {
  link: BadgeLink;
  accountValueUsd: number | null;
  marginUsedUsd: number | null;
  positions: HyperliquidBadgePosition[] | null;
  fills: HyperliquidBadgeFill[] | null;
  fillsRealizedPnlUsd: number | null;
  fillsWindow: { count: number; fromMs: number; toMs: number } | null;
  nansenPerp: { realizedPnlUsd: number | null; winRate: number | null; windowDays: number } | null;
  errors: string[];
};

export type PolymarketBadgePosition = { marketId: string; question: string; side: string; costUsd: number | null; valueUsd: number; pnlUsd: number | null };
export type PolymarketBadgeTrade = {
  timestamp: string;
  action: "Buy" | "Sell" | null;
  side: string | null;
  size: number | null;
  price: number | null;
  usdcValue: number | null;
  question: string | null;
};

export type PolymarketBadge = {
  link: BadgeLink;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  winRate: number | null;
  marketsTraded: number | null;
  marketsWon: number | null;
  openPositions: PolymarketBadgePosition[] | null;
  trades: PolymarketBadgeTrade[] | null;
  errors: string[];
};

export type AuthorBadgesResponse = {
  handle: string;
  nansen?: NansenBadge;
  hyperliquid?: HyperliquidBadge;
  polymarket?: PolymarketBadge;
  errors: string[];
};

export type WalletLinkDto = { handle: string; venue: WalletVenueId; address: string; source: "user" | "curated"; sourceUrl: string | null; createdAt: number | null };
export type LinksResponse = { links: WalletLinkDto[] };
export type LinkResponse = { link: WalletLinkDto };
export type UnlinkResponse = { deleted: boolean };

// ---- Wallet lens (POST /api/wallet, POST /api/wallet/labels) ----

export type WalletHolding = {
  symbol: string;
  name: string | null;
  chain: string;
  tokenAddress: string;
  amount: number | null;
  valueUsd: number;
};

export type WalletPortfolio = { totalUsd: number; holdings: WalletHolding[]; chains: string[]; tokenCount: number };

export type WalletPnl = {
  realizedPnlUsd: number | null;
  realizedPnlPercent: number | null;
  winRate: number | null;
  tradeCount: number | null;
  tokenCount: number | null;
  windowDays: number;
};

export type WalletLabel = { text: string; kind: LabelKind; tags: string[] };

/** The Hyperliquid and Polymarket blocks are the author badges' shapes without their `link`:
 * the wallet lens knows the address because the user clicked it, not because anyone linked it. */
export type WalletHyperliquid = Omit<HyperliquidBadge, "link">;
export type WalletPolymarket = Omit<PolymarketBadge, "link">;

export type WalletLensResponse = {
  input: string;
  resolved: boolean;
  address: string | null;
  chainGuess: Chain | null;
  name: { value: string; source: string } | null;
  label: WalletLabel | null;
  portfolio: WalletPortfolio | null;
  pnl: WalletPnl | null;
  hyperliquid: WalletHyperliquid | null;
  polymarket: WalletPolymarket | null;
  nansenUrl: string | null;
  sources: string[];
  credits: number;
  message: string | null;
  errors: string[];
};

export type WalletLabelsResponse = { address: string; labels: string[]; credits: number; errors: string[] };
