import fs from "node:fs";
import path from "node:path";
import {
  holderKey,
  isYesNoOutcomes,
  predictionSignals,
  recordFromAddressSummary,
  sideTotals,
  targetOutcomeIndex,
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
  /**
   * The market's own outcome names, in Gamma's order (Round 2.2). `["Yes", "No"]` on two thirds
   * of the book and `["BAL", "NO"]`, `["Ravens", "Saints"]` or `["Over", "Under"]` on the rest.
   * Index 0 is the outcome `bestBid`, `bestAsk` and `yesPrice` are quoted for.
   */
  outcomes: string[] | null;
  /** Polymarket's cached price per outcome, index-aligned with `outcomes`. Never the headline. */
  outcomePrices: number[] | null;
  /**
   * The headline price for **outcome 0**, 0-1. Mid of the resting book when there is one.
   *
   * Named `yesPrice` because that is what outcome 0 is on a Yes/No market; on `["BAL", "NO"]`
   * it is BAL's price, which is why every render of it is labelled with `outcomes[0]` rather
   * than with the word "Yes".
   */
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
  /**
   * Which outcome of `market.outcomes` the page is buying, resolved from the market-scoped
   * control the adapter read. Null means nothing was picked, or what was picked is not on this
   * market — either way UNCHECKED, never a default (Round 2.2).
   */
  outcomeIndex: number | null;
  /** That outcome's name, as Gamma spells it, for the copy. */
  targetOutcome: string | null;
  /** The raw label the page offered, when it is not one of this market's outcomes. */
  unknownOutcome: string | null;
  /**
   * The event's other open markets, free. Present when the slug was an ambiguous event, and on a
   * resolved market once the panel has fetched its siblings. Evidence only: nothing in here
   * moves the verdict, which stays UNCHECKED while the page has not picked (Round 2.2).
   */
  options: MarketOption[] | null;
  /** How many open markets the event has, when `options` is a capped slice of them. */
  optionsTotal: number | null;
  /** The event those options belong to, for the links back into the page's own selector. */
  eventSlug: string | null;
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
export type MarketProblem = "Pick a market" | "Market outcomes unavailable" | "Market not found";

/**
 * One row of the event picker: what an already-fetched sibling market is, at 0 credits.
 *
 * Deliberately narrow. The live `/events?slug=nfl-no-bal-2026-09-20` answers **329 open markets
 * of 88 fields each**; carrying those through the cache and across the bridge to draw a list
 * would be tens of thousands of keys for six figures per row.
 */
export type MarketOption = {
  id: string;
  slug: string;
  question: string;
  /** The event's own name for this market ("Spread -3.5", "68,000"). Null on the base market. */
  groupItemTitle: string | null;
  outcomes: string[] | null;
  /** Polymarket's cached price for each outcome. The picker never claims to be a live book. */
  outcomePrices: number[] | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  endDate: string | null;
  state: MarketState | null;
};

export type MarketResolution = {
  market: GammaMarket | null;
  problem: MarketProblem | null;
  fetchedAtIso?: string;
  /** The event's open markets when more than one answered, so the picker costs no second call. */
  options?: MarketOption[] | null;
  /** How many open markets the event actually has, when `options` is a capped slice of them. */
  optionsTotal?: number | null;
};

const FOUND_TTL_MS = 3_600_000;
const NOT_FOUND_TTL_MS = 5 * 60_000;
/** Polymarket's own resolution prose, capped before it crosses the bridge. */
const DESCRIPTION_MAX = 1_200;
/** Round 1.2.8: at most this many 1-credit address-summary calls per card, ever. */
export const HOLDER_RECORD_CAP = 10;

/**
 * The picker never carries more rows than this, however many the event has.
 *
 * `nfl-no-bal-2026-09-20` had **329 open markets** on 2026-09-20. A list that long is not a
 * picker; the 50 with the most 24h volume are, and the card states the total it is a slice of.
 */
export const MARKET_OPTIONS_CAP = 50;

/** Gamma's outcome set for a market, or null when it did not send a usable one. */
function marketOutcomes(m: GammaMarket): string[] | null {
  const parsed = jsonArray(m.outcomes);
  return parsed && parsed.length >= 2 ? parsed : null;
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
 * exactly one open market, and otherwise it answers "Pick a market" **with that event's markets
 * attached**, because the call that found them has already been paid for (Round 2.2).
 *
 * The market no longer has to be Yes/No. What it must have is an outcome set of its own, which
 * every later decision is made against: a market whose outcomes are `["BAL", "NO"]` is checked
 * against BAL and New Orleans, never against the words yes and no. A market that carries no
 * usable outcome set is still left UNCHECKED rather than guessed at.
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
    const market = fixture<GammaMarket>("gammaMarket.json");
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

/** Where replay reads its Gamma fixtures from. */
function fixture<T>(name: string): T | null {
  const dir = process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen");
  const file = path.resolve(dir, name);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

/**
 * The other open markets of a resolved market's event (Round 2.2), free.
 *
 * A market object's nested `events[0]` has 52 keys and **no `markets[]`**, so the siblings need
 * their own `/events?slug=` call. It is a second public Gamma GET and no Nansen credit, but it
 * is still a round trip, so it has its own cache key and is only ever made in panel mode — a
 * chip must not fetch a list nobody is looking at.
 */
export async function siblingOptions(eventSlug: string, excludeMarketId: string): Promise<{ options: MarketOption[]; optionsTotal: number } | null> {
  const cacheKey = `gammaSiblings1|${eventSlug}`;
  const db = getDb();
  const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey) as { value: string; expires_at: number } | undefined;
  let all: MarketOption[];
  let total: number;
  if (row && row.expires_at > Date.now()) {
    const cached = JSON.parse(row.value) as { options: MarketOption[]; optionsTotal: number };
    all = cached.options;
    total = cached.optionsTotal;
  } else {
    const events = isReplay()
      ? (fixture<{ markets?: GammaMarket[] }[]>("gammaEvent.json") ?? [])
      : await gammaGet<{ markets?: GammaMarket[] }[]>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`);
    const open = (events[0]?.markets ?? []).filter((m) => !m.closed);
    const mapped = toOptions(open);
    all = mapped.options;
    total = mapped.optionsTotal;
    const now = Date.now();
    const ttl = all.length > 0 ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
    db.prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)").run(cacheKey, JSON.stringify({ options: all, optionsTotal: total }), now, now + ttl);
  }
  const others = all.filter((o) => o.id !== excludeMarketId);
  // One market in an event of one is not a picker, and a row for the market already on screen
  // is not a sibling.
  return others.length > 0 ? { options: others, optionsTotal: Math.max(total - 1, others.length) } : null;
}

function judge(candidates: GammaMarket[]): MarketResolution {
  if (candidates.length === 0) return { market: null, problem: "Market not found" };
  if (candidates.length > 1) {
    // Still UNCHECKED, and now with evidence: the picker is drawn from this list and spends
    // nothing to get it. Which market is the target is decided by the page, never by the card.
    return { market: null, problem: "Pick a market", ...toOptions(candidates) };
  }
  const market = candidates[0]!;
  if (!marketOutcomes(market)) return { market: null, problem: "Market outcomes unavailable" };
  // A settled market still resolves. Refusing it would drop the holders and trades that are the
  // only honest thing left to show; the state travels with the market instead (Round 1.2.3).
  return { market, problem: null };
}

/** Gamma market -> a picker row. Absent stays absent; nothing here is derived or inferred. */
export function toOption(m: GammaMarket): MarketOption {
  return {
    id: m.id,
    slug: m.slug,
    question: m.question,
    groupItemTitle: typeof m.groupItemTitle === "string" && m.groupItemTitle.trim() !== "" ? m.groupItemTitle : null,
    outcomes: marketOutcomes(m),
    outcomePrices: numberArray(m.outcomePrices),
    volume24hUsd: numOrNull(m.volume24hr),
    liquidityUsd: numOrNull(m.liquidityNum),
    endDate: m.endDate ?? null,
    state: marketState(m),
  };
}

/**
 * The event's markets, ordered by 24h volume and capped.
 *
 * Ordering is the whole value on a strike ladder: eleven "Bitcoin above X" markets are eleven
 * near-identical questions, and the one being traded is almost always the one with the volume. A
 * market Gamma sent no 24h volume for sorts last rather than as zero.
 */
function toOptions(candidates: GammaMarket[]): { options: MarketOption[]; optionsTotal: number } {
  const ranked = [...candidates].sort((a, b) => (numOrNull(b.volume24hr) ?? -1) - (numOrNull(a.volume24hr) ?? -1));
  return { options: ranked.slice(0, MARKET_OPTIONS_CAP).map(toOption), optionsTotal: candidates.length };
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

/** Gamma's `outcomePrices` is a JSON array of decimal *strings*. A value that is not a finite
 * number is dropped from the row rather than printed as 0. */
function numberArray(raw: string | undefined): number[] | null {
  const parsed = jsonArray(raw);
  if (!parsed) return null;
  const nums = parsed.map((v) => Number(v));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

const numOrNull = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const boolOrNull = (v: boolean | undefined): boolean | null => (typeof v === "boolean" ? v : null);

const emptyPanel = (market: PredictionMarket | null, errors: string[], historical = false, over: Partial<PredictionPanel> = {}): PredictionPanel => ({
  market,
  holders: null,
  sides: null,
  recordsChecked: null,
  recordsCap: HOLDER_RECORD_CAP,
  trades: null,
  historical,
  outcomeIndex: null,
  targetOutcome: null,
  unknownOutcome: null,
  options: null,
  optionsTotal: null,
  eventSlug: market?.eventSlug ?? null,
  errors,
  ...over,
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
      signals: predictionSignals({}),
      panel: emptyPanel(null, problem ? [...errors, problem] : errors, false, {
        // "Pick a market" arrives with the event's markets already in hand: the picker is the
        // evidence for an UNCHECKED verdict, not a way to make it checked.
        options: resolution?.options ?? null,
        optionsTotal: resolution?.optionsTotal ?? null,
        eventSlug: t.slug,
      }),
      headline: problem,
    };
  }
  const market = toMarket(gamma, resolution?.fetchedAtIso ?? null);
  const marketId = market.id;
  const resolved = market.state === "resolved";
  const outcomes = market.outcomes;
  // The market's own outcome set decides what the page picked. `outcomeLabel` is matched against
  // it exactly, which is what stops "NO" on a ["BAL", "NO"] market from reading as the no side.
  const outcomeIndex = targetOutcomeIndex(t, outcomes);
  const targetOutcome = outcomeIndex === null ? null : (outcomes?.[outcomeIndex] ?? null);
  const offered = typeof t.outcomeLabel === "string" && t.outcomeLabel.trim() !== "" ? t.outcomeLabel.trim() : null;
  const unknownOutcome = outcomeIndex === null && offered ? offered : null;
  const pickHeadline = unknownOutcome
    ? "Outcome not on this market"
    : outcomes && outcomes.length === 2
      ? `Pick ${outcomes[0]} or ${outcomes[1]}`
      : "Pick an outcome";
  const base = { outcomeIndex, targetOutcome, unknownOutcome, eventSlug: market.eventSlug };

  if (outcomeIndex === null && mode === "chip") {
    // Without a resolved outcome the signal can't be computed: don't spend credits on the chip.
    return { signals: predictionSignals({ outcomes }), panel: emptyPanel(market, errors, false, base), headline: pickHeadline };
  }
  if (resolved && mode === "chip") {
    // A settled market can never produce a side comparison, so the chip buys nothing for it.
    return { signals: predictionSignals({ outcomes, outcomeIndex }), panel: emptyPanel(market, errors, true, base), headline: "Market already resolved" };
  }
  const headline = outcomeIndex !== null ? (resolved ? "Market already resolved" : null) : pickHeadline;

  const [holders, trades, siblings] = await Promise.all([
    settle(nansen.pmTopHolders(marketId), (d) => d.data),
    mode === "panel" ? settle(nansen.pmTrades(marketId), (d) => d.data) : Promise.resolve(null),
    // Free, panel-only, and never allowed to fail the card: a missing sibling list is a missing
    // section, not a missing verdict.
    mode === "panel" && market.eventSlug ? siblingOptions(market.eventSlug, marketId).catch(() => null) : Promise.resolve(null),
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
    signals: resolved
      ? predictionSignals({ outcomes, outcomeIndex })
      : predictionSignals({ outcomes, outcomeIndex, holders: holders.value, records }),
    panel: {
      market,
      holders: list.map((h) => ({ ...h, key: holderKey(h), record: records[holderKey(h)] ?? null })),
      sides: sideTotals(list, outcomes),
      recordsChecked: resolved ? null : Object.keys(records).length,
      recordsCap: HOLDER_RECORD_CAP,
      trades: trades?.value ?? null,
      historical: resolved,
      ...base,
      options: siblings?.options ?? null,
      optionsTotal: siblings?.optionsTotal ?? null,
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
    outcomes: marketOutcomes(m),
    outcomePrices: numberArray(m.outcomePrices),
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
