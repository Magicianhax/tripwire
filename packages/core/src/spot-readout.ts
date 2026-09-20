/**
 * Readout logic for the spot card: the small decisions about what a Nansen field *means* that
 * the card would otherwise make inline, where neither the web nor the extension suite can reach
 * them. Nothing here fetches, and nothing here feeds a verdict — these turn already-bought
 * responses into honest copy.
 */
import type { FlowRow } from "./nansen-types";

// --- Exchange net flow (1.1.6) --------------------------------------------------------------

/**
 * `exchange_net_flow_usd` runs at the opposite polarity to the five wallet cohorts: a negative
 * number means tokens *left* exchanges (usually read as accumulation), where a negative cohort
 * flow means that cohort sold. It also never carries a wallet count (`exchange_wallet_count` is
 * always 0, which Nansen says in its own `warnings`), so it can never sit in the segment stack
 * next to rows that do.
 */
export type ExchangeFlow = {
  /** The sentence the row prints, with the figure left for the card to format. */
  direction: "out" | "in" | "flat" | "unknown";
  /** What the movement means, in the product's own words. */
  text: string;
};

export function exchangeFlowCopy(valueUsd: number | null | undefined): ExchangeFlow {
  if (valueUsd === null || valueUsd === undefined || !Number.isFinite(valueUsd)) {
    return { direction: "unknown", text: "Exchange flow unavailable for this window" };
  }
  if (valueUsd === 0) return { direction: "flat", text: "No net movement to or from exchanges" };
  if (valueUsd < 0) return { direction: "out", text: "left exchanges" };
  return { direction: "in", text: "moved onto exchanges" };
}

// --- Flow-intelligence warnings (1.1.7) -----------------------------------------------------

/** The cohorts a `tgm/flow-intelligence` warning can be about, plus the exchange line. */
export type FlowWarningRow = "smart_trader" | "whale" | "public_figure" | "top_pnl" | "fresh_wallets" | "exchange";

const WARNING_ROW_HINTS: [FlowWarningRow, RegExp][] = [
  ["fresh_wallets", /fresh[_\s-]?wallets?/i],
  ["smart_trader", /smart[_\s-]?trader/i],
  ["public_figure", /public[_\s-]?figure/i],
  ["top_pnl", /top[_\s-]?pnl/i],
  ["whale", /whale/i],
  ["exchange", /exchange/i],
];

/**
 * Which row a warning is about, so it renders as a caption under that row rather than as a
 * card-level "Unavailable:". A warning we cannot place is not discarded — it returns null and
 * the card prints it under the section instead.
 */
export function flowWarningRow(warning: string): FlowWarningRow | null {
  for (const [row, re] of WARNING_ROW_HINTS) if (re.test(warning)) return row;
  return null;
}

/** Longest warning the bridge carries, and how many. A documented limitation is a sentence; an
 * unbounded string from an upstream response is not something a 440px card should try to draw. */
export const MAX_WARNING_CHARS = 240;
export const MAX_WARNINGS = 6;

/** The warnings channel as it crosses to the extension: capped in length and count, strings
 * only. These are **not** errors — a documented timeframe limitation is data the user should
 * read, not a fetch failure that turns the verdict UNCHECKED. */
export function toFlowWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const w of raw) {
    if (typeof w !== "string") continue;
    const text = w.trim();
    if (text.length === 0) continue;
    out.push(text.length > MAX_WARNING_CHARS ? `${text.slice(0, MAX_WARNING_CHARS - 1)}…` : text);
    if (out.length === MAX_WARNINGS) break;
  }
  return out;
}

// --- Indicators (1.1.8) ---------------------------------------------------------------------

/**
 * `tgm/indicators` scores come in two vocabularies, and the array an indicator arrives in does
 * not decide which: the live response puts `cex-flows` in `risk_indicators` with score `high`
 * and `concentration-risk` in `reward_indicators` with score `low`, while `price-momentum`
 * (also a reward indicator) scores `bearish`. Grouping by array name therefore mixes a severity
 * scale with a direction scale under one heading.
 */
export type IndicatorVocabulary = "severity" | "direction";

const SEVERITY = /^(low|med|medium|high)$/i;
const DIRECTION = /^(bearish|neutral|bullish)$/i;

export function scoreVocabulary(score: string | null | undefined): IndicatorVocabulary | null {
  if (typeof score !== "string") return null;
  const s = score.trim();
  if (SEVERITY.test(s)) return "severity";
  if (DIRECTION.test(s)) return "direction";
  return null;
}

/** Where a severity score sits, for the pill's colour. `med` and `medium` are the same score. */
export function severityLevel(score: string | null | undefined): "low" | "medium" | "high" | null {
  if (typeof score !== "string") return null;
  const s = score.trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "med" || s === "medium") return "medium";
  if (s === "low") return "low";
  return null;
}

/**
 * `last_trigger_on` as a date we can print, or null for "unknown".
 *
 * Nansen writes "never triggered" as the Unix epoch: the live response carries
 * `"1970-01-01"` on `cex-flows`. Rendered as an age that reads "56 years ago", which states
 * something false. Anything at or before 1970 — and anything unparseable — is unknown.
 */
