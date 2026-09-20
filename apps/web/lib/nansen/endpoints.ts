import type {
  Candle,
  FlowRow,
  IndicatorsResp,
  NetflowRow,
  PerpPosition,
  PerpScreenerRow,
  PerpTrade,
  PmHolder,
  PmMarket,
  PmTrade,
  WhoRow,
} from "@tripwire/core";
import { bucketNow, isoNoMs } from "../intel/util";
import { nansenPost } from "./client";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The date-only form the leaderboard endpoints require ("YYYY-MM-DD"), UTC. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** TTLs for the dated endpoints; callers bucket their `to` to the same window (see bucketNow). */
export const WHO_BOUGHT_SOLD_TTL = 5 * MIN;
export const OHLCV_TTL = 5 * MIN;
export const PERP_SCREENER_TTL = 2 * MIN;
/** The 5-credit perp PnL leaderboard: one call per coin per 5 minutes, and only on demand. */
export const PERP_LEADERBOARD_TTL = 5 * MIN;
/** Name, symbol, logo and a day's volume: one call per token per day. */
export const TOKEN_INFO_TTL = 24 * 60 * MIN;
/** The 7-day window the drawdown signal is measured over; part of the verdict, so it is cached
 * far longer than the hoverable chart, which the user can move around at will. */
export const DRAWDOWN_TTL = 60 * MIN;
export const DRAWDOWN_DAYS = 8;

/** The chart's cache window per candle interval: about 20 candles' worth, floored at a minute
 * and capped at a quarter hour, so a 1-minute chart stays live and a 1-hour chart stays cheap. */
export const CANDLE_TTL: Record<string, number> = {
  "1m": MIN,
  "5m": 2 * MIN,
  "15m": 5 * MIN,
  "1h": 15 * MIN,
};

/**
 * `tgm/token-information` as the API returns it.
 *
 * Every field is optional: this is the recorded shape, not a contract, and `toTokenInfo` turns
 * anything absent into `null` rather than a zero. `spot_metrics` is scoped by the request's
 * `timeframe`, which is hardcoded to `"1d"` below — so every figure inside it is 24h.
 */
export type TokenInformationResponse = {
  name?: string | null;
  symbol?: string | null;
  contract_address?: string | null;
  logo?: string | null;
  token_details?: {
    market_cap_usd?: number | null;
    fdv_usd?: number | null;
    /** UTC, space-separated, no offset ("2023-11-20 19:22:43"). */
    token_deployment_date?: string | null;
    circulating_supply?: number | null;
    total_supply?: number | null;
  } | null;
  spot_metrics?: {
    volume_total_usd?: number | null;
    liquidity_usd?: number | null;
    total_holders?: number | null;
    buy_volume_usd?: number | null;
    sell_volume_usd?: number | null;
    total_buys?: number | null;
    total_sells?: number | null;
    unique_buyers?: number | null;
    unique_sellers?: number | null;
  } | null;
};

const DAY = 24 * HOUR;
export const ENTITY_PNL_TTL = 30 * MIN;
export const ENTITY_PNL_WINDOW_DAYS = 90;
export const PERP_PNL_WINDOW_DAYS = 30;
/** Polymarket and Nansen perp badge data. */
export const BADGE_TTL = 10 * MIN;

type Paged<T> = { data: T[]; pagination?: { is_last_page: boolean } };

export type EntityPnlSummary = {
  realized_pnl_usd: number | null;
  win_rate: number | null;
  traded_times?: number | null;
  traded_token_count?: number | null;
  top5_tokens?: { token_symbol: string; chain: string; token_address: string; realized_pnl: number | null }[] | null;
};
export type PerpPnlSummary = { realized_pnl_usd: number | null; win_rate: number | null; closed_trade_count?: number | null };
export type PmAddressSummary = {
  total_pnl_usd: number | null;
  realized_pnl_usd: number | null;
  unrealized_pnl_usd: number | null;
  win_rate: number | null;
  markets_won: number | null;
  markets_traded: number | null;
};
export type PmAddressMarket = {
  market_id: string;
  question: string | null;
  side_held: string | null;
  net_buy_cost_usd: number | null;
  net_sell_proceeds_usd: number | null;
  unrealized_value_usd: number | null;
  total_pnl_usd: number | null;
  market_resolved: boolean | null;
};
/** Wallet lens: how long each block of a wallet's profile stays fresh. */
export const WALLET_BALANCE_TTL = 30 * MIN;
export const WALLET_POSITIONS_TTL = 10 * MIN;
export const WALLET_PNL_WINDOW_DAYS = 90;
/** `profiler/labels` costs 100 credits, so an answer is kept for a day. */
export const WALLET_LABELS_TTL = 24 * HOUR;

