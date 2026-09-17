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

/** TTLs for the dated endpoints; callers bucket their `to` to the same window (see bucketNow). */
export const WHO_BOUGHT_SOLD_TTL = 5 * MIN;
export const OHLCV_TTL = 5 * MIN;
export const PERP_SCREENER_TTL = 2 * MIN;

type Paged<T> = { data: T[]; pagination?: { is_last_page: boolean } };

export const nansen = {
  flowIntel: (chain: string, token_address: string, timeframe: string) =>
    nansenPost<{ data: FlowRow[] }>({ name: "flowIntel", path: "tgm/flow-intelligence", body: { chain, token_address, timeframe }, ttlMs: 5 * MIN }),

  whoBoughtSold: (chain: string, token_address: string, side: "BUY" | "SELL", from: string, to: string) =>
    nansenPost<Paged<WhoRow>>({
      name: side === "BUY" ? "whoBought" : "whoSold",
      path: "tgm/who-bought-sold",
      body: {
        chain,
        token_address,
        buy_or_sell: side,
        date: { from, to },
        pagination: { page: 1, per_page: 8 },
        order_by: [{ field: side === "BUY" ? "bought_volume_usd" : "sold_volume_usd", direction: "DESC" }],
      },
      ttlMs: WHO_BOUGHT_SOLD_TTL,
    }),

  /** Token metadata; only its `logo` URL is used (the card header). Logos rarely change: 24h. */
  tokenInformation: (chain: string, token_address: string) =>
    nansenPost<{ data: { logo?: string | null } | null }>({
      name: "tokenInformation",
      path: "tgm/token-information",
      body: { chain, token_address, timeframe: "1d" },
      ttlMs: 24 * HOUR,
    }),

  indicators: (chain: string, token_address: string) =>
    nansenPost<IndicatorsResp>({ name: "indicators", path: "tgm/indicators", body: { chain, token_address }, ttlMs: 6 * HOUR }),

  ohlcv: (chain: string, token_address: string, timeframe: string, from: string, to: string) =>
    nansenPost<{ data: Candle[] }>({
      name: "ohlcv",
      path: "tgm/token-ohlcv",
      body: { chain, token_address, timeframe, date: { from, to } },
      ttlMs: OHLCV_TTL,
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
    nansenPost<Paged<{ chain: string; token_address: string; token_symbol: string; value_usd: number | null }>>({
      name: "entityBalances",
      path: "profiler/address/current-balance",
      body: { entity_name, chain: "all", hide_spam_token: true, pagination: { page: 1, per_page: 200 } },
      ttlMs: 30 * MIN,
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

  pmTrades: (market_id: string) =>
    nansenPost<Paged<PmTrade>>({
      name: "pmTrades",
      path: "prediction-market/trades-by-market",
      body: { market_id, pagination: { page: 1, per_page: 15 }, order_by: [{ field: "timestamp", direction: "DESC" }] },
      ttlMs: 2 * MIN,
    }),
};