export function indicatorTriggerDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const ms = Date.parse(raw.trim().includes("T") ? raw.trim() : `${raw.trim().replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) return null;
  // 1971-01-01: the epoch and its neighbourhood are Nansen's "never", not a date.
  if (ms < Date.UTC(1971, 0, 1)) return null;
  return new Date(ms).toISOString();
}

// --- Token record (1.1.2) -------------------------------------------------------------------

/**
 * A `token_deployment_date` as an ISO instant. Nansen sends `"2023-11-20 19:22:43"`: a UTC
 * timestamp written without an offset, which `new Date()` would read as *local* time in the
 * browser and shift by up to a day.
 */
export function toIsoInstant(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const text = raw.trim();
  const normalized = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Whole days between `iso` and now, or null. Used for "Age 671d", never for a verdict. */
export function ageInDays(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms > now) return null;
  return Math.floor((now - ms) / 86_400_000);
}

// --- Both sides of a wallet (1.1.4) ---------------------------------------------------------

/** Case-folds an EVM address so the buy and sell pages match, and leaves anything else — Solana
 * base58 is case-significant — exactly as Nansen returned it. */
export function addressKey(address: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : address;
}

/**
 * Addresses that appear in **both** independently ranked top-20 pages.
 *
 * This is a statement about the sample, not about the token: a wallet that round-tripped but
 * ranked 21st on one side is not in here. Measured on the recorded WIF pages the overlap is
 * **empty** — the two top-20 cuts rank different wallets — which is why it is not the only
 * source of the tag (see `tradedBothSides`).
 */
export function bothSidesKeys(buyers: { address: string }[] | null, sellers: { address: string }[] | null): Set<string> {
  const sold = new Set((sellers ?? []).map((s) => addressKey(s.address)));
  const both = new Set<string>();
  for (const b of buyers ?? []) {
    const key = addressKey(b.address);
    if (sold.has(key)) both.add(key);
  }
  return both;
}

export type TwoSidedRow = { address: string; bought_volume_usd: number | null; sold_volume_usd: number | null };

/**
 * Whether a wallet traded **both** ways in the window.
 *
 * Every `tgm/who-bought-sold` row carries the wallet's own buy *and* sell volume, so a
 * round-trip is a fact about the row, not an inference from the two pages overlapping: the
 * recorded #2 top buyer bought $49,893.51 and sold $49,844.62 while appearing nowhere in the
 * sell page. Page overlap is kept as a second source so a wallet whose other side is zero on
 * this page but ranked on the other is still marked.
 *
 * A null on either side is missing data, not a zero, so it cannot make the tag fire.
 */
export function tradedBothSides(row: TwoSidedRow, otherPage: Set<string> = new Set()): boolean {
  const bought = row.bought_volume_usd;
  const sold = row.sold_volume_usd;
  if (typeof bought === "number" && bought > 0 && typeof sold === "number" && sold > 0) return true;
  return otherPage.has(addressKey(row.address));
}

// --- Price readout (1.1.1) ------------------------------------------------------------------

export type PriceReadout = {
  /** The last close in the window, else the token record's price, else null. */
  priceUsd: number | null;
  /** Percent change across the window; null below two candles — a single candle has no change. */
  changePct: number | null;
  lowUsd: number | null;
  highUsd: number | null;
};

/**
 * The price the card states, from candles the panel already fetched.
 *
 * Lives here rather than inside `PriceChart` because the chart returns null below two points,
 * and "the price of the thing you are about to buy" must survive a one-candle window.
 */
export function priceReadout(
  candles: { interval_start: string; high: number; low: number; close: number }[] | null | undefined,
  fallbackPriceUsd: number | null = null,
): PriceReadout {
  const usable = (candles ?? []).filter((c) => Number.isFinite(c.close) && Number.isFinite(Date.parse(c.interval_start)));
  if (usable.length === 0) {
    const price = typeof fallbackPriceUsd === "number" && Number.isFinite(fallbackPriceUsd) ? fallbackPriceUsd : null;
    return { priceUsd: price, changePct: null, lowUsd: null, highUsd: null };
  }
  const sorted = [...usable].sort((a, b) => Date.parse(a.interval_start) - Date.parse(b.interval_start));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lows = sorted.map((c) => c.low).filter((n) => Number.isFinite(n));
  const highs = sorted.map((c) => c.high).filter((n) => Number.isFinite(n));
  return {
    priceUsd: last.close,
    changePct: sorted.length >= 2 && first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : null,
    lowUsd: lows.length > 0 ? Math.min(...lows) : null,
    highUsd: highs.length > 0 ? Math.max(...highs) : null,
  };
}

/** The five cohort rows the segment stack draws, so the exchange line can be proven absent. */
export const FLOW_STACK_FIELDS: (keyof FlowRow)[] = [
  "smart_trader_net_flow_usd",
  "whale_net_flow_usd",
  "public_figure_net_flow_usd",
  "top_pnl_net_flow_usd",
  "fresh_wallets_net_flow_usd",
];
