/**
 * The perp venues Tripwire quotes funding and open interest from, the mapping from one coin to
 * each venue's own contract name, and the one thing that makes those numbers comparable:
 * funding is quoted per *funding interval*, and the interval is not the same everywhere.
 *
 * Every venue in this table is called from the backend only (apps/web/lib/venues); the
 * extension never talks to an exchange.
 */

export const PERP_VENUE_IDS = ["hyperliquid", "binance", "bybit", "okx", "dydx"] as const;
export type PerpVenueId = (typeof PERP_VENUE_IDS)[number];

export type PerpVenueMeta = {
  name: string;
  /** How often this venue pays funding, in hours. Hyperliquid and dYdX v4 pay hourly; the
   * centralised USD-M style venues pay every 8 hours on their default schedule. */
  fundingIntervalHours: number;
  /** What the venue settles its perps in, shown next to open interest. */
  quote: string;
};

export const PERP_VENUES: Record<PerpVenueId, PerpVenueMeta> = {
  hyperliquid: { name: "Hyperliquid", fundingIntervalHours: 1, quote: "USD" },
  binance: { name: "Binance", fundingIntervalHours: 8, quote: "USDT" },
  bybit: { name: "Bybit", fundingIntervalHours: 8, quote: "USDT" },
  okx: { name: "OKX", fundingIntervalHours: 8, quote: "USDT" },
  dydx: { name: "dYdX", fundingIntervalHours: 1, quote: "USD" },
};

/**
 * Hyperliquid lists some high-supply memecoins at 1000x ("kPEPE" is 1000 PEPE). The centralised
 * venues spell the same contract "1000PEPE". Only coins that actually exist in both spellings
 * belong here: a coin this table doesn't know keeps its own name.
 */
const K_COINS: Record<string, string> = {
  KPEPE: "1000PEPE",
  KSHIB: "1000SHIB",
  KBONK: "1000BONK",
  KFLOKI: "1000FLOKI",
  KLUNC: "1000LUNC",
  KNEIRO: "1000NEIRO",
  KDOGS: "1000DOGS",
};

const COIN_RE = /^[A-Za-z0-9]{1,20}$/;

/** The coin as Hyperliquid spells it, upper-cased, or null when it isn't a coin at all. */
function normalizeCoin(coin: string): string | null {
  const trimmed = coin.trim();
  return COIN_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * This coin's contract name on `venue`, or null when the venue has no name for it — in which
 * case the venue is simply left out of the table rather than queried with a guess that could
 * name somebody else's market.
 */
export function perpVenueSymbol(venue: PerpVenueId, coin: string): string | null {
  const upper = normalizeCoin(coin);
  if (!upper) return null;
  const thousandX = K_COINS[upper] ?? null;
  switch (venue) {
    case "hyperliquid": {
      // Hyperliquid's own spelling. Its 1000x tickers are a lowercase k plus an upper-case
      // coin ("kPEPE"), which is the one case where the venue's name is not simply upper-case.
      const asWritten = coin.trim();
      return /^k[A-Z0-9]+$/.test(asWritten) ? asWritten : upper;
    }
    case "binance":
      return `${thousandX ?? upper}USDT`;
    case "bybit":
      return `${thousandX ?? upper}USDT`;
    case "okx":
      return `${thousandX ?? upper}-USDT-SWAP`;
    case "dydx":
      // dYdX v4 lists no 1000x contracts, so a k-coin has no dYdX market.
      return thousandX ? null : `${upper}-USD`;
  }
}

function usableRate(rate: number | null | undefined): number | null {
  return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
}

function usableInterval(hours: number): number | null {
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/** A funding rate quoted per `intervalHours`, rebased onto the 8-hour figure every venue's UI
 * shows. Null in, null out: a venue that didn't answer must not read as 0% funding. */
export function fundingPer8h(rate: number | null | undefined, intervalHours: number): number | null {
  const r = usableRate(rate);
  const h = usableInterval(intervalHours);
  return r === null || h === null ? null : r * (8 / h);
}

/** The same rate as a simple (non-compounded) annual percentage, from the venue's own payment
 * schedule: a rate paid hourly is annualised over 24 payments a day, not 3. */
export function annualisedFundingPct(rate: number | null | undefined, intervalHours: number): number | null {
  const r = usableRate(rate);
  const h = usableInterval(intervalHours);
  return r === null || h === null ? null : r * (24 / h) * 365 * 100;
}

export type VenueFunding = {
  /** The rate exactly as the venue reported it, per `intervalHours`. */
  raw: number | null;
  intervalHours: number;
  per8h: number | null;
  annualPct: number | null;
};

/**
 * Normalise one venue's funding rate. `intervalHours` overrides the venue default when the
 * payload states its own schedule (Binance and OKX move volatile markets to 4h or 1h funding,
 * and both say so in the response).
 */
export function venueFunding(venue: PerpVenueId, rate: number | null | undefined, intervalHours?: number | null): VenueFunding {
  const hours = usableInterval(intervalHours ?? Number.NaN) ?? PERP_VENUES[venue].fundingIntervalHours;
  return { raw: usableRate(rate), intervalHours: hours, per8h: fundingPer8h(rate, hours), annualPct: annualisedFundingPct(rate, hours) };
}

/** One row of the "Funding & OI across venues" table, as the backend hands it to the card. */
export type PerpVenueQuote = {
  venue: PerpVenueId;
  symbol: string;
  markPrice: number | null;
  funding: VenueFunding;
  /** Open interest in USD. Venues quote it in coins or in quote currency; the client converts. */
  openInterestUsd: number | null;
  volume24hUsd: number | null;
  /** Share of accounts (not size) that are long, 0-1, where the venue publishes it. */
  longAccountShare: number | null;
  /** Why this venue is missing, when it is. */
  error: string | null;
};
