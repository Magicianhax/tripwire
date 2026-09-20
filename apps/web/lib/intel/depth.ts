import { DEPTH_SECTION_CREDITS, type Candle, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import { hlBookDepth, hlCandles, hlFundingHistory, hlMarket, type BookDepth, type FundingPoint, type HlMarket } from "../hyperliquid/perp";
import { crossVenueFunding } from "../venues";
import { nansen } from "../nansen/endpoints";
import { clobBook, type ClobLevel } from "../polymarket/clob";
import { resolveMarket, toMarket } from "./prediction";
import { settle } from "./util";

/**
 * The card's *depth*: everything a tab asks for after the card is already on screen.
 *
 * Nothing in here runs on a card open. Each section is requested by the tab that shows it (or by
 * the expanded view), each one settles independently, and each one names the endpoint behind it
 * when it fails. The two paid sections (`perpTraders`, `spotHolders`) are the reason this split
 * exists: they may never fire just because somebody glanced at a token.
 */

// ---- Defensive row reading -------------------------------------------------------------------
// Every Nansen shape below was observed once, in the recording run. A renamed field must cost a
// column, never the tab, so each value is looked up under the names it plausibly carries.

type Row = Record<string, unknown>;

function pickNum(row: Row, names: string[]): number | null {
  for (const n of names) {
    const v = row[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function pickStr(row: Row, names: string[]): string | null {
  for (const n of names) {
    const v = row[n];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

const rowsOf = (d: { data?: unknown } | null | undefined): Row[] =>
  Array.isArray((d as { data?: unknown })?.data) ? ((d as { data: unknown[] }).data.filter((r) => r && typeof r === "object") as Row[]) : [];

// ---- Perp: market, venues, chart ---------------------------------------------------------------

export type PerpMarketSection = {
  market: HlMarket | null;
  book: BookDepth | null;
  funding: FundingPoint[] | null;
  errors: string[];
};

export async function perpMarketSection(coin: string): Promise<PerpMarketSection> {
  const [market, book, funding] = await Promise.all([
    settle(hlMarket(coin).then((data) => ({ data, cached: false, stale: false })), (d) => d),
    settle(hlBookDepth(coin).then((data) => ({ data, cached: false, stale: false })), (d) => d),
    settle(hlFundingHistory(coin).then((data) => ({ data, cached: false, stale: false })), (d) => (d.length > 0 ? d : null)),
  ]);
  return {
    market: market.value,
    book: book.value,
    funding: funding.value,
    errors: [market.error, book.error, funding.error].filter((e): e is string => !!e),
  };
}

export type PerpVenuesSection = { rows: PerpVenueQuote[]; unmapped: PerpVenueId[]; errors: string[] };

export async function perpVenuesSection(coin: string): Promise<PerpVenuesSection> {
  try {
    const table = await crossVenueFunding(coin);
    return { rows: table.rows, unmapped: table.unmapped, errors: [] };
  } catch (e) {
    return { rows: [], unmapped: [], errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export type PerpChartSection = { interval: string; candles: Candle[] | null; errors: string[] };

export async function perpChartSection(coin: string, window: string): Promise<PerpChartSection> {
  const r = await settle(hlCandles(coin, window).then((data) => ({ data, cached: false, stale: false })), (d) => d);
  return { interval: r.value?.interval ?? "", candles: r.value?.candles ?? null, errors: r.error ? [r.error] : [] };
}

// ---- Perp: traders (the paid section) -----------------------------------------------------------

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

/** One of an account's five largest open positions, as the leaderboard reports them. */
export type TopAccountPosition = { coin: string; side: string | null; valueUsd: number | null; entryPrice: number | null; unrealizedPnlUsd: number | null };

export type TopAccount = {
  address: string | null;
  label: string | null;
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  /** Nansen reports ROI as a fraction (0.15 = 15%); this is the percentage. */
  roiPct: number | null;
  accountValueUsd: number | null;
  volumeUsd: number | null;
  /** This account's open position in the coin the card is about, when it has one. */
  hereNow: TopAccountPosition | null;
};

export type PerpTradersSection = {
  leaderboard: PerpLeaderRow[] | null;
  trades: PerpDepthTrade[] | null;
  topAccounts: TopAccount[] | null;
  /** How many of the top accounts are in this coin right now, for the section's own sentence. */
  topAccountsHere: number;
  credits: number;
  errors: string[];
};

const ADDRESS_FIELDS = ["trader_address", "address", "user_address", "wallet_address"];
const LABEL_FIELDS = ["trader_address_label", "address_label", "label", "entity", "name"];

/**
 * `tgm/perp-pnl-leaderboard` reports no side: it reports `holding_amount`, signed the way the
 * position is. A trader who has closed out holds nothing, so their side is genuinely unknown
 * rather than flat.
 */
function sideOfHolding(amount: number | null): string | null {
  if (amount === null || amount === 0) return null;
  return amount > 0 ? "Long" : "Short";
}

function toLeaderRow(r: Row): PerpLeaderRow {
  const holding = pickNum(r, ["holding_amount"]);
  // `roi_percent_total` is a fraction (0.07 = 7%), the same convention as `roi` next door.
  const roi = pickNum(r, ["roi_percent_total", "roi_percent_realised", "roi"]);
  return {
    address: pickStr(r, ADDRESS_FIELDS),
    label: pickStr(r, LABEL_FIELDS),
    side: pickStr(r, ["side", "position_side"]) ?? sideOfHolding(holding),
    // Nansen spells these the British way on this endpoint and the American way on the
    // leaderboard next door. Both are read, so neither rename can blank a column.
    realizedPnlUsd: pickNum(r, ["pnl_usd_realised", "pnl_usd_realized", "realized_pnl_usd"]),
    unrealizedPnlUsd: pickNum(r, ["pnl_usd_unrealised", "pnl_usd_unrealized", "unrealized_pnl_usd", "upnl_usd"]),
    totalPnlUsd: pickNum(r, ["pnl_usd_total", "total_pnl_usd", "total_pnl", "pnl_usd"]),
    positionValueUsd: pickNum(r, ["position_value_usd", "notional_usd"]),
    holdingAmount: holding,
    roiPct: roi === null ? null : roi * 100,
    tradeCount: pickNum(r, ["nof_trades", "total_trades"]),
  };
}

function toDepthTrade(r: Row): PerpDepthTrade {
  return {
    address: pickStr(r, ADDRESS_FIELDS),
    label: pickStr(r, LABEL_FIELDS),
    side: pickStr(r, ["side", "position_side", "direction"]),
    action: pickStr(r, ["action", "trade_action", "event"]),
    valueUsd: pickNum(r, ["value_usd", "notional_usd", "usd_value"]),
    priceUsd: pickNum(r, ["price_usd", "price", "avg_price"]),
    tokenAmount: pickNum(r, ["token_amount", "size", "size_base"]),
    orderType: pickStr(r, ["type", "order_type"]),
    timestamp: pickStr(r, ["block_timestamp", "timestamp", "time", "traded_at"]),
  };
}

/** A row is worth a line only if it names somebody. */
const namesSomeone = (r: { address: string | null; label: string | null }) => !!(r.address || r.label);

/** The account's open position in `coin`, out of the five the leaderboard reports. */
function positionIn(r: Row, coin: string): TopAccountPosition | null {
  const raw = r["top_positions"];
  if (!Array.isArray(raw)) return null;
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const row = p as Row;
    const name = pickStr(row, ["coin", "token_symbol", "symbol"]);
    if (!name || name.toUpperCase() !== coin.toUpperCase()) continue;
    return {
      coin: name,
      side: pickStr(row, ["side", "position_side"]),
      valueUsd: pickNum(row, ["position_value_usd", "value_usd"]),
      entryPrice: pickNum(row, ["entry_price", "entry_px"]),
      unrealizedPnlUsd: pickNum(row, ["unrealized_pnl_usd", "upnl_usd"]),
    };
  }
  return null;
}

export async function perpTradersSection(coin: string): Promise<PerpTradersSection> {
  // Three independent calls, settled one by one: a dead leaderboard never costs us the trades.
  const [leaders, trades, accounts] = await Promise.all([
    settle(nansen.perpPnlLeaderboard(coin), (d) => rowsOf(d).map(toLeaderRow).filter(namesSomeone)),
    settle(nansen.tokenPerpTrades(coin), (d) => rowsOf(d).map(toDepthTrade).filter(namesSomeone)),
    settle(nansen.hyperliquidLeaderboard(), (d) => rowsOf(d)),
  ]);

  // "Top HL accounts active in this coin". The overall leaderboard carries each account's five
  // largest open positions, so membership is read from the account's own book rather than
  // inferred from whether it happens to appear in the per-coin calls.
  const topAccounts =
    accounts.value
      ?.map((r): TopAccount => {
        const roi = pickNum(r, ["roi"]);
        return {
          address: pickStr(r, ADDRESS_FIELDS),
          label: pickStr(r, LABEL_FIELDS),
          totalPnlUsd: pickNum(r, ["total_pnl", "pnl_usd_total", "total_pnl_usd"]),
          realizedPnlUsd: pickNum(r, ["realized_pnl_usd", "pnl_usd_realised"]),
          unrealizedPnlUsd: pickNum(r, ["unrealized_pnl_usd", "pnl_usd_unrealised"]),
          roiPct: roi === null ? null : roi * 100,
          accountValueUsd: pickNum(r, ["account_value", "account_value_usd", "equity_usd"]),
          volumeUsd: pickNum(r, ["volume_usd"]),
          hereNow: positionIn(r, coin),
        };
      })
      .filter(namesSomeone)
      // The ones actually in this market lead; the rest keep the leaderboard's own order.
      .sort((a, b) => Number(!!b.hereNow) - Number(!!a.hereNow)) ?? null;

  return {
    leaderboard: leaders.value,
    trades: trades.value,
    topAccounts,
    topAccountsHere: (topAccounts ?? []).filter((a) => a.hereNow).length,
    credits: DEPTH_SECTION_CREDITS.perpTraders,
    errors: [leaders.error, trades.error, accounts.error].filter((e): e is string => !!e),
  };
}

// ---- Spot: holder concentration (the other paid section) --------------------------------------

export type SpotHolderRow = { address: string | null; label: string | null; valueUsd: number | null; tokenAmount: number | null; sharePct: number | null };
export type SpotHoldersSection = { holders: SpotHolderRow[] | null; top10SharePct: number | null; credits: number; errors: string[] };

export async function spotHoldersSection(chain: string, tokenAddress: string): Promise<SpotHoldersSection> {
  const r = await settle(nansen.tokenHolders(chain, tokenAddress), (d) =>
    rowsOf(d).map(
      (row): SpotHolderRow => ({
        address: pickStr(row, ["address", "holder_address", "wallet_address"]),
        label: pickStr(row, LABEL_FIELDS),
        valueUsd: pickNum(row, ["value_usd", "balance_usd", "holding_usd"]),
        tokenAmount: pickNum(row, ["token_amount", "balance"]),
        // Nansen reports ownership as a percentage already.
        sharePct: pickNum(row, ["ownership_percentage", "share_of_supply", "supply_share_pct"]),
      }),
    ),
  );
  const holders = r.value && r.value.length > 0 ? r.value : null;
  const shares = (holders ?? []).slice(0, 10).map((h) => h.sharePct);
  const top10 = shares.some((s) => s !== null) ? shares.reduce((sum: number, s) => sum + (s ?? 0), 0) : null;
  return { holders, top10SharePct: top10, credits: DEPTH_SECTION_CREDITS.spotHolders, errors: r.error ? [r.error] : [] };
}

// ---- Prediction: the resting book ---------------------------------------------------------------

export type BookLevel = { price: number; size: number; cumulative: number };
/** One outcome's two sides. Polymarket books are per outcome ("Yes", "No"), not per market. */
export type OutcomeBook = { outcome: string; bids: BookLevel[]; asks: BookLevel[]; bestBid: number | null; bestAsk: number | null; spread: number | null };
export type PredictionBookSection = { books: OutcomeBook[] | null; snapshotIso: string | null; errors: string[] };

/** Levels per side that cross the bridge. The CLOB answers every resting level down to a tenth
 * of a cent; the card draws the top of the book and nothing below it. */
export const BOOK_LEVELS = 15;

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Sorted, capped, and cumulated from the touch outward, so the depth bar means "size resting
 * between the best price and here" rather than a per-level size the eye has to add up. */
function sideLevels(raw: ClobLevel[] | undefined, direction: "desc" | "asc"): BookLevel[] {
  const levels: { price: number; size: number }[] = [];
  for (const l of raw ?? []) {
    const price = toNum(l?.price);
    const size = toNum(l?.size);
    if (price === null || size === null || size <= 0) continue;
    levels.push({ price, size });
  }
  levels.sort((a, b) => (direction === "desc" ? b.price - a.price : a.price - b.price));
  let cumulative = 0;
  return levels.slice(0, BOOK_LEVELS).map((l) => {
    cumulative += l.size;
    return { price: l.price, size: l.size, cumulative };
  });
}

/**
 * Both sides of both outcomes, for free (Round 1.2.7).
 *
 * This replaced a 1-credit `prediction-market/orderbook` page that asked for 40 rows with no
 * ordering and came back 40-of-40 `('No','buy')` — one outcome, one side, so `bestAsk` and the
 * spread were structurally null. Polymarket's own CLOB answers one token's whole book,
 * unauthenticated, so the card asks it once per outcome token and pays nothing.
 *
 * The outcome names and the token ids both come from the Gamma market the card already resolved
 * and cached for an hour, so this costs no extra lookup either. A token whose book fails names
 * itself and the other outcome still renders.
 */
export async function predictionBookSection(slug: string): Promise<PredictionBookSection> {
  let market: Awaited<ReturnType<typeof resolveMarket>>["market"] = null;
  try {
    market = (await resolveMarket(slug)).market;
  } catch (e) {
    return { books: null, snapshotIso: null, errors: [`Polymarket lookup failed: ${e instanceof Error ? e.message : e}`] };
  }
  if (!market) return { books: null, snapshotIso: null, errors: ["Market not found"] };
  const dto = toMarket(market, null);
  const tokenIds = dto.clobTokenIds ?? [];
  if (tokenIds.length === 0) return { books: null, snapshotIso: null, errors: ["This market publishes no order-book tokens"] };

  let outcomes: string[] = [];
  try {
    const parsed = JSON.parse(market.outcomes ?? "null") as unknown;
    if (Array.isArray(parsed)) outcomes = parsed.map((o) => String(o));
  } catch {
    outcomes = [];
  }

  const errors: string[] = [];
  let snapshotMs: number | null = null;
  const books: OutcomeBook[] = [];
  const results = await Promise.all(
    tokenIds.map(async (id, i) => {
      const outcome = outcomes[i] ?? `Outcome ${i + 1}`;
      try {
        return { outcome, book: await clobBook(id) };
      } catch (e) {
        errors.push(`${outcome} order book: ${e instanceof Error ? e.message : e}`);
        return { outcome, book: null };
      }
    }),
  );
  for (const { outcome, book } of results) {
    if (!book) continue;
    const bids = sideLevels(book.bids, "desc");
    const asks = sideLevels(book.asks, "asc");
    if (bids.length === 0 && asks.length === 0) continue;
    const ts = toNum(book.timestamp);
    if (ts !== null && (snapshotMs === null || ts > snapshotMs)) snapshotMs = ts;
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    books.push({ outcome, bids, asks, bestBid, bestAsk, spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null });
  }
  return {
    books: books.length > 0 ? books : null,
    snapshotIso: snapshotMs !== null ? new Date(snapshotMs).toISOString() : null,
    errors,
  };
}
