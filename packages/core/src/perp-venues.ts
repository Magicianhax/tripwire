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
  /**
   * How many sides of the book the open-interest figure **we read** from this venue counts.
   *
   * Open interest has two conventions in the wild: one side (every long has a short, so count
   * the longs) and long-plus-short, which is exactly twice as big. A table that mixes them
   * does not just print one wrong number — it sorts the venues into the wrong order, which is
   * the thing a reader takes away from it. Every row here is therefore converted to the
   * one-side figure, and this field records what the venue's own number was, with the field
   * we read named beside it. See `singleSidedOi`.
   */
  oiSides: 1 | 2;
};

export const PERP_VENUES: Record<PerpVenueId, PerpVenueMeta> = {
  // `metaAndAssetCtxs[1][i].openInterest` counts long **plus** short. Measured against an
  // independent reference rather than assumed: DefiLlama's dimension-adapters #9365 found
  // Hyperliquid at 2.00x CoinMarketCap over 16 sampling windows ($14.67B reported against
  // CMC's $7.61B, corrected to $7.33B). Our own recorded universe totals $10.59B at face
  // value, $5.30B halved.
  hyperliquid: { name: "Hyperliquid", fundingIntervalHours: 1, quote: "USD", oiSides: 2 },
  // `fapi/v1/openInterest`, the figure CMC and every tracker quote for Binance.
  binance: { name: "Binance", fundingIntervalHours: 8, quote: "USDT", oiSides: 1 },
  // We read `singleOpenInterestValue`, which Bybit publishes precisely because its sibling
  // `openInterestValue` is both sides: in the recorded ETH ticker they are 977,321,434.21 and
  // 1,954,642,843.92, exactly 2x.
  bybit: { name: "Bybit", fundingIntervalHours: 8, quote: "USDT", oiSides: 1 },
  // `oiCcy` / `oiUsd`, one side.
  okx: { name: "OKX", fundingIntervalHours: 8, quote: "USDT", oiSides: 1 },
  // `openInterest`, one side. The sibling `baseOpenInterest` in the same payload is roughly
  // twice it (13,993.985 against 6,873.883 on the recorded ETH market) and is not read here.
  dydx: { name: "dYdX", fundingIntervalHours: 1, quote: "USD", oiSides: 1 },
};

/**
 * One venue's open interest as the **one-side** figure, from whatever convention it published.
 *
 * Null in, null out: a venue that did not answer must not read as zero open interest, and a
 * halved null is still not a number.
 */
export function singleSidedOi(venue: PerpVenueId, value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value / PERP_VENUES[venue].oiSides;
}

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
  /** Open interest in USD, always **one side of the book**: venues quote it in coins or in
   * quote currency, and some quote long-plus-short, so the client converts both (see
   * `singleSidedOi`). */
  openInterestUsd: number | null;
  volume24hUsd: number | null;
  /** Share of accounts (not size) that are long, 0-1, where the venue publishes it. */
  longAccountShare: number | null;
  /** Why this venue is missing, when it is. */
  error: string | null;
};
