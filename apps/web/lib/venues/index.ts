import { PERP_VENUE_IDS, perpVenueSymbol, singleSidedOi, venueFunding, type OiHistorySeries, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import { hlMarket, hlPredictedFunding, hlVenueQuote, type HlMarket, type HlPredictedFunding } from "../hyperliquid/perp";
import { binanceQuoteFrom, bybitQuoteFrom, dydxQuoteFrom, NO_EXTRAS, oiHistoryFrom, okxQuoteFrom, type BinanceOiHistRow } from "./derive";
import { venueGet, venueNum, VenueError } from "./http";

/**
 * One row per perp venue for the same coin: funding (normalised onto 8 hours and annualised
 * from each venue's own payment schedule), open interest in USD, 24h volume and, where the
 * venue publishes it, the share of accounts that are long.
 *
 * Every venue is fetched independently and settles on its own. A venue that has no market for
 * the coin, is down, or is rate-limiting this IP becomes a row with a reason instead of
 * vanishing, so the table never silently under-reports.
 */

const FUNDING_TTL = 60_000;
const OI_TTL = 60_000;
const RATIO_TTL = 5 * 60_000;
/** Five-minute buckets, so a shorter TTL would ask for a bucket that has not closed yet. */
const OI_HISTORY_TTL = 5 * 60_000;

// ---- Binance USD-M futures -----------------------------------------------------------------

type BinancePremium = { symbol: string; markPrice?: string; indexPrice?: string; lastFundingRate?: string; nextFundingTime?: number; time?: number; interestRate?: string };
type BinanceOi = { symbol: string; openInterest?: string };
type BinanceRatio = { symbol: string; longAccount?: string; shortAccount?: string; longShortRatio?: string; timestamp?: number };
type BinanceFundingInfo = { symbol: string; fundingIntervalHours?: number };
/** `quoteVolume` is the 24h turnover in the quote asset (USDT), which is the USD figure the
 * table's other four rows carry. `volume` is the same window in ETH and is not comparable. */
type BinanceTicker24h = { symbol: string; quoteVolume?: string; volume?: string };

/**
 * Binance's request-weight budget for one venue-table build, counted rather than assumed.
 *
 * `fapi` allows 2,400 weight per minute per IP and the `futures/data` statistics host is
 * separate again (500 requests per 5 minutes, which the two calls below share), so six
 * symbol-scoped requests is not close to a limit — but the budget is
 * shared with every other tab of every other user behind the same address, so each call below
 * states its weight and every one of them is symbol-scoped:
 *
 * | Request                                       | Weight | Cached for |
 * |-----------------------------------------------|--------|------------|
 * | `fapi/v1/premiumIndex?symbol=`                 | 1      | 60s        |
 * | `fapi/v1/openInterest?symbol=`                 | 1      | 60s        |
 * | `fapi/v1/ticker/24hr?symbol=`                  | 1      | 60s        |
 * | `fapi/v1/fundingInfo`                          | 1      | 6h         |
 * | `futures/data/globalLongShortAccountRatio`     | 0      | 5m         |
 * | `futures/data/openInterestHist?symbol=`        | 0      | 5m         |
 *
 * The unfiltered form of `ticker/24hr` costs **80**, so the symbol is never optional here; the
 * same is true of `premiumIndex` (weight 10 unfiltered) and `openInterest`, which requires one.
 */
export const BINANCE_WEIGHT_PER_BUILD = 4;

/**
 * Binance's funding interval for this market, in hours.
 *
 * It cannot be inferred from `nextFundingTime - time`: that is the *remaining* time to the next
 * payment, which on an 8-hour schedule is any number between 0 and 8 (the recording run caught
 * exactly this — ETHUSDT, an 8h market, showed 3.2h remaining). `fapi/v1/fundingInfo` is the
 * only thing that states it, so that is what is asked; it lists only the markets that differ
 * from the 8-hour default, and everything absent from it is 8-hourly.
 */
async function binanceFundingInterval(symbol: string): Promise<number | null> {
  try {
    const list = await venueGet<BinanceFundingInfo[]>({
      venue: "binance",
      fixture: "binance-fundingInfo",
      url: "https://fapi.binance.com/fapi/v1/fundingInfo",
      // One list for every market; it changes when Binance re-tiers a market, not per minute.
      ttlMs: 6 * 60 * 60_000,
      cacheKey: "fundingInfo",
    });
    const hours = list?.find((r) => r?.symbol === symbol)?.fundingIntervalHours;
    return typeof hours === "number" && hours > 0 ? hours : null;
  } catch {
    return null; // falls back to the 8-hour default in PERP_VENUES
  }
}

async function binanceQuote(symbol: string): Promise<PerpVenueQuote> {
  const premium = await venueGet<BinancePremium>({
    venue: "binance",
    fixture: "binance-premiumIndex",
    url: `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,
    ttlMs: FUNDING_TTL,
  });
  const mark = venueNum(premium?.markPrice);
  // Open interest and the account ratio are nice-to-haves: neither failing may cost us funding.
  const oiCoins = await venueGet<BinanceOi>({
    venue: "binance",
    fixture: "binance-openInterest",
    url: `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`,
    ttlMs: OI_TTL,
  })
    .then((r) => venueNum(r?.openInterest))
    .catch(() => null);
  // 24h turnover, quoted in USDT (Round 1.3.5). Like open interest and the account ratio it is
  // a nice-to-have: a rate-limited or 404ing ticker costs this one cell, never the row, because
  // it settles to null here instead of throwing out to `crossVenueFunding`'s catch.
  const ticker = await venueGet<BinanceTicker24h>({
    venue: "binance",
    fixture: "binance-ticker24hr",
    url: `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
    ttlMs: FUNDING_TTL,
  }).catch(() => null);
  const longShare = await venueGet<BinanceRatio[]>({
    venue: "binance",
    fixture: "binance-longShortRatio",
    url: `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${encodeURIComponent(symbol)}&period=5m&limit=1`,
    ttlMs: RATIO_TTL,
  })
    .then((rows) => venueNum(rows?.[0]?.longAccount))
    .catch(() => null);
  const intervalHours = await binanceFundingInterval(symbol);

  return {
    venue: "binance",
    symbol,
    markPrice: mark,
    // `lastFundingRate` is quoted per funding interval, which is 8h unless fundingInfo says else.
    funding: venueFunding("binance", venueNum(premium?.lastFundingRate), intervalHours),
    openInterestUsd: singleSidedOi("binance", oiCoins !== null && mark !== null ? oiCoins * mark : null),
    volume24hUsd: venueNum(ticker?.quoteVolume),
    longAccountShare: longShare,
    // The index price, the basis against it, the 24h change and the next payment time were all
    // already in these two payloads before Round 2.5 and none of them reached the card.
    ...binanceQuoteFrom({ premium }),
    error: null,
  };
}

// ---- Binance open-interest history (the only over-time source in the set) --------------------

/**
 * 24 hours of Binance open interest, in five-minute buckets.
 *
 * Weight 0, but the `futures/data` statistics host has its own 500-requests-per-5-minutes IP
 * budget, shared with the long/short account ratio the table already asks for — so this is one
 * request per coin per five minutes, and it settles to null on any failure. The card names
 * Binance on the chart: this is the only venue in the table publishing open interest over time,
 * and a delta drawn from Binance must never be read as Hyperliquid's.
 */
async function binanceOiHistory(symbol: string): Promise<OiHistorySeries | null> {
  try {
    const rows = await venueGet<BinanceOiHistRow[]>({
      venue: "binance",
      fixture: "binance-openInterestHist",
      url: `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=5m&limit=288`,
      ttlMs: OI_HISTORY_TTL,
    });
    return oiHistoryFrom(symbol, rows);
  } catch {
    return null;
  }
}

// ---- Bybit v5 linear -----------------------------------------------------------------------

type BybitTicker = {
  symbol: string;
  markPrice?: string;
  fundingRate?: string;
  /** Long **plus** short, in coins. Not read: see `bybitQuote`. */
  openInterest?: string;
  /** Long **plus** short, in USDT. Not read: see `bybitQuote`. */
  openInterestValue?: string;
  /** One side, in coins. */
  singleOpenInterest?: string;
  /** One side, in USDT — the figure this table's other four rows are quoted in. */
  singleOpenInterestValue?: string;
  turnover24h?: string;
  nextFundingTime?: string;
  /** Bybit states the schedule per market, so nothing has to be inferred here. */
  fundingIntervalHour?: number | string;
  /** The venue's own fair-value index. */
  indexPrice?: string;
  /** A single magnitude covering both funding bounds. OKX states a signed pair instead; both
   * are normalised in `derive.ts` so the card has one render path. */
  fundingCap?: string;
};
type BybitTickers = { retCode?: number; retMsg?: string; result?: { list?: BybitTicker[] } };

async function bybitQuote(symbol: string): Promise<PerpVenueQuote> {
  const body = await venueGet<BybitTickers>({
    venue: "bybit",
    fixture: "bybit-tickers",
    url: `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
    ttlMs: FUNDING_TTL,
  });
  if (typeof body?.retCode === "number" && body.retCode !== 0) throw new VenueError("bybit", `Bybit: ${body.retMsg ?? `code ${body.retCode}`}`);
  const t = body?.result?.list?.find((r) => r?.symbol === symbol) ?? body?.result?.list?.[0];
  if (!t) throw new VenueError("bybit", `Bybit has no ${symbol} market`);
  const mark = venueNum(t.markPrice);
  /**
   * Bybit publishes the same market's open interest twice: `openInterestValue` counts long
   * **plus** short, and `singleOpenInterestValue` counts one side. This row read the first one,
   * which made Bybit look twice its size — and because `crossVenueFunding` sorts on this field,
   * it put Bybit above venues with more open interest than it. The recorded ETH ticker is
   * 1,954,642,843.92 against 977,321,434.21, exactly 2x.
   *
   * The coin fallback is the `single` one for the same reason, and a market that publishes
   * neither degrades to null rather than being halved on an assumption: on an inverse or a
   * newly listed contract we would not know which convention the leftover field followed.
   */
  const oiValue = venueNum(t.singleOpenInterestValue);
  const oiCoins = venueNum(t.singleOpenInterest);
  return {
    venue: "bybit",
    symbol,
    markPrice: mark,
    funding: venueFunding("bybit", venueNum(t.fundingRate), venueNum(t.fundingIntervalHour)),
    openInterestUsd: singleSidedOi("bybit", oiValue ?? (oiCoins !== null && mark !== null ? oiCoins * mark : null)),
    volume24hUsd: venueNum(t.turnover24h),
    longAccountShare: null,
    ...bybitQuoteFrom(t),
    error: null,
  };
}

// ---- OKX ------------------------------------------------------------------------------------

type OkxEnvelope<T> = { code?: string; msg?: string; data?: T[] };
type OkxFunding = { instId: string; fundingRate?: string; nextFundingTime?: string; fundingTime?: string; maxFundingRate?: string; minFundingRate?: string; premium?: string };
type OkxOi = { instId: string; oi?: string; oiCcy?: string; oiUsd?: string };
type OkxTicker = { instId: string; last?: string; volCcy24h?: string; vol24h?: string };

function okxData<T>(venueName: string, body: OkxEnvelope<T> | null | undefined): T {
  if (body?.code && body.code !== "0") throw new VenueError("okx", `OKX: ${body.msg || `code ${body.code}`}`);
  const first = body?.data?.[0];
  if (!first) throw new VenueError("okx", `OKX has no ${venueName} data for this market`);
  return first;
}

async function okxQuote(instId: string): Promise<PerpVenueQuote> {
  const funding = okxData<OkxFunding>(
    "funding",
    await venueGet<OkxEnvelope<OkxFunding>>({
      venue: "okx",
      fixture: "okx-fundingRate",
      url: `https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(instId)}`,
      ttlMs: FUNDING_TTL,
    }),
  );
  const oi = await venueGet<OkxEnvelope<OkxOi>>({
    venue: "okx",
    fixture: "okx-openInterest",
    url: `https://www.okx.com/api/v5/public/open-interest?instId=${encodeURIComponent(instId)}`,
    ttlMs: OI_TTL,
  })
    .then((b) => okxData<OkxOi>("open interest", b))
    .catch(() => null);
  const ticker = await venueGet<OkxEnvelope<OkxTicker>>({
    venue: "okx",
    fixture: "okx-ticker",
    url: `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
    ttlMs: FUNDING_TTL,
  })
    .then((b) => okxData<OkxTicker>("ticker", b))
    .catch(() => null);

  const last = venueNum(ticker?.last);
  const oiUsd = venueNum(oi?.oiUsd);
  const oiCcy = venueNum(oi?.oiCcy);
  return {
    venue: "okx",
    symbol: instId,
    markPrice: last,
    funding: venueFunding("okx", venueNum(funding.fundingRate), okxInterval(funding)),
    openInterestUsd: singleSidedOi("okx", oiUsd ?? (oiCcy !== null && last !== null ? oiCcy * last : null)),
    volume24hUsd: venueNum(ticker?.volCcy24h) !== null && last !== null ? venueNum(ticker?.volCcy24h)! * last : null,
    longAccountShare: null,
    ...okxQuoteFrom({ funding }),
    error: null,
  };
}

/** OKX states both the current and the next funding time, so the interval is stated, not guessed. */
function okxInterval(f: OkxFunding): number | null {
  const now = venueNum(f.fundingTime);
  const next = venueNum(f.nextFundingTime);
  if (now === null || next === null) return null;
  const hours = (next - now) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 && hours <= 24 ? Math.round(hours) : null;
}

// ---- dYdX v4 indexer -------------------------------------------------------------------------

type DydxMarket = {
  ticker: string;
  oraclePrice?: string;
  nextFundingRate?: string;
  openInterest?: string;
  volume24H?: string;
  status?: string;
};
type DydxMarkets = { markets?: Record<string, DydxMarket> };

async function dydxQuote(ticker: string): Promise<PerpVenueQuote> {
  const body = await venueGet<DydxMarkets>({
    venue: "dydx",
    fixture: "dydx-perpetualMarkets",
    url: `https://indexer.dydx.trade/v4/perpetualMarkets?ticker=${encodeURIComponent(ticker)}`,
    ttlMs: FUNDING_TTL,
  });
  const m = body?.markets?.[ticker];
  if (!m) throw new VenueError("dydx", `dYdX has no ${ticker} market`);
  const price = venueNum(m.oraclePrice);
  // `openInterest`, one side. The payload's `baseOpenInterest` is the roughly-doubled sibling
  // (13,993.985 against 6,873.883 on the recorded ETH market) and is deliberately not read.
  const oi = venueNum(m.openInterest);
  return {
    venue: "dydx",
    symbol: ticker,
    markPrice: price,
    // dYdX v4 settles funding every hour and quotes `nextFundingRate` for that hour.
    funding: venueFunding("dydx", venueNum(m.nextFundingRate)),
    openInterestUsd: singleSidedOi("dydx", oi !== null && price !== null ? oi * price : null),
    volume24hUsd: venueNum(m.volume24H),
    longAccountShare: null,
    ...dydxQuoteFrom(),
    error: null,
  };
}

