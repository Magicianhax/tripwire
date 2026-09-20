import fs from "node:fs";
import path from "node:path";
import {
  holderKey,
  predictionSignals,
  recordFromAddressSummary,
  sideTotals,
  type HolderRecord,
  type PmHolder,
  type PmTrade,
  type PredictionTarget,
  type Signal,
  type SideTotals,
} from "@tripwire/core";
import { getDb } from "../db";
import { isReplay } from "../nansen/client";
import { nansen } from "../nansen/endpoints";
import { mapLimit, settle } from "./util";

/** Live, not taking orders, or settled. `null` means Gamma did not say. */
export type MarketState = "live" | "paused" | "resolved";

export type PredictionMarket = {
  id: string;
  question: string;
  slug: string;
  state: MarketState | null;
  /** The headline price for Yes, 0-1. Mid of the resting book when there is one. */
  yesPrice: number | null;
  /** Where `yesPrice` came from, so the card can say it. */
  yesPriceSource: "book" | "last-trade" | "cached" | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastTradePrice: number | null;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  liquidityUsd: number | null;
  volumeUsd: number | null;
  volume24hUsd: number | null;
  volume1wkUsd: number | null;
  endDate: string | null;
  endDateIso: string | null;
  startDateIso: string | null;
  negRisk: boolean | null;
  clobTokenIds: string[] | null;
  /** Polymarket's own resolution text. Third-party prose: capped, rendered as text, never HTML. */
  description: string | null;
  groupItemTitle: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  active: boolean | null;
  closed: boolean | null;
  acceptingOrders: boolean | null;
  /**
   * UMA's resolution states. An **empty array means "no resolution information"**, never
   * "unresolved": Gamma returns `"[]"` for markets that have simply not reached UMA yet.
   */
  umaResolutionStatuses: string[] | null;
  /** When this Gamma response was fetched. The prices below are as of this instant, not now. */
  pricedAtIso: string | null;
};

export type PredictionPanel = {
  market: PredictionMarket | null;
  holders: (PmHolder & { key: string; record: HolderRecord | null })[] | null;
  /** How the sampled holders' money splits, and how concentrated the sample is (1.2.6). */
  sides: SideTotals | null;
  /** How many of the sampled holders we bought a record for, and the cap that bounded it. */
  recordsChecked: number | null;
  recordsCap: number;
  trades: PmTrade[] | null;
  /** Holders and trades on a settled market are history, not a live read. */
  historical: boolean;
  errors: string[];
};

/**
 * The live Gamma market object carries 84 fields. This is the subset the card can say something
 * true with (Round 1.2.1) — every one optional, because Gamma omits rather than nulls: the
 * recorded market has `oneDayPriceChange` and no `oneWeekPriceChange` at all.
 */
type GammaMarket = {
  id: string;
  slug: string;
  question: string;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  endDateIso?: string;
  startDateIso?: string;
  volumeNum?: number;
  volume24hr?: number;
  volume1wk?: number;
  liquidityNum?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  negRisk?: boolean;
  clobTokenIds?: string;
  description?: string;
  groupItemTitle?: string;
  events?: { slug?: string; title?: string }[];
  umaResolutionStatuses?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
};

/** Why a prediction target can't be checked (shown as the UNCHECKED headline), or null. */
export type MarketProblem = "Pick a market" | "Not a Yes/No market" | "Market not found";
export type MarketResolution = { market: GammaMarket | null; problem: MarketProblem | null; fetchedAtIso?: string };

const FOUND_TTL_MS = 3_600_000;
const NOT_FOUND_TTL_MS = 5 * 60_000;
/** Polymarket's own resolution prose, capped before it crosses the bridge. */
const DESCRIPTION_MAX = 1_200;
/** Round 1.2.8: at most this many 1-credit address-summary calls per card, ever. */
export const HOLDER_RECORD_CAP = 10;

function isYesNoMarket(m: GammaMarket): boolean {
  try {
    const outcomes = JSON.parse(m.outcomes ?? "null") as unknown;
    return Array.isArray(outcomes) && outcomes.length === 2 && String(outcomes[0]).toLowerCase() === "yes" && String(outcomes[1]).toLowerCase() === "no";
  } catch {
    return false;
  }
}

