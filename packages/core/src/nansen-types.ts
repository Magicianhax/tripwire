/** Raw Nansen API row shapes (subset of fields Tripwire uses). */

export type FlowRow = {
  smart_trader_net_flow_usd: number | null;
  smart_trader_wallet_count: number | null;
  /** Mean two-sided flow per wallet in the segment; × wallet_count is the segment's turnover. */
  smart_trader_avg_flow_usd?: number | null;
  whale_net_flow_usd: number | null;
  whale_wallet_count: number | null;
  whale_avg_flow_usd?: number | null;
  public_figure_net_flow_usd: number | null;
  public_figure_wallet_count: number | null;
  public_figure_avg_flow_usd?: number | null;
  top_pnl_net_flow_usd: number | null;
  top_pnl_wallet_count: number | null;
  top_pnl_avg_flow_usd?: number | null;
  exchange_net_flow_usd: number | null;
  fresh_wallets_net_flow_usd: number | null;
  fresh_wallets_wallet_count: number | null;
  fresh_wallets_avg_flow_usd?: number | null;
};

/** `tgm/token-information`: the token's identity and its current spot metrics. */
export type TokenInfo = {
  name: string | null;
  symbol: string | null;
  logoUrl: string | null;
  marketCapUsd: number | null;
  /** 24h spot volume; the denominator behind every volume-normalized signal. */
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
};

export type NetflowRow = {
  token_address: string;
  token_symbol: string;
  net_flow_1h_usd: number | null;
  net_flow_24h_usd: number | null;
  net_flow_7d_usd: number | null;
  net_flow_30d_usd: number | null;
  trader_count?: number;
  market_cap_usd?: number | null;
};

export type Indicator = {
  indicator_type: string;
  score: string;
  signal: number | null;
  signal_percentile: number | null;
  last_trigger_on?: string | null;
};

export type IndicatorsResp = {
  token_info?: { market_cap_usd?: number | null; market_cap_group?: string | null } | null;
  risk_indicators: Indicator[];
  reward_indicators: Indicator[];
};

export type WhoRow = {
  address: string;
  address_label: string | null;
  bought_volume_usd: number | null;
  sold_volume_usd: number | null;
  trade_volume_usd: number | null;
};

export type Candle = { interval_start: string; open: number; high: number; low: number; close: number; volume_usd: number | null };

export type PerpScreenerRow = {
  token_symbol: string;
  mark_price: number | null;
  /** Hyperliquid's hourly funding rate, as a decimal (see PERP_VENUES in perp-venues.ts). */
  funding: number | null;
  open_interest: number | null;
  current_smart_money_position_longs_usd: number | null;
  /** negative number */
  current_smart_money_position_shorts_usd: number | null;
  smart_money_longs_count: number | null;
  smart_money_shorts_count: number | null;
  net_position_change?: number | null;
  /** Smart Money turnover in the window, and the two sides of it: the buy/sell pressure the
   * Positioning tab reads out. */
  smart_money_volume?: number | null;
  smart_money_buy_volume?: number | null;
  smart_money_sell_volume?: number | null;
  /** Distinct Smart Money traders in this market in the window. */
  trader_count?: number | null;
  previous_price_usd?: number | null;
};

export type PerpPosition = {
  address: string;
  address_label: string | null;
  side: "Long" | "Short";
  position_value_usd: number;
  leverage: string | null;
  entry_price: number | null;
  mark_price: number | null;
  liquidation_price: number | null;
  upnl_usd: number | null;
  /** Signed coin size (negative for a short). */
  position_size?: number | null;
  leverage_type?: string | null;
  /** Funding this position has paid (positive) or received (negative) so far. */
  funding_usd?: number | null;
};

export type PerpTrade = {
  trader_address_label: string | null;
  trader_address: string;
  token_symbol: string;
  side: "Long" | "Short";
  action: string;
  value_usd: number;
  price_usd: number;
  block_timestamp: string;
};

export type PmMarket = {
  market_id: string;
  question: string;
  slug: string;
  event_title: string;
  best_bid: number | null;
  best_ask: number | null;
  last_trade_price: number | null;
  volume_24hr?: number | null;
  liquidity?: number | null;
  end_date?: string | null;
};

export type PmHolder = {
  market_id: string;
  address: string;
  owner_address: string;
  side: string; // "Yes" | "No" (or outcome label)
  position_size: number;
  avg_entry_price: number | null;
  current_price: number | null;
  unrealized_pnl_usd: number | null;
};

export type PmTrade = {
  timestamp: string;
  taker_action: string;
  side: string;
  size: number;
  price: number;
  usdc_value: number;
};