export type AddressBalanceRow = {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_name?: string | null;
  token_amount?: number | null;
  price_usd?: number | null;
  value_usd: number | null;
};
/** `profiler/address/pnl-summary` answers flat for an address (measured), unlike the entity form. */
export type AddressPnlSummary = {
  realized_pnl_usd: number | null;
  realized_pnl_percent?: number | null;
  win_rate: number | null;
  traded_times?: number | null;
  traded_token_count?: number | null;
  top5_tokens?: { token_symbol: string; chain: string; token_address: string; realized_pnl: number | null }[] | null;
};
export type AddressLabelsResponse = { labels?: string[] | null; entity?: string | null } | Record<string, unknown>;

export type PmAddressTrade = {
  timestamp: string;
  taker_action: string | null;
  side: string | null;
  size: number | null;
  price: number | null;
  usdc_value: number | null;
  market_question: string | null;
  seller?: string | null;
  buyer?: string | null;
};

/**
 * `tgm/indicators`: **5 credits**, and Nansen recomputes the scores in a daily batch, so asking
 * four times a day bought the same answer four times. 24h, not 6h.
 *
 * Verdict-safe: the only signal that reads this response is `risk_high_count`, which is in no
 * shipped preset (`packages/core/src/rules/presets.ts`, `signals/spot.ts`). Saves about
 * 5 credits per token per day.
 */
export const INDICATORS_TTL = 24 * HOUR;

