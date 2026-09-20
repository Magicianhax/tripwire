/**
 * Response shapes for apps/web's API routes, mirrored from
 * .superpowers/sdd/2026-09-17-tripwire/task-7-report.md (the extension cannot import
 * apps/web's route-local types directly, so these are re-declared here using the shared
 * row types from @tripwire/core).
 */
import type {
  Candle,
  Chain,
  DepthSection,
  Evidence,
  MarginTier,
  OiHistorySeries,
  PerpVenueId,
  PerpVenueQuote,
  FlowRow,
  HolderRecord,
  IndicatorsResp,
  LabelKind,
  NetflowRow,
  PerpPosition,
  PerpPositionIntelligence,
  PerpScreenerRow,
  PerpTrade,
  PmHolder,
  PmTrade,
  Rule,
  Signal,
  SideTotals,
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

export type Market = {
  id: string; kind: "spot" | "perp"; chain: string; symbol: string; name: string; address: string;
  priceUsd: number | null; volume24hUsd: number | null; marketCapUsd: number | null;
  match: "exact" | "related"; detailTarget: Target | null; nansenUrl: string;
};
export type MarketCatalog = { symbol: string; markets: Market[]; errors: string[]; replay: boolean };

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
  /** The token's chain (Round 2.1). Optional: an older backend does not send it, and the card
   * then simply does not offer the Solana-only Jupiter DCA button rather than guessing. */
  chain?: string | null;
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
  /** `signal` and `lastTriggerIso` are optional: an older backend drops them at the DTO, and the
   * card simply omits those two lines rather than inventing them. */
  indicators: { type: string; score: string; percentile: number | null; signal?: number | null; lastTriggerIso?: string | null }[] | null;
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
  /**
   * Documented limitations `tgm/flow-intelligence` returned *with* its data — not failures.
   * Rendered as captions under the rows they are about; they never reach `SectionProblem` and
   * never change a verdict. Optional: an older backend does not send them.
   */
  warnings?: string[];
};

export type PerpPanel = {
  coin: string;
  /** Which load this panel came from: the sections only panel mode pays for use it to tell
   * "not asked for" apart from "asked, and empty". */
  mode: "chip" | "panel";
  screener: PerpScreenerRow | null;
  positions: PerpPosition[] | null;
  /** Whether `tgm/perp-positions` said its page was the whole population; null when it did not
   * say, which is a third answer and not a synonym for "complete" (Round 1.3.7). */
  positionsIsLastPage: boolean | null;
  positionsReturned: number | null;
  trades: PerpTrade[] | null;
  /** smart-trader / whale / public-figure exposure, 1 credit, panel mode only (Round 1.3.3). */
  cohorts: PerpPositionIntelligence | null;
  cohortsAtIso: string | null;
  /** Section-level gaps. Deliberately not in `errors`, which drives the card's "Unavailable:"
   * list and reads as the whole check having failed. */
  tradesError: string | null;
  cohortsError: string | null;
  errors: string[];
};

/** Live, not taking orders, or settled. `null` means Gamma did not say (Round 1.2.3). */
export type MarketState = "live" | "paused" | "resolved";

/** The useful subset of Polymarket's 84-field Gamma market object (Round 1.2.1). Every figure is
 * nullable: Gamma omits fields rather than nulling them, so an absent one is a dash. */
export type PredictionMarket = {
  id: string;
  question: string;
  slug: string;
  state: MarketState | null;
  /** The market's own outcome names in Gamma's order (Round 2.2). Index 0 is what `yesPrice`,
   * `bestBid` and `bestAsk` are quoted for — "Yes" on two thirds of the book, "BAL" or
   * "Ravens" or "Over" on the rest. Never assume the words Yes and No. */
  outcomes: string[] | null;
  /** Polymarket's cached price per outcome, index-aligned with `outcomes`. Not the live book. */
  outcomePrices: number[] | null;
  /** Outcome 0's headline price, 0-1. */
  yesPrice: number | null;
  yesPriceSource: "book" | "last-trade" | "cached" | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastTradePrice: number | null;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  liquidityUsd: number | null;
  volumeUsd: number | null;
  volume24hUsd: number | null;
  volume1wkUsd: number | null;
  endDate: string | null;
  endDateIso: string | null;
  startDateIso: string | null;
  negRisk: boolean | null;
  clobTokenIds: string[] | null;
  description: string | null;
  groupItemTitle: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  active: boolean | null;
  closed: boolean | null;
  acceptingOrders: boolean | null;
  umaResolutionStatuses: string[] | null;
  pricedAtIso: string | null;
};

