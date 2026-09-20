import type {
  Candle,
  FlowRow,
  IndicatorsResp,
  NetflowRow,
  PerpPosition,
  PerpPositionIntelligence,
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
export type PerpPnlSummary = {
  realized_pnl_usd: number | null;
  win_rate: number | null;
  closed_trade_count?: number | null;
  /** Round 2.5: already in the recorded response, and the reason a win rate is readable rather
   * than a bare percentage — 41.4% means something different across 12 trades and 585,166. */
  winning_trade_count?: number | null;
  traded_coin_count?: number | null;
  /** A fraction (−0.0312 is −3.12%), the same convention as the leaderboard's ROI. */
  realized_pnl_percent?: number | null;
};
export type PmAddressSummary = {
  total_pnl_usd: number | null;
  realized_pnl_usd: number | null;
  unrealized_pnl_usd: number | null;
  win_rate: number | null;
  markets_won: number | null;
  markets_traded: number | null;
  /** Round 1.5.4. The date this address was **first seen on Polymarket** ("2026-06-05"), and the
   * days since. Not wallet age: the address existed before Polymarket ever saw it. */
  first_seen?: string | null;
  wallet_age_days?: number | null;
  p2p_tokens_sent?: number | null;
  p2p_tokens_received?: number | null;
};
export type PmAddressMarket = {
  market_id: string;
  question: string | null;
  side_held: string | null;
  net_buy_cost_usd: number | null;
  net_sell_proceeds_usd: number | null;
  /** Round 1.5.5. What a settled winning position paid out; 0 on a losing one. */
  redemption_value_usd?: number | null;
  event_title?: string | null;
  unrealized_value_usd: number | null;
  total_pnl_usd: number | null;
  market_resolved: boolean | null;
};

/**
 * `portfolio/defi-holdings` (Round 1.5.6), **1 credit**. The reason a lending or LP wallet reads
 * `$0`: `profiler/address/current-balance` counts token rows and nothing else.
 *
 * Measured 2026-09-20 on three public wallets: the answer is `{ summary, protocols }`, **not**
 * the `{ data }` shape the rest of this file uses, and all three came back with every summary
 * figure 0 and `protocols: []`. A populated `protocols[]` has therefore never been observed, so
 * its row shape stays `unknown` and nothing is rendered per protocol.
 */
export type DefiHoldingsResponse = {
  summary?: {
    total_value_usd?: number | null;
    total_assets_usd?: number | null;
    total_debts_usd?: number | null;
    total_rewards_usd?: number | null;
    token_count?: number | null;
    protocol_count?: number | null;
  } | null;
  protocols?: unknown[] | null;
};

/**
 * `profiler/address/pnl` (Round 1.5.7), **1 credit**. One row per token the address has traded,
 * with the unrealized half `pnl-summary` does not carry.
 *
 * **Measured, not assumed:** `chain: "all"` *is* accepted (the plan asked for this to be probed
 * on the first live call), but the rows that come back **carry no `chain` field** — the recorded
 * wallet has three separate `ETH` rows at the same `0xeee…eee` native sentinel address. So a row
 * can be shown, and can never be attributed to a chain or linked to a token page.
 */
export type AddressPnlRow = {
  token_address?: string | null;
  token_symbol?: string | null;
  token_price?: number | null;
  pnl_usd_realised?: number | null;
  pnl_usd_unrealised?: number | null;
  roi_percent_realised?: number | null;
  roi_percent_unrealised?: number | null;
  cost_basis_usd?: number | null;
  holding_amount?: number | null;
  holding_usd?: number | null;
  avg_sold_price_usd?: number | null;
  /** Nansen returns these two as **strings** ("13"), not numbers. */
  nof_buys?: number | string | null;
  nof_sells?: number | string | null;
};

/**
 * `profiler/dex-trades` (Round 1.5.1), **1 credit**, chain-scoped with no `"all"` in the enum.
 *
 * Read only for `trader_address_label`, which replaces a label path that could never populate.
 * The field is optional and the recorded page is **empty** — measured 2026-09-20, three public
 * addresses over 30 and 360 days all answered `200` with `data: []` — so the row shape is read
 * defensively, exactly like `profiler/labels`, and an absent label stays an empty state.
 */
export type DexTradeRow = { trader_address_label?: string | null; block_timestamp?: string | null };

// ---- Round 2.3: wallet depth (activity, origin, counterparties) ------------------------------

/**
 * One token leg of a `profiler/address/transactions` row. Both `price_usd` and `value_usd` are
 * frequently `null` (every HyperEVM leg in the recorded page is), so a leg is shown with its
 * token amount and no dollar figure rather than a `$0`.
 *
 * `from_address_label` / `to_address_label` are Nansen's own strings ("Token Millionaire",
 * "High Activity [0x6b9e77]", "lighter.eth"). They are rendered verbatim and length-capped:
 * they are third-party text, and a row without one is an address, never a described actor.
 */
export type AddressTransactionToken = {
  token_symbol?: string | null;
  token_amount?: number | null;
  price_usd?: number | null;
  value_usd?: number | null;
  token_address?: string | null;
  chain?: string | null;
  from_address?: string | null;
  to_address?: string | null;
  from_address_label?: string | null;
  to_address_label?: string | null;
};

/**
 * `profiler/address/transactions` (Round 2.3), **1 credit**.
 *
 * **Measured on the first live call, as the brief required: `chain: "all"` is ACCEPTED, and
 * unlike `profiler/address/pnl` the rows *do* carry their own `chain`** — the recorded page
 * spans hyperevm, arbitrum, ethereum, bsc and robinhood in one answer. So one call covers a
 * multi-chain wallet and every row can still name the chain it happened on.
 *
 * `block_timestamp` arrives **without a zone** ("2026-09-18T17:20:11"), which `new Date()` would
 * read as local time; it is normalised to UTC before it leaves the backend.
 */
export type AddressTransactionRow = {
  chain?: string | null;
  /** The raw contract signature ("transfer(address,uint256)"), not a human sentence. */
  method?: string | null;
  tokens_sent?: AddressTransactionToken[] | null;
  tokens_received?: AddressTransactionToken[] | null;
  /** Null on 21 of the 100 recorded rows: an unpriced transfer, not a zero-value one. */
  volume_usd?: number | null;
  block_timestamp?: string | null;
  transaction_hash?: string | null;
  source_type?: string | null;
};

/**
 * `profiler/address/first-funder` (Round 2.3), **1 credit**, EVM only, `chain` fixed to `"all"`.
 * An empty `data: []` is documented as normal. The published credits table omits this endpoint;
 * the CLI's cost map prices it at 1 and the recorded call was billed 1.
 */
export type FirstFunderRow = {
  wallet_address?: string | null;
  first_funder_address?: string | null;
  /** Nansen's own name for the funder ("High Activity"), never an ownership claim. */
  first_funder_name?: string | null;
  transaction_hash?: string | null;
  block_timestamp?: string | null;
  chain?: string | null;
};

/**
 * `profiler/address/related-wallets` (Round 2.3), **1 credit**, chain-scoped.
 *
 * **Measured: `chain: "all"` is REJECTED (422).** The enum the error names is
 * `RELATED_WALLET_CHAINS` below. `relation` is rendered as the raw Nansen string and never
 * translated into "same owner" or "linked to".
 */
export type RelatedWalletRow = {
  address?: string | null;
  address_label?: string | null;
  /** Raw, e.g. "First Funder". Never re-worded. */
  relation?: string | null;
  transaction_hash?: string | null;
  block_timestamp?: string | null;
  order?: number | null;
  chain?: string | null;
};

/**
 * The chains `profiler/address/related-wallets` accepts, read from its own 422 (free, no credit)
 * on 2026-09-20. It is the only wallet call in this family with **no `"all"`**, and it does not
 * carry `hyperevm` — which is the recorded wallet's largest chain, so "the wallet's biggest
 * chain" is not a safe input. The caller picks the largest chain that is in this list.
 */
export const RELATED_WALLET_CHAINS = [
  "arbitrum", "arc", "avalanche", "base", "bitcoin", "bnb", "ethereum", "injective", "iotaevm",
  "linea", "mantle", "mantra", "monad", "near", "optimism", "plasma", "polygon", "robinhood",
  "sei", "solana", "sonic", "starknet", "sui", "ton", "tron",
] as const;

/**
 * `profiler/address/counterparties` (Round 2.3), **5 credits** — button-gated, never a card load.
 *
 * **Measured: `chain: "all"` is ACCEPTED**, so one call covers every chain. `counterparty_address_label`
 * is an **array and is empty on 36 of the 50 recorded rows**, so an unlabelled counterparty
 * renders as its address. Volume in and out are separate fields; neither is a claim about intent.
 */
export type CounterpartyRow = {
  counterparty_address?: string | null;
  counterparty_address_label?: string[] | null;
  interaction_count?: number | null;
  total_volume_usd?: number | null;
  volume_in_usd?: number | null;
  volume_out_usd?: number | null;
  tokens_info?: { token_symbol?: string | null; token_address?: string | null; num_transfer?: number | string | null }[] | null;
};

/** Wallet lens: how long each block of a wallet's profile stays fresh. */
export const WALLET_BALANCE_TTL = 30 * MIN;
export const WALLET_POSITIONS_TTL = 10 * MIN;
export const WALLET_PNL_WINDOW_DAYS = 90;
/** `profiler/labels` costs 100 credits, so an answer is kept for a day. */
export const WALLET_LABELS_TTL = 24 * HOUR;
/** Round 1.5.7: one page of `profiler/address/pnl`, ordered, so the slice is the largest rows. */
export const WALLET_PNL_ROWS = 50;
/** Round 1.5.1: the window `profiler/dex-trades` looks back over for the trade label. */
export const WALLET_TRADE_WINDOW_DAYS = 30;
/** Round 2.3: the activity feed's window and page size (100 is the documented `per_page` cap). */
export const WALLET_ACTIVITY_WINDOW_DAYS = 30;
export const WALLET_ACTIVITY_ROWS = 100;
/** Round 2.3: the counterparty window and page size. 5 credits, so one page and no fan-out. */
export const WALLET_COUNTERPARTY_WINDOW_DAYS = 30;
export const WALLET_COUNTERPARTY_ROWS = 50;
/** Round 2.3: which wallet first funded an address never changes, so the answer keeps for a day. */
export const WALLET_ORIGIN_TTL = 24 * HOUR;

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
  /** Round 1.5.2: `realized_roi` is on every row and was dropped at the mapper. A fraction. */
  top5_tokens?: { token_symbol: string; chain: string; token_address: string; realized_pnl: number | null; realized_roi?: number | null }[] | null;
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

// ---- Round 2.1: the spot card's depth sections ------------------------------------------------
// Each of these is one credit or five, tab- or button-gated, and never part of a card's load.

/** The tape is a sequence, so it is cached for about as long as a reader spends looking at it. */
export const TAPE_TTL = 2 * MIN;
/** Ordered newest-first, so a day's range is the ceiling and the rows decide the real span. */
export const TAPE_WINDOW_DAYS = 1;
/** `per_page` is not priced. A liquid token's 100 most recent trades spanned fourteen minutes in
 * the recording run, so a small page would be dust and MEV; the floor is applied on our side. */
export const TAPE_PAGE = 100;

/** Five credits: bought once per token per five minutes, and only from the expanded card. */
export const WINNERS_TTL = 5 * MIN;
export const WINNERS_WINDOW_DAYS = 30;

export const TRANSFERS_TTL = 5 * MIN;
export const TRANSFERS_WINDOW_DAYS = 1;

/** Jupiter DCA vaults are a trailing 14 days server-side and move slowly. */
export const DCA_TTL = 10 * MIN;

// ---- Round 1.6.2: the batched token-screener ---------------------------------------------------

/** One call covers a page of the catalog; 100 is far above the catalog's own 25-row search. */
export const SCREENER_PAGE = 100;
/**
 * Short on purpose. `token_age_days` would cache for a day, but `price_change` is a live 24h
 * figure arriving in the same response, and the half that goes stale is the half that misleads.
 */
export const SCREENER_TTL = 2 * MIN;

/**
 * `token-screener` as the API answered it on 2026-09-20. Every field optional: this is a
 * recorded shape, not a contract, and a row that omits one renders a dash rather than a zero.
 *
 * `price_change` is a **fraction** (`-0.0735` is `-7.35%`), unlike Dexscreener's `priceChange`,
 * which is already a percentage. Both go through `fractionToPct` / raw in core so the two
 * conventions cannot be printed as each other.
 */
export type TokenScreenerRow = {
  chain?: string | null;
  token_address?: string | null;
  token_symbol?: string | null;
  token_age_days?: number | null;
  price_usd?: number | null;
  price_change?: number | null;
  market_cap_usd?: number | null;
  fdv?: number | null;
  fdv_mc_ratio?: number | null;
  liquidity?: number | null;
  volume?: number | null;
};

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

  /**
   * Wallet card, Summary view (Round 1.5.6): the DeFi side of a portfolio, **1 credit**, lazy.
   * `wallet_address` is the only parameter — there is no chain filter, and no documented Solana
   * support, so an empty answer is "we were not told", never "$0 of DeFi".
   */
  defiHoldings: (wallet_address: string) =>
    nansenPost<DefiHoldingsResponse>({
      name: "defiHoldings",
      path: "portfolio/defi-holdings",
      body: { wallet_address },
      ttlMs: WALLET_BALANCE_TTL,
    }),

  /**
   * Wallet card, Performance view (Round 1.5.7): unrealized PnL and cost basis per token.
   * **1 credit**, lazy. `chain: "all"` is accepted (measured); `order_by` is explicit so a
   * long-tail wallet shows its largest open positions rather than an arbitrary slice.
   */
  addressPnl: (address: string) => {
    const to = bucketNow(WALLET_BALANCE_TTL);
    const from = new Date(to.getTime() - WALLET_PNL_WINDOW_DAYS * DAY);
    return nansenPost<Paged<AddressPnlRow>>({
      name: "addressPnl",
      path: "profiler/address/pnl",
      body: {
        address,
        chain: "all",
        date: { from: isoNoMs(from), to: isoNoMs(to) },
        pagination: { page: 1, per_page: WALLET_PNL_ROWS },
        order_by: [{ field: "pnl_usd_unrealised", direction: "DESC" }],
      },
      ttlMs: WALLET_BALANCE_TTL,
    });
  },

  /**
   * Wallet card, Summary view (Round 1.5.1): the chain-scoped trade label, **1 credit**, lazy
   * and bought in the same press as `defiHoldings`.
   *
   * The date range is **date-only** here ("YYYY-MM-DD"), which is what Nansen's own CLI sends;
   * a full ISO timestamp is accepted by `profiler/address/pnl` but answers an empty page on
   * this path.
   */
  dexTrades: (address: string, chain: string) => {
    const to = bucketNow(WALLET_BALANCE_TTL);
    return nansenPost<Paged<DexTradeRow>>({
      name: "dexTrades",
      path: "profiler/dex-trades",
      body: {
        address,
        chain,
        date: { from: ymd(new Date(to.getTime() - WALLET_TRADE_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        pagination: { page: 1, per_page: 25 },
        order_by: [{ field: "block_timestamp", direction: "DESC" }],
      },
      ttlMs: WALLET_BALANCE_TTL,
    });
  },

  /**
   * Wallet card, Activity view (Round 2.3): the time-ordered feed, **1 credit**, lazy.
   *
   * `chain: "all"` was probed on the first live call and accepted, and the rows carry their own
   * chain, so this is one call for a multi-chain wallet rather than a per-chain fan-out.
   * `hide_spam_token` defaults true server-side and is sent explicitly so the request says so.
   */
  addressTransactions: (address: string) => {
    const to = bucketNow(WALLET_BALANCE_TTL);
    return nansenPost<Paged<AddressTransactionRow>>({
      name: "addressTransactions",
      path: "profiler/address/transactions",
      body: {
        address,
        chain: "all",
        date: { from: ymd(new Date(to.getTime() - WALLET_ACTIVITY_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        pagination: { page: 1, per_page: WALLET_ACTIVITY_ROWS },
      },
      ttlMs: WALLET_BALANCE_TTL,
    });
  },

  /**
   * Wallet card, Connections view (Round 2.3): the address that first funded this one,
   * **1 credit**, lazy, **EVM only**. `chain` is fixed to `"all"` by the endpoint itself and it
   * rejects any extra field, so there is nothing to bucket and the answer keeps for a day.
   */
  addressFirstFunder: (address: string) =>
    nansenPost<Paged<FirstFunderRow>>({
      name: "firstFunder",
      path: "profiler/address/first-funder",
      body: { address, chain: "all" },
      ttlMs: WALLET_ORIGIN_TTL,
    }),

  /**
   * Wallet card, Connections view (Round 2.3): wallets Nansen relates to this one, **1 credit**,
   * lazy. The only call in this family with no `"all"` chain, so `chain` is required and must be
   * one of `RELATED_WALLET_CHAINS`.
   */
  addressRelatedWallets: (address: string, chain: string) =>
    nansenPost<Paged<RelatedWalletRow>>({
      name: "relatedWallets",
      path: "profiler/address/related-wallets",
      body: { address, chain, pagination: { page: 1, per_page: 50 } },
      ttlMs: WALLET_ORIGIN_TTL,
    }),

  /**
   * Wallet card, Connections view (Round 2.3): top counterparties by volume, **5 credits**.
   *
   * The second 5-credit call a wallet card can make, and like `profiler/labels` it is reachable
   * only from a button that prints its price. `chain: "all"` was probed and accepted, so this is
   * one call for the whole wallet; one page, because a second page is another 5 credits.
   */
  addressCounterparties: (address: string) => {
    const to = bucketNow(WALLET_BALANCE_TTL);
    return nansenPost<Paged<CounterpartyRow>>({
      name: "counterparties",
      path: "profiler/address/counterparties",
      body: {
        address,
        chain: "all",
        date: { from: ymd(new Date(to.getTime() - WALLET_COUNTERPARTY_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        pagination: { page: 1, per_page: WALLET_COUNTERPARTY_ROWS },
      },
      ttlMs: WALLET_BALANCE_TTL,
    });
  },

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

  /**
   * The same ladder for a cohort other than Smart Money (Round 2.5). **5 credits**, so it is
   * never part of a card load or of opening a tab — only of pressing a button that states the
   * price.
   *
   * It is deliberately a *different* `name` from `perpPositions`, for two reasons: the cache
   * and the ledger must not conflate two populations of the same coin, and replay needs a
   * recorded answer that is actually different. The recorded `all_traders` page is $1.71B
   * across its 50 rows against Smart Money's $573M — and the same wallet carries a different
   * label in each ("Uses \"EGAF\" HL Referral Code" against "Abraxas Capital"), which is why
   * a label from this call is shown as a label and never as an identity.
   *
   * One fixture serves all three cohorts in replay: the round's budget bought one live cohort,
   * and the shape is the same for the other two.
   */
  perpPositionsCohort: (token_symbol: string, label_type: "all_traders" | "whale" | "public_figure") =>
    nansenPost<Paged<PerpPosition>>({
      name: "perpPositionsCohort",
      path: "tgm/perp-positions",
      body: { token_symbol, label_type, pagination: { page: 1, per_page: 50 }, order_by: [{ field: "position_value_usd", direction: "DESC" }] },
      // The cache key is the path plus the body, so the three cohorts never share an entry.
      ttlMs: 2 * MIN,
    }),

  /**
   * Perp card, panel mode: Smart Money's position changes in this coin over the last 24h.
   *
   * 5 credits, and until Round 1.3.4 nothing rendered a single row of it. The response carries
   * `action` (Open / Add / Reduce / Close), so it is filtered client-side into the "opened in
   * the last hour" strip rather than being deleted or joined by a second call with
   * `only_new_positions: true`. `per_page` is 50 rather than 12 because the filter throws most
   * of the page away and a quiet coin would otherwise show an empty strip on a full response.
   */
  smPerpTrades: (token_symbol: string) =>
    nansenPost<Paged<PerpTrade>>({
      name: "smPerpTrades",
      path: "smart-money/perp-trades",
      body: { filters: { token_symbol }, lookback_hours: 24, only_new_positions: false, pagination: { page: 1, per_page: 50 } },
      ttlMs: 5 * MIN,
    }),

  /**
   * Perp card, panel mode: smart-trader, whale and public-figure longs and shorts in one row.
   *
   * **1 credit**, and it is the reason the perp panel is worth its 12: three cohorts instead of
   * the screener's one, and the three genuinely disagree (on the recorded ETH row smart traders
   * are 73% long, whales 54%, public figures 74%). Never on the chip — `buildPerpIntel` asks
   * for it in panel mode only.
   *
   * Keyed by **symbol** even though the body field is spelled `token_address`: Nansen skips
   * address validation for perps and its own CLI exposes this as `--symbol`. Hyperliquid perps
   * only, and reliable from May 2025.
   */
  positionIntelligence: (token_symbol: string) =>
    nansenPost<{ data?: PerpPositionIntelligence[] | null }>({
      name: "positionIntelligence",
      path: "tgm/position-intelligence",
      body: { token_address: token_symbol },
      ttlMs: PERP_SCREENER_TTL,
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

  /**
   * Spot card, Tape tab (Round 2.1): the labelled trade tape, **1 credit**, lazy.
   *
   * `per_page` is not priced, so the page is large and the value floor is applied on our side —
   * measured on the recorded WIF page, 100 trades span **fourteen minutes** on a liquid token, so
   * a small page ordered by time is dust and MEV and nothing else. `order_by: block_timestamp`
   * was verified live rather than guessed; sequence is the whole point of this section.
   */
  tokenDexTrades: (chain: string, token_address: string) => {
    const to = bucketNow(TAPE_TTL);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "tokenDexTrades",
      path: "tgm/dex-trades",
      body: {
        chain,
        token_address,
        date: { from: ymd(new Date(to.getTime() - TAPE_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        pagination: { page: 1, per_page: TAPE_PAGE },
        order_by: [{ field: "block_timestamp", direction: "DESC" }],
      },
      ttlMs: TAPE_TTL,
    });
  },

  /**
   * Spot card, Winners tab (Round 2.1): who made money on this token and whether they still hold
   * it. **5 credits**, expanded card only, and never part of a card's load.
   *
   * `premium_labels: false` is explicit: the default is a 150-credit call, which is the worst
   * failure mode in this repo. `order_by` is `pnl_usd_realised` because the API's own 422 named
   * the enum — `realized_pnl` was rejected with "Valid options are: 'pnl_usd_realised',
   * 'pnl_usd_unrealised', 'pnl_usd_total', 'roi_percent_total', …" — so this is measured, not
   * guessed, and a rejected field would have been a 400 in production.
   */
  tokenPnlLeaderboard: (chain: string, token_address: string) => {
    const to = bucketNow(WINNERS_TTL);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "tokenPnlLeaderboard",
      path: "tgm/pnl-leaderboard",
      body: {
        chain,
        token_address,
        date: { from: ymd(new Date(to.getTime() - WINNERS_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        premium_labels: false,
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: "pnl_usd_realised", direction: "DESC" }],
      },
      ttlMs: WINNERS_TTL,
    });
  },

  /**
   * Spot card, Flow tab (Round 2.1): the transfers behind an exchange flow line, **1 credit**,
   * bought by a button that prints its price.
   *
   * Ordered by value so the list is the movements worth naming. A transfer is a transfer: the
   * card states the wallets and the amount and never a motive, because a CEX deposit is custody
   * moving and not a sale.
   */
  tokenTransfers: (chain: string, token_address: string) => {
    const to = bucketNow(TRANSFERS_TTL);
    return nansenPost<Paged<Record<string, unknown>>>({
      name: "tokenTransfers",
      path: "tgm/transfers",
      body: {
        chain,
        token_address,
        date: { from: ymd(new Date(to.getTime() - TRANSFERS_WINDOW_DAYS * DAY)), to: ymd(to) },
        filters: {},
        pagination: { page: 1, per_page: 25 },
        order_by: [{ field: "transfer_value_usd", direction: "DESC" }],
      },
      ttlMs: TRANSFERS_TTL,
    });
  },

  /**
   * Spot card, Tape tab (Round 2.1): open Jupiter DCA vaults, **1 credit**, Solana only.
   *
   * There is no `chain` parameter — the endpoint is Solana-only and the guard is in the caller,
   * hard, because a credit spent on an EVM card buys nothing. The trailing window is fixed at 14
   * days server-side with no date parameter, so closed vaults older than that do not exist. An
   * empty answer is the **normal** case (measured: the recorded liquid Solana token has none),
   * and the section hides itself rather than printing zeroes.
   */
  jupDca: (token_address: string) =>
    nansenPost<Paged<Record<string, unknown>>>({
      name: "jupDca",
      path: "tgm/jup-dca",
      body: { token_address, filters: {}, pagination: { page: 1, per_page: 25 } },
      ttlMs: DCA_TTL,
    }),

  /**
   * Markets catalog enrichment (Round 1.6.2): **1 credit per call, whatever it names.**
   *
   * `filters.token_address` takes an **array** and `chains` takes one to five, both measured on
   * the first live call, so one credit enriches a whole catalog page rather than one row. No date
   * range is needed or sent (also measured) — the window is `timeframe`.
   *
   * The TTL is short because `price_change` is a live 24h figure; `token_age_days` would happily
   * cache for a day but it arrives in the same response, and a stale price change is the half
   * that can mislead.
   */
  tokenScreener: (chains: string[], token_address: string[]) =>
    nansenPost<Paged<TokenScreenerRow>>({
      name: "tokenScreener",
      path: "token-screener",
      body: {
        chains,
        timeframe: "24h",
        filters: { token_address },
        pagination: { page: 1, per_page: SCREENER_PAGE },
      },
      ttlMs: SCREENER_TTL,
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