/** A Gamma GET that throws on a non-OK status or network error, so failures are never cached. */
async function gammaGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Polymarket slug -> market via Polymarket's public Gamma API (not a Nansen call; ids match
 * Nansen market_id). A market slug resolves directly; an event slug only when the event has
 * exactly one open market. The market must be a plain Yes/No market -- anything else is left
 * UNCHECKED rather than guessed at (a wrong market or outcome could block the wrong trade).
 *
 * Cached: a found market 1h, a real (200) not-found / ambiguous answer 5 min; errors never.
 */
export async function resolveMarket(slug: string): Promise<MarketResolution> {
  const cacheKey = `gamma3|${slug}`;
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey) as { value: string; expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) return JSON.parse(row.value) as MarketResolution;

  let result: MarketResolution;
  if (isReplay()) {
    const file = path.resolve(process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen"), "gammaMarket.json");
    const market = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as GammaMarket) : null;
    result = judge(market ? [market] : []);
  } else {
    const byMarket = await gammaGet<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
    if (byMarket[0]) {
      result = judge([byMarket[0]]);
    } else {
      const events = await gammaGet<{ markets?: GammaMarket[] }[]>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
      result = judge((events[0]?.markets ?? []).filter((m) => !m.closed));
    }
  }

  const now = Date.now();
  result.fetchedAtIso = new Date(now).toISOString();
  const ttl = result.market ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
  db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(cacheKey, JSON.stringify(result), now, now + ttl);
  return result;
}

function judge(candidates: GammaMarket[]): MarketResolution {
  if (candidates.length === 0) return { market: null, problem: "Market not found" };
  if (candidates.length > 1) return { market: null, problem: "Pick a market" };
  const market = candidates[0]!;
  if (!isYesNoMarket(market)) return { market: null, problem: "Not a Yes/No market" };
  // A settled market still resolves. Refusing it would drop the holders and trades that are the
  // only honest thing left to show; the state travels with the market instead (Round 1.2.3).
  return { market, problem: null };
}

/**
 * Round 1.2.3. `closed` wins: a settled market is settled whatever else it says. Otherwise a
 * market that is not accepting orders (or that Gamma has deactivated) is paused, not live.
 */
export function marketState(m: Pick<GammaMarket, "active" | "closed" | "acceptingOrders">): MarketState | null {
  if (m.closed === true) return "resolved";
  if (m.acceptingOrders === false || m.active === false) return "paused";
  if (m.closed === false) return "live";
  return null;
}

function jsonArray(raw: string | undefined): string[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : null;
  } catch {
    return null;
  }
}

const numOrNull = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const boolOrNull = (v: boolean | undefined): boolean | null => (typeof v === "boolean" ? v : null);

const emptyPanel = (market: PredictionMarket | null, errors: string[], historical = false): PredictionPanel => ({
  market,
  holders: null,
  sides: null,
  recordsChecked: null,
  recordsCap: HOLDER_RECORD_CAP,
  trades: null,
  historical,
  errors,
});

export async function buildPredictionIntel(
  t: PredictionTarget,
  mode: "chip" | "panel",
): Promise<{ signals: Signal[]; panel: PredictionPanel; headline: string | null }> {
  const errors: string[] = [];
  let resolution: MarketResolution | null = null;
  try {
    resolution = await resolveMarket(t.slug);
  } catch (e) {
    errors.push(`Polymarket lookup failed: ${e instanceof Error ? e.message : e}`);
  }
  const gamma = resolution?.market ?? null;
  if (!gamma) {
    const problem = resolution?.problem ?? null;
    return {
      signals: predictionSignals({ outcome: t.outcome }),
      panel: emptyPanel(null, problem ? [...errors, problem] : errors),
      headline: problem,
    };
  }
  const market = toMarket(gamma, resolution?.fetchedAtIso ?? null);
  const marketId = market.id;
  const resolved = market.state === "resolved";

  if (!t.outcome && mode === "chip") {
    // Without a picked outcome the signal can't be computed: don't spend credits on the chip.
    return { signals: predictionSignals({}), panel: emptyPanel(market, errors), headline: "Pick Yes or No" };
  }
  if (resolved && mode === "chip") {
    // A settled market can never produce a side comparison, so the chip buys nothing for it.
    return { signals: predictionSignals({ outcome: t.outcome }), panel: emptyPanel(market, errors, true), headline: "Market already resolved" };
  }
  const headline = t.outcome ? (resolved ? "Market already resolved" : null) : "Pick Yes or No";

  const [holders, trades] = await Promise.all([
    settle(nansen.pmTopHolders(marketId), (d) => d.data),
    mode === "panel" ? settle(nansen.pmTrades(marketId), (d) => d.data) : Promise.resolve(null),
  ]);
  if (holders.error) errors.push(holders.error);
  if (trades?.error) errors.push(trades.error);
  const list = holders.value ?? [];

  // Round 1.2.8: at most HOLDER_RECORD_CAP 1-credit calls, taken from the largest positions
  // (top-holders is ordered by position_size DESC), and none at all on a settled market where
  // the comparison they feed cannot exist.
  const records: Record<string, HolderRecord> = {};
  const keys = resolved ? [] : [...new Set(list.map(holderKey))].slice(0, HOLDER_RECORD_CAP);
  await mapLimit(keys, 4, async (key) => {
    const r = await settle(nansen.pmAddressSummary(key), (d) => d.data?.[0] ?? null);
    if (r.value) records[key] = recordFromAddressSummary(r.value);
  });

  return {
    signals: resolved ? predictionSignals({ outcome: t.outcome }) : predictionSignals({ outcome: t.outcome, holders: holders.value, records }),
    panel: {
      market,
      holders: list.map((h) => ({ ...h, key: holderKey(h), record: records[holderKey(h)] ?? null })),
      sides: sideTotals(list),
      recordsChecked: resolved ? null : Object.keys(records).length,
      recordsCap: HOLDER_RECORD_CAP,
      trades: trades?.value ?? null,
      historical: resolved,
      errors,
    },
    headline,
  };
}