// ---- The table ------------------------------------------------------------------------------

const FETCHERS: Record<Exclude<PerpVenueId, "hyperliquid">, (symbol: string) => Promise<PerpVenueQuote>> = {
  binance: binanceQuote,
  bybit: bybitQuote,
  okx: okxQuote,
  dydx: dydxQuote,
};

function unavailable(venue: PerpVenueId, symbol: string, error: string): PerpVenueQuote {
  return {
    venue,
    symbol,
    markPrice: null,
    funding: venueFunding(venue, null),
    openInterestUsd: null,
    volume24hUsd: null,
    longAccountShare: null,
    ...NO_EXTRAS,
    error,
  };
}

export type CrossVenueTable = {
  coin: string;
  rows: PerpVenueQuote[];
  /** Venues with no contract for this coin at all, named so the table can say so once. */
  unmapped: PerpVenueId[];
  /**
   * Open interest over the last day, from the one venue in the table that publishes a history.
   * It carries its own venue and symbol because it is *not* the table's open-interest column
   * over time — it is Binance's, and the chart says so (Round 2.5).
   */
  oiHistory: OiHistorySeries | null;
};

/**
 * Funding and open interest for one coin across every venue that lists it. `hlPreloaded` lets
 * the caller pass the Hyperliquid snapshot it already fetched, so the table costs no extra call.
 */
