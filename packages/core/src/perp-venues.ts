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
  /**
   * What this venue calls the fair-value price its mark is measured against, or null when the
   * payload we already fetch carries only one of the two.
   *
   * Basis is mark minus that reference. Three of the five rows can answer it and two cannot, so
   * the column names the reference per venue rather than implying all five computed the same
   * thing: Binance and Bybit publish an `indexPrice` built from spot venues, Hyperliquid an
   * `oraclePx`, OKX publishes its own differently-derived `premium` (deliberately not mixed in)
   * and dYdX publishes an oracle price with no mark to compare it to.
   */
  basisReference: "Index" | "Oracle" | null;
};

export const PERP_VENUES: Record<PerpVenueId, PerpVenueMeta> = {
  // `metaAndAssetCtxs[1][i].openInterest` counts long **plus** short. Measured against an
  // independent reference rather than assumed: DefiLlama's dimension-adapters #9365 found
  // Hyperliquid at 2.00x CoinMarketCap over 16 sampling windows ($14.67B reported against
  // CMC's $7.61B, corrected to $7.33B). Our own recorded universe totals $10.59B at face
  // value, $5.30B halved.
  hyperliquid: { name: "Hyperliquid", fundingIntervalHours: 1, quote: "USD", oiSides: 2, basisReference: "Oracle" },
  // `fapi/v1/openInterest`, the figure CMC and every tracker quote for Binance.
  binance: { name: "Binance", fundingIntervalHours: 8, quote: "USDT", oiSides: 1, basisReference: "Index" },
  // We read `singleOpenInterestValue`, which Bybit publishes precisely because its sibling
  // `openInterestValue` is both sides: in the recorded ETH ticker they are 977,321,434.21 and
  // 1,954,642,843.92, exactly 2x.
  bybit: { name: "Bybit", fundingIntervalHours: 8, quote: "USDT", oiSides: 1, basisReference: "Index" },
  // `oiCcy` / `oiUsd`, one side.
  okx: { name: "OKX", fundingIntervalHours: 8, quote: "USDT", oiSides: 1, basisReference: null },
  // `openInterest`, one side. The sibling `baseOpenInterest` in the same payload is roughly
  // twice it (13,993.985 against 6,873.883 on the recorded ETH market) and is not read here.
  dydx: { name: "dYdX", fundingIntervalHours: 1, quote: "USD", oiSides: 1, basisReference: null },
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

// ---- Round 2.5: the figures the venues were already sending ---------------------------------

/**
 * Mark against the venue's own fair-value reference, in basis points.
 *
 * One formula, applied only where the payload we already fetch carries **both** halves. dYdX
 * publishes an oracle price and no mark, and OKX publishes a `premium` it derived some other
 * way; neither gets a number here, because three differently computed figures in one column
 * invite a comparison none of them supports. Null in, null out — a missing half is not a zero
 * basis, which would read as "this perp trades exactly at spot".
 */
export function venueBasisBps(mark: number | null | undefined, reference: number | null | undefined): number | null {
  const m = usableRate(mark);
  const r = usableRate(reference);
  if (m === null || r === null || r <= 0) return null;
  return ((m - r) / r) * 10_000;
}

/** The bounds a venue clamps its funding rate between, per funding interval. */
export type FundingCap = { lower: number; upper: number };

/**
 * One cap shape out of two.
 *
 * Bybit publishes `fundingCap` as a single magnitude covering both bounds ("0.00333" means
 * ±0.333%); OKX publishes `maxFundingRate` and `minFundingRate` as a signed pair which is not
 * necessarily symmetric. They cannot share a *parser*, so they are normalised here and share a
 * render path instead. A venue that publishes no cap gets null, and a zero magnitude is "no cap
 * stated" rather than "capped at zero".
 */
export function normalizeFundingCap(input: { magnitude?: number | null; lower?: number | null; upper?: number | null }): FundingCap | null {
  const magnitude = usableRate(input.magnitude);
  if (magnitude !== null && magnitude !== 0) return { lower: -Math.abs(magnitude), upper: Math.abs(magnitude) };
  const lower = usableRate(input.lower);
  const upper = usableRate(input.upper);
  if (lower === null || upper === null) return null;
  return { lower, upper };
}

/**
 * How far the current rate has travelled toward the bound it is heading for, as a share of that
 * bound (0 to 1, and past 1 if a venue overshoots its own published cap).
 *
 * This is the only thing a cap is worth saying on a card: a rate at 1% of its ceiling is noise,
 * a rate at 85% of it is about to stop rising however lopsided the market gets.
 */
export function fundingCapPressure(rate: number | null | undefined, cap: FundingCap | null | undefined): number | null {
  const r = usableRate(rate);
  if (r === null || !cap) return null;
  if (r === 0) return 0;
  const bound = r > 0 ? cap.upper : cap.lower;
  if (bound === 0) return null;
  return Math.abs(r / bound);
}

/** The longest gap any perp venue leaves between funding payments, plus slack. Anything beyond
 * this is a clock or a units problem, and a wrong countdown is worse than no countdown. */
const MAX_FUNDING_HORIZON_MS = 26 * 3_600_000;
/**
 * How long a payment time may have passed and still mean "any moment now".
 *
 * A venue's answer is cached for 60 seconds and a card sits open for minutes, so a timestamp a
 * few minutes old is normal and honestly reads as due. A timestamp *hours* old is not a payment
 * about to happen — it is a stale snapshot (replay serves recorded ones), and saying "due now"
 * about it would state something the venue never said.
 */
const MAX_FUNDING_LAG_MS = 10 * 60_000;

/**
 * "in 3h 12m" until the venue's next funding payment.
 *
 * Computed from the **absolute** epoch the venue published, never from a "seconds remaining"
 * figure: the backend response is cached for 60 seconds and a popover sits open for minutes, so
 * a remainder captured at fetch time would be wrong by the time it is read. A time that has
 * passed says so rather than counting backwards, and the last minute is never rounded up into a
 * promise of a whole one.
 */
export function countdownLabel(nextMs: number | null | undefined, nowMs: number): string | null {
  if (typeof nextMs !== "number" || !Number.isFinite(nextMs) || nextMs <= 0) return null;
  const delta = nextMs - nowMs;
  if (delta > MAX_FUNDING_HORIZON_MS || delta < -MAX_FUNDING_LAG_MS) return null;
  if (delta <= 0) return "due now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "in under a minute";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `in ${hours}h ${minutes % 60}m` : `in ${minutes}m`;
}

/** One reading of a venue's open interest, in USD, at a point in time. */
export type OiHistoryPoint = { timeMs: number; oiUsd: number };

/** Open interest over a window, named by the venue that published it. */
export type OiHistorySeries = {
  venue: PerpVenueId;
  symbol: string;
  /** The bucket size the venue was asked for ("5m", "1h"), for the chart's own legend. */
  period: string;
  points: OiHistoryPoint[];
};

export type OiTrend = { hours: number; first: number; last: number; changePct: number | null };

/**
 * The span a series actually covers and what happened across it.
 *
 * The span is measured from the points in hand rather than from what was requested: a venue that
 * returned less retention than asked for must not have its chart labelled with the window we
 * wanted. A first reading of zero yields a null percentage instead of an infinity.
 */
export function oiTrend(points: readonly OiHistoryPoint[] | null | undefined): OiTrend | null {
  if (!points || points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return {
    hours: Math.max(1, Math.round((last.timeMs - first.timeMs) / 3_600_000)),
    first: first.oiUsd,
    last: last.oiUsd,
    changePct: first.oiUsd > 0 ? ((last.oiUsd - first.oiUsd) / first.oiUsd) * 100 : null,
  };
}

/** One row of a venue's margin table: above `lowerBoundUsd` of notional, the ceiling is this. */
export type MarginTier = { lowerBoundUsd: number; maxLeverage: number };

export type LeverageLadder = { topLeverage: number; steps: { fromUsd: number; maxLeverage: number }[] };

/**
 * Where a venue's leverage ceiling steps down, as notional thresholds.
 *
 * A margin tier only means something at a stated position size, and the card has no size input —
 * so "tier 3: 10x" beside "Max leverage 25x" would be more confusing than the headline alone.
 * The thresholds themselves need no size input to be true, so those are what ship. A table with
 * one tier returns null: the headline already said it.
 */
export function leverageLadder(tiers: readonly MarginTier[] | null | undefined): LeverageLadder | null {
  if (!tiers || tiers.length < 2) return null;
  const sorted = [...tiers].filter((t) => Number.isFinite(t.lowerBoundUsd) && Number.isFinite(t.maxLeverage)).sort((a, b) => a.lowerBoundUsd - b.lowerBoundUsd);
  const top = sorted[0];
  if (!top) return null;
  const steps = sorted.slice(1).map((t) => ({ fromUsd: t.lowerBoundUsd, maxLeverage: t.maxLeverage }));
  return steps.length === 0 ? null : { topLeverage: top.maxLeverage, steps };
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
  /** The venue's own fair-value reference (`PERP_VENUES[venue].basisReference` names it), where
   * the payload carries one. Null for the two venues that publish only one half of the pair. */
  indexPrice: number | null;
  /** Mark against that reference, in basis points. See `venueBasisBps`. */
  basisBps: number | null;
  /** When this venue next pays funding, as absolute epoch milliseconds, so the card can count
   * down from the reader's own clock rather than from a 60-second-old remainder. */
  nextFundingMs: number | null;
  /** The bounds this venue clamps its funding rate between, per interval, where it states them. */
  fundingCap: FundingCap | null;
  /** Why this venue is missing, when it is. */
  error: string | null;
};