/** Gamma's market object -> the DTO the card reads. Absent means null, never 0 and never "". */
export function toMarket(m: GammaMarket, fetchedAtIso: string | null): PredictionMarket {
  const bestBid = numOrNull(m.bestBid);
  const bestAsk = numOrNull(m.bestAsk);
  const lastTradePrice = numOrNull(m.lastTradePrice);
  let cached: number | null = null;
  try {
    const prices = JSON.parse(m.outcomePrices ?? "null") as unknown;
    if (Array.isArray(prices) && prices.length > 0) {
      const n = Number(prices[0]);
      cached = Number.isFinite(n) ? n : null;
    }
  } catch {
    cached = null;
  }
  // The book is the live price. `outcomePrices` is a cached snapshot that will disagree with the
  // Book tab and with Nansen's current_price, so it is only ever the last resort (Round 1.2.2).
  let yesPrice: number | null = null;
  let yesPriceSource: PredictionMarket["yesPriceSource"] = null;
  if (bestBid !== null && bestAsk !== null) {
    yesPrice = (bestBid + bestAsk) / 2;
    yesPriceSource = "book";
  } else if (lastTradePrice !== null) {
    yesPrice = lastTradePrice;
    yesPriceSource = "last-trade";
  } else if (cached !== null) {
    yesPrice = cached;
    yesPriceSource = "cached";
  }
  const event = m.events?.[0] ?? null;
  const description = typeof m.description === "string" && m.description.trim() !== "" ? m.description.slice(0, DESCRIPTION_MAX) : null;
  return {
    id: m.id,
    question: m.question,
    slug: m.slug,
    state: marketState(m),
    yesPrice,
    yesPriceSource,
    bestBid,
    bestAsk,
    spread: numOrNull(m.spread) ?? (bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null),
    lastTradePrice,
    oneDayPriceChange: numOrNull(m.oneDayPriceChange),
    oneWeekPriceChange: numOrNull(m.oneWeekPriceChange),
    liquidityUsd: numOrNull(m.liquidityNum),
    volumeUsd: numOrNull(m.volumeNum),
    volume24hUsd: numOrNull(m.volume24hr),
    volume1wkUsd: numOrNull(m.volume1wk),
    endDate: m.endDate ?? null,
    endDateIso: m.endDateIso ?? null,
    startDateIso: m.startDateIso ?? null,
    negRisk: boolOrNull(m.negRisk),
    clobTokenIds: jsonArray(m.clobTokenIds),
    description,
    groupItemTitle: typeof m.groupItemTitle === "string" && m.groupItemTitle.trim() !== "" ? m.groupItemTitle : null,
    eventTitle: typeof event?.title === "string" && event.title.trim() !== "" ? event.title : null,
    eventSlug: typeof event?.slug === "string" && event.slug.trim() !== "" ? event.slug : null,
    active: boolOrNull(m.active),
    closed: boolOrNull(m.closed),
    acceptingOrders: boolOrNull(m.acceptingOrders),
    umaResolutionStatuses: jsonArray(m.umaResolutionStatuses),
    pricedAtIso: fetchedAtIso,
  };
}
