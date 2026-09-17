import { PERP_VENUE_IDS, perpVenueSymbol, venueFunding, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import { hlMarket, hlVenueQuote, type HlMarket } from "../hyperliquid/perp";
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

// ---- Binance USD-M futures -----------------------------------------------------------------

type BinancePremium = { symbol: string; markPrice?: string; lastFundingRate?: string; nextFundingTime?: number; time?: number; interestRate?: string };
type BinanceOi = { symbol: string; openInterest?: string };
type BinanceRatio = { symbol: string; longAccount?: string; shortAccount?: string; longShortRatio?: string; timestamp?: number };
type BinanceFundingInfo = { symbol: string; fundingIntervalHours?: number };

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
    openInterestUsd: oiCoins !== null && mark !== null ? oiCoins * mark : null,
    volume24hUsd: null,
    longAccountShare: longShare,
    error: null,
  };
}

// ---- Bybit v5 linear -----------------------------------------------------------------------

type BybitTicker = {
  symbol: string;
  markPrice?: string;
  fundingRate?: string;
  openInterest?: string;
  openInterestValue?: string;
  turnover24h?: string;
  nextFundingTime?: string;
  /** Bybit states the schedule per market, so nothing has to be inferred here. */
  fundingIntervalHour?: number | string;
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
  const oiValue = venueNum(t.openInterestValue);
  const oiCoins = venueNum(t.openInterest);
  return {
    venue: "bybit",
    symbol,
    markPrice: mark,
    funding: venueFunding("bybit", venueNum(t.fundingRate), venueNum(t.fundingIntervalHour)),
    openInterestUsd: oiValue ?? (oiCoins !== null && mark !== null ? oiCoins * mark : null),
    volume24hUsd: venueNum(t.turnover24h),
    longAccountShare: null,
    error: null,
  };
}

// ---- OKX ------------------------------------------------------------------------------------

type OkxEnvelope<T> = { code?: string; msg?: string; data?: T[] };
type OkxFunding = { instId: string; fundingRate?: string; nextFundingTime?: string; fundingTime?: string };
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
    openInterestUsd: oiUsd ?? (oiCcy !== null && last !== null ? oiCcy * last : null),
    volume24hUsd: venueNum(ticker?.volCcy24h) !== null && last !== null ? venueNum(ticker?.volCcy24h)! * last : null,
    longAccountShare: null,
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
  const oi = venueNum(m.openInterest);
  return {
    venue: "dydx",
    symbol: ticker,
    markPrice: price,
    // dYdX v4 settles funding every hour and quotes `nextFundingRate` for that hour.
    funding: venueFunding("dydx", venueNum(m.nextFundingRate)),
    openInterestUsd: oi !== null && price !== null ? oi * price : null,
    volume24hUsd: venueNum(m.volume24H),
    longAccountShare: null,
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
    error,
  };
}

export type CrossVenueTable = {
  coin: string;
  rows: PerpVenueQuote[];
  /** Venues with no contract for this coin at all, named so the table can say so once. */
  unmapped: PerpVenueId[];
};

/**
 * Funding and open interest for one coin across every venue that lists it. `hlPreloaded` lets
 * the caller pass the Hyperliquid snapshot it already fetched, so the table costs no extra call.
 */
export async function crossVenueFunding(coin: string, hlPreloaded?: { market: HlMarket | null; error: string | null }): Promise<CrossVenueTable> {
  const unmapped: PerpVenueId[] = [];
  const jobs: Promise<PerpVenueQuote>[] = [];

  const hlSymbol = perpVenueSymbol("hyperliquid", coin);
  if (hlSymbol === null) unmapped.push("hyperliquid");
  else if (hlPreloaded) jobs.push(Promise.resolve(hlVenueQuote(hlPreloaded.market, hlSymbol, hlPreloaded.error)));
  else
    jobs.push(
      hlMarket(hlSymbol).then(
        (m) => hlVenueQuote(m, hlSymbol, m ? null : `Hyperliquid has no ${hlSymbol} market`),
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

  const rows = await Promise.all(jobs);
  // Venues that answered first, biggest book first; the ones that didn't sink to the bottom.
  rows.sort((a, b) => {
    if (!!a.error !== !!b.error) return a.error ? 1 : -1;
    return (b.openInterestUsd ?? -1) - (a.openInterestUsd ?? -1);
  });
  return { coin: coin.toUpperCase(), rows, unmapped };
}