export const nansen = {
  /**
   * `warnings[]` is part of this response and is **not** a failure: it carries documented
   * limitations ("exchange_wallet_count is always 0"). It rides its own channel to the card so
   * a limitation never renders as "Unavailable:" and never turns a verdict UNCHECKED.
   */
  flowIntel: (chain: string, token_address: string, timeframe: string) =>
    nansenPost<{ data: FlowRow[]; warnings?: unknown }>({
      name: "flowIntel",
      path: "tgm/flow-intelligence",
      body: { chain, token_address, timeframe },
      ttlMs: 5 * MIN,
    }),

  whoBoughtSold: (chain: string, token_address: string, side: "BUY" | "SELL", from: string, to: string) =>
    nansenPost<Paged<WhoRow>>({
      name: side === "BUY" ? "whoBought" : "whoSold",
      path: "tgm/who-bought-sold",
      body: {
        chain,
        token_address,
        buy_or_sell: side,
        date: { from, to },
        // 20, not 8: the expanded card shows the whole list, and one page costs what one
        // page costs either way.
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: side === "BUY" ? "bought_volume_usd" : "sold_volume_usd", direction: "DESC" }],
      },
      ttlMs: WHO_BOUGHT_SOLD_TTL,
    }),

  /**
   * The token's identity (name, symbol, logo) and its current spot metrics. 1 credit, measured.
   *
   * `spot_metrics.volume_total_usd` is the denominator behind every volume-normalized signal,
   * so this is no longer a cosmetic call: without it the spot verdict is UNCHECKED. Names,
   * logos and a day's volume all move slowly, so one call per token per day is enough.
   */
  tokenInformation: (chain: string, token_address: string) =>
    nansenPost<{ data: TokenInformationResponse | null }>({
      name: "tokenInformation",
      path: "tgm/token-information",
      body: { chain, token_address, timeframe: "1d" },
      ttlMs: TOKEN_INFO_TTL,
    }),

  indicators: (chain: string, token_address: string) =>
    nansenPost<IndicatorsResp>({ name: "indicators", path: "tgm/indicators", body: { chain, token_address }, ttlMs: INDICATORS_TTL }),

  ohlcv: (chain: string, token_address: string, timeframe: string, from: string, to: string, ttlMs: number = OHLCV_TTL) =>
    nansenPost<{ data: Candle[] }>({
      name: "ohlcv",
      path: "tgm/token-ohlcv",
      body: { chain, token_address, timeframe, date: { from, to } },
      ttlMs,
    }),

  smNetflow: (chain: string, token_address: string) =>
    nansenPost<Paged<NetflowRow>>({
      name: "smNetflow",
      path: "smart-money/netflow",
      body: { chains: [chain], filters: { token_address: [token_address], include_stablecoins: true, include_native_tokens: true }, pagination: { page: 1, per_page: 1 } },
      ttlMs: 15 * MIN,
    }),

  searchGeneral: (search_query: string, result_type: "token" | "entity" | "any", limit = 10) =>
    nansenPost<{
      tokens: { name: string; symbol: string; chain: string; address: string; volume_24h: number | null; market_cap: number | null }[];
      entities: { name: string; tags: string[] }[];
    }>({ name: `search_${result_type}`, path: "search/general", body: { search_query, result_type, limit }, ttlMs: 24 * HOUR }),

  entityBalances: (entity_name: string) =>
    nansenPost<Paged<AddressBalanceRow>>({
      name: "entityBalances",
      path: "profiler/address/current-balance",
      body: { entity_name, chain: "all", hide_spam_token: true, pagination: { page: 1, per_page: 200 } },
      ttlMs: 30 * MIN,
    }),

  /** Wallet lens: one address's holdings across every chain (1 credit). */
  addressBalances: (address: string) =>
    nansenPost<Paged<AddressBalanceRow>>({
      name: "addressBalances",
      path: "profiler/address/current-balance",
      body: { address, chain: "all", hide_spam_token: true, pagination: { page: 1, per_page: 200 } },
      ttlMs: WALLET_BALANCE_TTL,
    }),

  /** Wallet lens: realized PnL and win rate for one address over 90 days (1 credit). */
  addressPnlSummary: (address: string) => {
    const to = bucketNow(WALLET_BALANCE_TTL);
    const from = new Date(to.getTime() - WALLET_PNL_WINDOW_DAYS * DAY);
    return nansenPost<AddressPnlSummary>({
      name: "addressPnlSummary",
      path: "profiler/address/pnl-summary",
      body: { address, chain: "all", date: { from: isoNoMs(from), to: isoNoMs(to) } },
      ttlMs: WALLET_BALANCE_TTL,
    });
  },

  /**
   * Wallet lens: Nansen's own labels for an address. **100 credits.** Never called on its own;
   * only `POST /api/wallet/labels`, behind the `NANSEN_ALLOW_PREMIUM` gate and a button that
   * states the price, reaches it.
   */
  addressLabels: (address: string) =>
    nansenPost<{ data?: AddressLabelsResponse[] | null } | AddressLabelsResponse>({
      name: "addressLabels",
      path: "profiler/labels",
      body: { address },
      ttlMs: WALLET_LABELS_TTL,
    }),

  perpScreener: (token_symbol: string) => {
    // `to` bucketed to the TTL, `from` derived from it: one cache key per 2-minute window.
    const to = bucketNow(PERP_SCREENER_TTL);
    const from = new Date(to.getTime() - 24 * HOUR);
    return nansenPost<Paged<PerpScreenerRow>>({
      name: "perpScreener",
      path: "perp-screener",
      body: { date: { from: isoNoMs(from), to: isoNoMs(to) }, filters: { trader_type: "sm", token_symbol }, pagination: { page: 1, per_page: 1 } },
      ttlMs: PERP_SCREENER_TTL,
    });
  },

  perpPositions: (token_symbol: string) =>
    nansenPost<Paged<PerpPosition>>({
      name: "perpPositions",
      path: "tgm/perp-positions",
      body: { token_symbol, label_type: "smart_money", pagination: { page: 1, per_page: 50 }, order_by: [{ field: "position_value_usd", direction: "DESC" }] },
      ttlMs: 2 * MIN,
    }),

  smPerpTrades: (token_symbol: string) =>
    nansenPost<Paged<PerpTrade>>({
      name: "smPerpTrades",
      path: "smart-money/perp-trades",
      body: { filters: { token_symbol }, lookback_hours: 24, only_new_positions: false, pagination: { page: 1, per_page: 12 } },
      ttlMs: 5 * MIN,
    }),

  /**
   * Perp card, Traders tab: the coin's top traders by PnL. **5 credits**, so it is never part of
   * a card's own load -- only the Traders tab or the expanded view asks for it.
   *
   * `premium_labels` stays off: it costs 150 credits a call.
   */
  perpPnlLeaderboard: (token_symbol: string) => {
    const to = bucketNow(PERP_LEADERBOARD_TTL);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "perpPnlLeaderboard",
      path: "tgm/perp-pnl-leaderboard",
      body: {
        token_symbol,
        date: { from: ymd(new Date(to.getTime() - PERP_PNL_WINDOW_DAYS * DAY)), to: ymd(to) },
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: "pnl_usd_realised", direction: "DESC" }],
      },
      ttlMs: PERP_LEADERBOARD_TTL,
    });
  },

  /** Perp card, Traders tab: every recent trade in this coin, labeled -- not just Smart Money's. */
  tokenPerpTrades: (token_symbol: string) => {
    const to = bucketNow(2 * MIN);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "tokenPerpTrades",
      path: "tgm/perp-trades",
      body: {
        token_symbol,
        date: { from: isoNoMs(new Date(to.getTime() - 24 * HOUR)), to: isoNoMs(to) },
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: "value_usd", direction: "DESC" }],
      },
      ttlMs: 2 * MIN,
    });
  },

  /** Perp card, Traders tab: the top Hyperliquid accounts overall, with their five largest open
   * positions -- which is how the card knows whether any of them is in this coin right now.
   * Slow-moving, so one call an hour. */
  hyperliquidLeaderboard: () => {
    const to = bucketNow(HOUR);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "hyperliquidLeaderboard",
      path: "perp-leaderboard",
      body: {
        date: { from: ymd(new Date(to.getTime() - PERP_PNL_WINDOW_DAYS * DAY)), to: ymd(to) },
        pagination: { page: 1, per_page: 50 },
        order_by: [{ field: "total_pnl", direction: "DESC" }],
      },
      ttlMs: HOUR,
    });
  },

  /** Spot card, expanded only: who holds the token. **5 credits**, lazy, never in a card's load.
   * `premium_labels` stays off (150 credits). */
  tokenHolders: (chain: string, token_address: string) =>
    nansenPost<Paged<Record<string, unknown>>>({
      name: "tokenHolders",
      path: "tgm/holders",
      body: {
        chain,
        token_address,
        label_type: "all_holders",
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: "value_usd", direction: "DESC" }],
      },
      ttlMs: 10 * MIN,
    }),

  /** Prediction card, expanded only: the market's resting book, one row per price level. */
  pmScreener: (query: string) =>
    nansenPost<Paged<PmMarket>>({
      name: "pmScreener",
      path: "prediction-market/market-screener",
      body: { query, status: "active", pagination: { page: 1, per_page: 25 } },
      ttlMs: HOUR,
    }),

  pmTopHolders: (market_id: string) =>
    nansenPost<Paged<PmHolder>>({
      name: "pmTopHolders",
      path: "prediction-market/top-holders",
      body: { market_id, pagination: { page: 1, per_page: 20 }, order_by: [{ field: "position_size", direction: "DESC" }] },
      ttlMs: 5 * MIN,
    }),

  pmPnlByAddress: (address: string) =>
    nansenPost<Paged<{ total_pnl_usd: number | null }>>({
      name: "pmPnlByAddress",
      path: "prediction-market/pnl-by-address",
      body: { address, pagination: { page: 1, per_page: 1000 } },
      ttlMs: 24 * HOUR,
    }),

  /** Author badge (Nansen): realized PnL and win rate of a labeled entity over 90 days. */
  entityPnlSummary: (entity_name: string) => {
    const to = bucketNow(ENTITY_PNL_TTL);
    const from = new Date(to.getTime() - ENTITY_PNL_WINDOW_DAYS * DAY);
    return nansenPost<EntityPnlSummary>({
      name: "entityPnlSummary",
      path: "profiler/address/pnl-summary",
      body: { entity_name, chain: "all", date: { from: isoNoMs(from), to: isoNoMs(to) } },
      ttlMs: ENTITY_PNL_TTL,
    });
  },

  /** Author badge (Hyperliquid): Nansen's realized perp PnL and win rate over 30 days (1 credit). */
  perpPnlSummary: (address: string) => {
    const to = bucketNow(BADGE_TTL);
    const from = new Date(to.getTime() - PERP_PNL_WINDOW_DAYS * DAY);
    return nansenPost<{ data: PerpPnlSummary | null }>({
      name: "perpPnlSummary",
      path: "profiler/perp-pnl-summary",
      body: { address, date: { from: isoNoMs(from), to: isoNoMs(to) } },
      ttlMs: BADGE_TTL,
    });
  },

  /** Author badge (Polymarket): wallet-level PnL and win rate. */
  pmAddressSummary: (address: string) =>
    nansenPost<{ data: PmAddressSummary[] }>({ name: "pmAddressSummary", path: "prediction-market/address-summary", body: { address }, ttlMs: BADGE_TTL }),

  /** Author badge (Polymarket): every market the wallet holds, open ones included. Ordered, so its
   * cache entry stays apart from pmPnlByAddress's 24h one. Same replay fixture. */
  pmMarketsByAddress: (address: string) =>
    nansenPost<Paged<PmAddressMarket>>({
      name: "pmPnlByAddress",
      path: "prediction-market/pnl-by-address",
      body: { address, pagination: { page: 1, per_page: 1000 }, order_by: [{ field: "total_pnl_usd", direction: "DESC" }] },
      ttlMs: BADGE_TTL,
    }),

  /** Author badge (Polymarket): the wallet's last 5 trades. */
  pmTradesByAddress: (address: string) =>
    nansenPost<Paged<PmAddressTrade>>({
      name: "pmTradesByAddress",
      path: "prediction-market/trades-by-address",
      body: { address, pagination: { page: 1, per_page: 5 }, order_by: [{ field: "timestamp", direction: "DESC" }] },
      ttlMs: BADGE_TTL,
    }),

  pmTrades: (market_id: string) =>
    nansenPost<Paged<PmTrade>>({
      name: "pmTrades",
      path: "prediction-market/trades-by-market",
      body: { market_id, pagination: { page: 1, per_page: 15 }, order_by: [{ field: "timestamp", direction: "DESC" }] },
      ttlMs: 2 * MIN,
    }),
};