/** One row of the event picker (Round 2.2). Free: it comes from a Gamma call already made. */
export type MarketOption = {
  id: string;
  slug: string;
  question: string;
  groupItemTitle: string | null;
  outcomes: string[] | null;
  outcomePrices: number[] | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  endDate: string | null;
  state: MarketState | null;
};

export type PredictionPanel = {
  market: PredictionMarket | null;
  holders: (PmHolder & { key: string; record: HolderRecord | null })[] | null;
  sides: SideTotals | null;
  recordsChecked: number | null;
  recordsCap: number;
  trades: PmTrade[] | null;
  /** Holders and trades on a settled market are history, not a live read. */
  historical: boolean;
  /** Which outcome of `market.outcomes` the page is buying. Null is UNCHECKED, never a default. */
  outcomeIndex: number | null;
  targetOutcome: string | null;
  /** What the page offered when it is not one of this market's outcomes. */
  unknownOutcome: string | null;
  /** The event's other open markets. Evidence only: picking one never changes this card's
   * verdict, because the page decides what is being traded (Round 2.2). */
  options: MarketOption[] | null;
  optionsTotal: number | null;
  eventSlug: string | null;
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

// ---- Depth (POST /api/depth): the card's lazy sections ----
//
// Mirrors apps/web/lib/intel/depth.ts, the same way the panel types above mirror their routes.
// Nothing here is part of a card's own load: a tab asks for exactly what it draws.

export type HlMarketDto = {
  coin: string;
  markPrice: number | null;
  oraclePrice: number | null;
  midPrice: number | null;
  premiumPct: number | null;
  fundingHourly: number | null;
  fundingPer8h: number | null;
  fundingAnnualPct: number | null;
  openInterestCoins: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  dayChangePct: number | null;
  maxLeverage: number | null;
  /** Round 2.5: where this market's leverage ceiling steps down, from the `marginTables` block
   * that was already inside the response the card fetches. */
  marginTiers?: MarginTier[] | null;
};

export type BookDepthDto = {
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  bandPct: number;
  bidUsd: number;
  askUsd: number;
  imbalance: number | null;
};

export type FundingPointDto = { timeMs: number; hourlyRate: number; per8h: number; premium: number | null };

export type PerpMarketSection = {
  market: HlMarketDto | null;
  book: BookDepthDto | null;
  funding: FundingPointDto[] | null;
  /** Round 2.5. `true` is "Hyperliquid lists this coin as capped", `false` is "it does not", and
   * **null is "the list could not be read"** — the card says nothing on a null, and none of the
   * three ever becomes a block. */
  atOpenInterestCap?: boolean | null;
  errors: string[];
};
export type PerpVenuesSection = {
  rows: PerpVenueQuote[];
  unmapped: PerpVenueId[];
  /** Round 2.5: Binance's open interest over the last day. It carries its own venue because it
   * is Binance's series, not the table's column over time. */
  oiHistory?: OiHistorySeries | null;
  errors: string[];
};
export type PerpChartSection = { interval: string; candles: Candle[] | null; errors: string[] };

export type PerpLeaderRow = {
  address: string | null;
  label: string | null;
  side: string | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  positionValueUsd: number | null;
  holdingAmount: number | null;
  roiPct: number | null;
  tradeCount: number | null;
};

export type PerpDepthTrade = {
  address: string | null;
  label: string | null;
  side: string | null;
  action: string | null;
  valueUsd: number | null;
  priceUsd: number | null;
  tokenAmount: number | null;
  orderType: string | null;
  timestamp: string | null;
};

export type TopAccountPosition = { coin: string; side: string | null; valueUsd: number | null; entryPrice: number | null; unrealizedPnlUsd: number | null };

export type TopAccount = {
  address: string | null;
  label: string | null;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  roiPct: number | null;
  accountValueUsd: number | null;
  volumeUsd: number | null;
  hereNow: TopAccountPosition | null;
};

export type PerpTradersSection = {
  leaderboard: PerpLeaderRow[] | null;
  trades: PerpDepthTrade[] | null;
  topAccounts: TopAccount[] | null;
  topAccountsHere: number;
  credits: number;
  errors: string[];
};

export type SpotHolderRow = {
  address: string | null;
  label: string | null;
  valueUsd: number | null;
  tokenAmount: number | null;
  sharePct: number | null;
  /** Round 2.1: `balance_change_*` as a percent of the wallet's own balance, because the wire
   * figure is a raw token amount. Optional — an older backend sends none of them. */
  change24hPct?: number | null;
  change7dPct?: number | null;
  change30dPct?: number | null;
  totalInflow?: number | null;
  totalOutflow?: number | null;
};
export type SpotHoldersSection = {
  holders: SpotHolderRow[] | null;
  top10SharePct: number | null;
  /** Round 2.1: two measurements the card states rather than assuming. Optional on an older
   * backend, where the lines simply do not render. */
  neverSentOutCount?: number | null;
  allChange24hZero?: boolean | null;
  warnings?: string[];
  isLastPage?: boolean | null;
  credits: number;
  errors: string[];
};

// ---- Round 1.6.1 / 2.1: the spot card's new depth sections ------------------------------------

export type TxnCounts = { buys: number | null; sells: number | null };

/** Dexscreener market structure, already parsed and reduced on the backend: the 30-pool body
 * never crosses this boundary, and `boosts`, `socials` and `websites` are not in the shape. */
export type TokenMarketStructure = {
  pool: { dexId: string | null; pairAddress: string | null; quoteSymbol: string | null; liquidityUsd: number | null; createdAtIso: string | null } | null;
  /** Already a percentage, unlike Nansen's `price_change`, which is a fraction. */
  priceChangePct: { m5: number | null; h1: number | null; h6: number | null };
  /** Summed across `poolCount` pools; separate trades, so the sum is a count. */
  txns: { m5: TxnCounts; h1: TxnCounts; h6: TxnCounts };
  poolCount: number;
  quoteSidePoolCount: number;
  /** Entries Dexscreener sent that could not be parsed, so `poolCount` can never pass for the
   * whole answer when part of it was unreadable. */
  droppedPoolCount: number;
};
/**
 * `structure: null` means Dexscreener's answer could not be read at all — *not* that the token
 * has no pools. `structure.poolCount === 0` is the second, different claim: it answered, and the
 * answer was none. The card renders them apart (C-1).
 */
export type SpotMarketSection = { structure: TokenMarketStructure | null; errors: string[] };

export type SpotTapeRow = {
  timestampIso: string;
  address: string | null;
  label: string | null;
  action: "buy" | "sell" | null;
  valueUsd: number | null;
  tokenAmount: number | null;
  priceUsd: number | null;
  txHash: string | null;
  counterSymbol: string | null;
};
export type SpotTapeSection = {
  trades: SpotTapeRow[] | null;
  /** The span the page actually covers — never the window it asked for. */
  spanFromIso: string | null;
  spanToIso: string | null;
  fetched: number;
  kept: number;
  minUsd: number;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export type SpotWinnerRow = {
  address: string | null;
  label: string | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  roiPct: number | null;
  holdingAmount: number | null;
  holdingUsd: number | null;
  peakUsd: number | null;
  stillHoldingRatio: number | null;
  tradeCount: number | null;
};
export type SpotWinnersSection = {
  winners: SpotWinnerRow[] | null;
  /** Share of the sampled peak money still held, weighted by position size. */
  stillHolding: { pct: number; weightUsd: number; counted: number } | null;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export type SpotTransferRow = {
  timestampIso: string;
  txHash: string | null;
  fromAddress: string | null;
  fromLabel: string | null;
  toAddress: string | null;
  toLabel: string | null;
  kind: string | null;
  amount: number | null;
  valueUsd: number | null;
};
export type SpotTransfersSection = {
  transfers: SpotTransferRow[] | null;
  windowHours: number;
  isLastPage: boolean | null;
  credits: number;
  errors: string[];
};

export type SpotDcaRow = {
  address: string | null;
  label: string | null;
  depositAmount: number | null;
  depositSpent: number | null;
  remainingAmount: number | null;
  side: string | null;
  createdAtIso: string | null;
};
export type SpotDcaSection = {
  /** `null` means never asked (a non-Solana token); `[]` means Nansen answered with none. */
  vaults: SpotDcaRow[] | null;
  asked: boolean;
  credits: number;
  errors: string[];
};

/** Round 1.6.2: what one token-screener credit adds to a catalog row. */
export type MarketEnrichment = { ageDays: number | null; priceChangePct: number | null; fdvUsd: number | null; fdvMcRatio: number | null };
export type MarketEnrichResponse = {
  rows: Record<string, MarketEnrichment>;
  chains: number;
  groups: number;
  credits: number;
  skippedChains: string[];
  errors: string[];
  replay: boolean;
};

export type BookLevelDto = { price: number; size: number; cumulative: number };
export type OutcomeBook = { outcome: string; bids: BookLevelDto[]; asks: BookLevelDto[]; bestBid: number | null; bestAsk: number | null; spread: number | null };
export type PredictionBookSection = { books: OutcomeBook[] | null; snapshotIso: string | null; errors: string[] };

export type DepthResponse = {
  perpMarket?: PerpMarketSection;
  perpVenues?: PerpVenuesSection;
  perpTraders?: PerpTradersSection;
  perpChart?: PerpChartSection;
  spotHolders?: SpotHoldersSection;
  spotMarket?: SpotMarketSection;
  spotTape?: SpotTapeSection;
  spotWinners?: SpotWinnersSection;
  spotTransfers?: SpotTransfersSection;
  spotDca?: SpotDcaSection;
  predictionBook?: PredictionBookSection;
  credits: number;
  skipped: DepthSection[];
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
  topHoldings: { symbol: string; chain: string; valueUsd: number; tokenAddress?: string; name?: string | null; amount?: number | null }[];
  nansenUrl?: string;
  tokenCount?: number | null;
  chainHoldings?: { chain: string; valueUsd: number }[];
  holdingsTruncated?: boolean;
  tradeCount?: number | null;
  tradedTokenCount?: number | null;
  topPnlTokens?: { symbol: string; chain: string; tokenAddress: string; realizedPnlUsd: number | null }[];
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
  /** The leverage the trader **configured** on this position, not the account's own ratio. */
  leverage: number | null;
  valueUsd: number | null;
  /** Round 1.3.8: fields the free `clearinghouseState` call already carried. */
  returnOnEquity: number | null;
  /** Negative means this position has paid funding (see `fundingFlow` in core). */
  cumFundingAllTimeUsd: number | null;
  cumFundingSinceOpenUsd: number | null;
  maxLeverage: number | null;
  marginUsedUsd: number | null;
};

export type HyperliquidBadgeFill = { time: number; coin: string; dir: string; px: number | null; sz: number | null; closedPnlUsd: number | null };

export type HyperliquidBadge = {
  link: BadgeLink;
  accountValueUsd: number | null;
  marginUsedUsd: number | null;
  totalNotionalUsd: number | null;
  withdrawableUsd: number | null;
  maintenanceMarginUsd: number | null;
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

/** Round 1.5.5: one settled market from the page the card already pays for. */
export type PolymarketSettledMarket = {
  marketId: string;
  question: string;
  side: string;
  costUsd: number | null;
  proceedsUsd: number | null;
  redemptionUsd: number | null;
  pnlUsd: number | null;
};

export type PolymarketBadge = {
  link: BadgeLink;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  winRate: number | null;
  marketsTraded: number | null;
  marketsWon: number | null;
  /** Round 1.5.4. First seen **on Polymarket** — never presented as the age of the wallet.
   * Optional: an older backend does not send them and the line is simply omitted. */
  firstSeen?: string | null;
  polymarketDays?: number | null;
  p2pTokensSent?: number | null;
  p2pTokensReceived?: number | null;
  openPositions: PolymarketBadgePosition[] | null;
  trades: PolymarketBadgeTrade[] | null;
  /** Round 1.5.5. The largest settled results; `settledCount` is what they are a slice of. */
  settled?: PolymarketSettledMarket[] | null;
  settledCount?: number | null;
  settledPnlUsd?: number | null;
  errors: string[];
};

export type AuthorBadgesResponse = {
  handle: string;
  replay?: boolean;
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

export type WalletPortfolio = { totalUsd: number; holdings: WalletHolding[]; chains: string[]; tokenCount: number; chainHoldings?: {chain:string;valueUsd:number}[]; holdingsTruncated?:boolean };

export type WalletPnl = {
  /** Round 1.5.2: `realizedRoi` is a fraction (0.0071 is +0.71%). Optional — an older backend
   * does not send it and the row shows its money without a percentage. */
  topPnlTokens?: { symbol:string;chain:string;tokenAddress:string;realizedPnlUsd:number|null;realizedRoi?:number|null }[];
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
  sampleData?: boolean;
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

// ---- The two priced perp presses (POST /api/perp/ladder, POST /api/perp/win-rate) ----
//
// Round 2.5. Neither is part of a card load or of opening a tab: each is a button that states
// its price, so nothing here stacks on the panel's own 12 credits.

/** Round 2.5: one cohort's largest open positions, 5 credits. Mirrors `PerpCohortLadderSection`. */
export type PerpLadderResponse = {
  cohort: "all_traders" | "whale" | "public_figure";
  positions: PerpPosition[] | null;
  /** Whether the page was the whole population, and how many rows came back — the same two
   * facts the Smart Money ladder's aside already states. */
  isLastPage: boolean | null;
  returned: number | null;
  credits: number;
  errors: string[];
};

/** Round 2.5: one leaderboard trader's win rate, 1 credit. Mirrors `PerpWinRate`. */
export type PerpWinRateResponse = {
  address: string;
  /** 0-1 as Nansen reports it. */
  winRate: number | null;
  closedTrades: number | null;
  winningTrades: number | null;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  tradedCoinCount: number | null;
  windowDays: number;
  credits: number;
  error: string | null;
};

// ---- The 1-credit lazy wallet views (POST /api/wallet/defi, POST /api/wallet/unrealized) ----

/** Round 1.5.6. Never summed into the Tokens figure, and `totalDebtsUsd` is never netted. */
export type WalletDefi = {
  totalValueUsd: number | null;
  totalAssetsUsd: number | null;
  totalDebtsUsd: number | null;
  totalRewardsUsd: number | null;
  tokenCount: number | null;
  protocolCount: number | null;
  /** Nansen answered and reported nothing. Still not "$0": `portfolio/defi-holdings` has no
   * documented Solana support, so "none found" and "none" are different statements. */
  reportedNone: boolean;
};

export type WalletDefiResponse = {
  address: string;
  defi: WalletDefi | null;
  label: WalletLabel | null;
  labelChain: string | null;
  credits: number;
  errors: string[];
};

/** Round 1.5.7. No `chain` on a row: with `chain: "all"` Nansen does not say which one. */
export type WalletUnrealizedRow = {
  symbol: string;
  unrealizedPnlUsd: number | null;
  unrealizedRoi: number | null;
  costBasisUsd: number | null;
  holdingUsd: number | null;
  holdingAmount: number | null;
  avgSoldPriceUsd: number | null;
  buys: number | null;
  sells: number | null;
};

export type WalletUnrealizedResponse = {
  address: string;
  rows: WalletUnrealizedRow[] | null;
  truncated: boolean;
  windowDays: number;
  credits: number;
  errors: string[];
};

// ---- Round 2.3 wallet depth (POST /api/wallet/activity, /origin, /counterparties) ----

/**
 * One row of `profiler/address/transactions`. `valueUsd` is null on a fifth of the recorded
 * page: an unpriced transfer, rendered as a dash and never as $0.
 */
export type WalletActivityRow = {
  timeIso: string | null;
  chain: string | null;
  /** Read off which array the token legs arrived in, never inferred from the addresses. */
  direction: "sent" | "received" | "both" | null;
  valueUsd: number | null;
  txHash: string | null;
  sourceType: string | null;
  token: { symbol: string | null; amount: number | null; valueUsd: number | null } | null;
  legCount: number;
  /** Nansen's own label for the other end when it sent one; otherwise just the address. */
  counterparty: { address: string | null; label: string | null } | null;
};

export type WalletActivityResponse = {
  address: string;
  rows: WalletActivityRow[] | null;
  truncated: boolean;
  windowDays: number;
  /** The newest returned timestamp: the only thing "last active" is ever allowed to mean. */
  lastActiveIso: string | null;
  chains: string[];
  credits: number;
  errors: string[];
};

/**
 * Round 2.3 origin. `relation` is Nansen's raw string ("First Funder"); nothing in the card
 * turns it into "same owner" or "linked to", and none of this feeds a signal or a block.
 */
export type WalletOriginResponse = {
  address: string;
  firstFunder: { address: string | null; name: string | null; timeIso: string | null; chain: string | null; txHash: string | null } | null;
  /** Nansen answered with no funder row. Distinct from "we could not ask". */
  firstFunderReportedNone: boolean;
  /** False on a non-EVM address: the lookup is EVM-only, so it is not asked and not charged. */
  firstFunderAsked: boolean;
  related: { address: string | null; label: string | null; relation: string | null; timeIso: string | null; chain: string | null }[] | null;
  relatedChain: string | null;
  /** Measured: related-wallets returns the first funder as a relation, so it is one fact. */
  firstFunderAlsoRelated: boolean;
  credits: number;
  errors: string[];
};

/** Round 2.3 counterparties. `labels` is empty on most rows: unlabelled, not unknown-and-guessed. */
export type WalletCounterpartyRow = {
  address: string | null;
  labels: string[];
  interactions: number | null;
  volumeInUsd: number | null;
  volumeOutUsd: number | null;
  totalVolumeUsd: number | null;
  topToken: string | null;
};

export type WalletCounterpartiesResponse = {
  address: string;
  rows: WalletCounterpartyRow[] | null;
  truncated: boolean;
  windowDays: number;
  credits: number;
  errors: string[];
};