export async function crossVenueFunding(coin: string, hlPreloaded?: { market: HlMarket | null; error: string | null }): Promise<CrossVenueTable> {
  const unmapped: PerpVenueId[] = [];
  const jobs: Promise<PerpVenueQuote>[] = [];

  /**
   * Hyperliquid's own market payload says what funding *is* and never when it is next paid;
   * `predictedFundings` does, for every venue it tracks, in one cached 234-coin answer. Only
   * the Hyperliquid row reads it — Binance, Bybit and OKX each publish their own timestamp, and
   * a venue's own payload is closer to the source than another venue's view of it.
   *
   * Started, not awaited (M-7): awaiting it here made it a serial round trip at the head of the
   * build, delaying every other venue's request by its latency. Only the Hyperliquid row needs
   * it, so only that row waits for it, and it flies alongside the rest.
   */
  const predicted = hlPredictedFunding(coin).catch(() => null);

  const hlSymbol = perpVenueSymbol("hyperliquid", coin);
  if (hlSymbol === null) unmapped.push("hyperliquid");
  else if (hlPreloaded) {
    const preloaded = hlPreloaded;
    jobs.push(predicted.then((p) => hlVenueQuote(preloaded.market, hlSymbol, preloaded.error, p)));
  } else
    jobs.push(
      hlMarket(hlSymbol).then(
        async (m) => hlVenueQuote(m, hlSymbol, m ? null : `Hyperliquid has no ${hlSymbol} market`, await predicted),
        (e: unknown) => unavailable("hyperliquid", hlSymbol, e instanceof Error ? e.message : String(e)),
      ),
    );

  for (const venue of PERP_VENUE_IDS) {
    if (venue === "hyperliquid") continue;
    const symbol = perpVenueSymbol(venue, coin);
    if (symbol === null) {
      unmapped.push(venue);
      continue;
    }
    jobs.push(
      FETCHERS[venue](symbol).catch((e: unknown) => unavailable(venue, symbol, e instanceof Error ? e.message : String(e))),
    );
  }

  const binanceSymbol = perpVenueSymbol("binance", coin);
  const [rows, oiHistory] = await Promise.all([Promise.all(jobs), binanceSymbol === null ? Promise.resolve(null) : binanceOiHistory(binanceSymbol)]);
  // Venues that answered first, biggest book first; the ones that didn't sink to the bottom.
  rows.sort((a, b) => {
    if (!!a.error !== !!b.error) return a.error ? 1 : -1;
    return (b.openInterestUsd ?? -1) - (a.openInterestUsd ?? -1);
  });
  return { coin: coin.toUpperCase(), rows, unmapped, oiHistory };
}
