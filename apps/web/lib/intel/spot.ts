import {
  CANDLE_INTERVAL,
  MS_PER_TIMEFRAME,
  spotDerived,
  spotSignals,
  VERDICT_TIMEFRAME,
  type Candle,
  type FlowRow,
  type Signal,
  type SpotTarget,
  type TokenInfo,
  type ViewTimeframe,
  type WhoRow,
} from "@tripwire/core";
import {
  CANDLE_TTL,
  DRAWDOWN_DAYS,
  DRAWDOWN_TTL,
  nansen,
  OHLCV_TTL,
  TOKEN_INFO_TTL,
  WHO_BOUGHT_SOLD_TTL,
  type TokenInformationResponse,
} from "../nansen/endpoints";
import { bucketNow, isoNoMs, settle } from "./util";

export type SpotChart = {
  /** The window the user is looking at. */
  timeframe: ViewTimeframe;
  /** The candle interval inside it ("15m"). */
  interval: string;
  candles: Candle[] | null;
};

export type SpotPanel = {
  /** Name, symbol, logo and the market figures behind the header. */
  token: TokenInfo | null;
  /** The flow the verdict was computed from. Always the verdict window. */
  flow: FlowRow | null;
  flowTimeframe: string;
  /** The flow for the window the user picked; the same row when they match. */
  viewFlow: FlowRow | null;
  viewTimeframe: ViewTimeframe;
  netflow: { h1: number | null; h24: number | null; d7: number | null; d30: number | null; symbol: string | null; traders: number | null } | null;
  indicators: { type: string; score: string; percentile: number | null }[] | null;
  marketCapUsd: number | null;
  topBuyers: WhoRow[] | null;
  topSellers: WhoRow[] | null;
  chart: SpotChart | null;
  /** How much fresh-wallet money took the other side of the labeled exit, or null. */
  absorption: number | null;
  /** The labeled figures behind the percentages, for the evidence copy. */
  labeledUsd: number | null;
  labeledWallets: number;
  postTimeIso: string | null;
  /** The token logo from Nansen token information, https only, else null. */
  logoUrl: string | null;
  errors: string[];
};

/** A remote token logo the extension may render as an <img>: an https URL of sane length. */
export function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max = 80): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** Nansen writes memecoin symbols both ways ("$WIF" and "WIF"); the card adds its own "$". */
const stripCashtag = (s: string | null) => (s === null ? null : s.replace(/^\$/, "") || null);

export function toTokenInfo(raw: TokenInformationResponse | null | undefined, priceUsd: number | null = null): TokenInfo | null {
  if (!raw) return null;
  return {
    name: text(raw.name, 120),
    symbol: stripCashtag(text(raw.symbol, 32)),
    logoUrl: safeLogoUrl(raw.logo),
    marketCapUsd: num(raw.token_details?.market_cap_usd),
    volume24hUsd: num(raw.spot_metrics?.volume_total_usd),
    liquidityUsd: num(raw.spot_metrics?.liquidity_usd),
    priceUsd,
  };
}

/** Percentage change across a candle series, and how long that series actually spans. */
export function candleChange(candles: Candle[] | null): { pct: number | null; spanMs: number } {
  if (!candles || candles.length < 2) return { pct: null, spanMs: 0 };
  const sorted = [...candles].sort((a, b) => new Date(a.interval_start).getTime() - new Date(b.interval_start).getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanMs = new Date(last.interval_start).getTime() - new Date(first.interval_start).getTime();
  if (!Number.isFinite(first.close) || first.close === 0) return { pct: null, spanMs };
  return { pct: ((last.close - first.close) / first.close) * 100, spanMs };
}

/** Five days of history is enough to call a change a 7-day drawdown; less falls back to 24h. */
const SEVEN_DAY_FLOOR_MS = 5 * 24 * 3_600_000;

export type SpotIntel = { signals: Signal[]; panel: SpotPanel; headline: string | null };

export async function buildSpotIntel(
  t: SpotTarget,
  opts: {
    mode: "chip" | "panel";
    postTimeIso?: string;
    author?: { entity: string; valueUsd: number } | null;
    /** The window the card is showing. Never reaches the verdict. */
    timeframe?: ViewTimeframe;
  },
): Promise<SpotIntel> {
  const { chain, tokenAddress } = t;
  const viewTimeframe: ViewTimeframe = opts.timeframe ?? VERDICT_TIMEFRAME;

  // Everything the verdict is computed from, in both chip and panel mode, always on the verdict
  // window: the flow segments, Smart Money's netflow, the risk indicators, the 24h volume every
  // flow is normalized by, and the price history behind the drawdown.
  const drawdownTo = bucketNow(DRAWDOWN_TTL);
  const drawdownFrom = new Date(drawdownTo.getTime() - DRAWDOWN_DAYS * 24 * 3_600_000);

  const [flow, netflow, indicators, info, history] = await Promise.all([
    settle(nansen.flowIntel(chain, tokenAddress, VERDICT_TIMEFRAME), (d) => d.data?.[0]),
    settle(nansen.smNetflow(chain, tokenAddress), (d) => d.data?.[0]),
    settle(nansen.indicators(chain, tokenAddress), (d) => d),
    settle(nansen.tokenInformation(chain, tokenAddress), (d) => d.data),
    settle(nansen.ohlcv(chain, tokenAddress, "1d", isoNoMs(drawdownFrom), isoNoMs(drawdownTo), DRAWDOWN_TTL), (d) => d.data),
  ]);

  const change = candleChange(history.value);
  const lastClose = history.value?.length ? history.value[history.value.length - 1]!.close : null;
  const token = toTokenInfo(info.value, num(lastClose));

  // A call that threw is a gap; a call that answered with nothing is a measurement. The
  // signals need the difference to tell UNCHECKED from CLEAR.
  const failed = { flow: !!flow.error, netflow: !!netflow.error, market: !!info.error, price: !!history.error };

  const signals = spotSignals({
    flow: flow.value,
    netflow: netflow.value,
    indicators: indicators.value,
    author: opts.author,
    vol24: token?.volume24hUsd ?? null,
    priceChange7dPct: change.spanMs >= SEVEN_DAY_FLOOR_MS ? change.pct : null,
    priceChange24hPct: change.spanMs < SEVEN_DAY_FLOOR_MS ? change.pct : null,
    failed,
    chain,
  });
  const derived = spotDerived({ flow: flow.value, vol24: token?.volume24hUsd ?? null });

  // token-information and the drawdown history are now verdict inputs, so their failure is a
  // real evidence gap (it turns the spot signals UNCHECKED), not a cosmetic one.
  const errors = [flow.error, netflow.error, indicators.error, info.error, history.error].filter((e): e is string => !!e);
  // The one-line reason an UNCHECKED spot target could not be checked: the label of the first
  // signal that came back unavailable, which already names the endpoint and the chain.
  const headline = signals.find((s) => s.value === null)?.label ?? null;

  const panel: SpotPanel = {
    token,
    flow: flow.value,
    flowTimeframe: VERDICT_TIMEFRAME,
    viewFlow: flow.value,
    viewTimeframe,
    netflow: netflow.value
      ? {
          h1: netflow.value.net_flow_1h_usd,
          h24: netflow.value.net_flow_24h_usd,
          d7: netflow.value.net_flow_7d_usd,
          d30: netflow.value.net_flow_30d_usd,
          symbol: netflow.value.token_symbol?.replace(/^\$/, "") ?? null,
          traders: netflow.value.trader_count ?? null,
        }
      : null,
    indicators: indicators.value
      ? [...(indicators.value.risk_indicators ?? []), ...(indicators.value.reward_indicators ?? [])].map((i) => ({
          type: i.indicator_type,
          score: i.score,
          percentile: i.signal_percentile,
        }))
      : null,
    marketCapUsd: token?.marketCapUsd ?? indicators.value?.token_info?.market_cap_usd ?? null,
    topBuyers: null,
    topSellers: null,
    chart: null,
    absorption: derived.absorption,
    labeledUsd: derived.labeledUsd,
    labeledWallets: derived.labeledWallets,
    postTimeIso: opts.postTimeIso ?? null,
    logoUrl: token?.logoUrl ?? null,
    errors,
  };

  if (opts.mode === "panel") {
    // who-bought-sold and the chart share a bucketed `now` so repeat opens inside the window
    // reuse the cache instead of spending a credit each time.
    const interval = CANDLE_INTERVAL[viewTimeframe];
    const chartTtl = CANDLE_TTL[interval] ?? OHLCV_TTL;
    const now = bucketNow(Math.min(WHO_BOUGHT_SOLD_TTL, chartTtl));
    const postTime = opts.postTimeIso ? new Date(opts.postTimeIso) : null;
    const ageMs = postTime ? Math.max(0, now.getTime() - postTime.getTime()) : 24 * 3_600_000;
    const from = new Date(now.getTime() - Math.max(ageMs, 3_600_000));
    const chartTo = bucketNow(chartTtl);
    const chartFrom = new Date(chartTo.getTime() - MS_PER_TIMEFRAME[viewTimeframe]);

    const [buyers, sellers, candles, viewFlow] = await Promise.all([
      settle(nansen.whoBoughtSold(chain, tokenAddress, "BUY", isoNoMs(from), isoNoMs(now)), (d) => d.data),
      settle(nansen.whoBoughtSold(chain, tokenAddress, "SELL", isoNoMs(from), isoNoMs(now)), (d) => d.data),
      settle(nansen.ohlcv(chain, tokenAddress, interval, isoNoMs(chartFrom), isoNoMs(chartTo), chartTtl), (d) => d.data),
      viewTimeframe === VERDICT_TIMEFRAME
        ? Promise.resolve(null)
        : settle(nansen.flowIntel(chain, tokenAddress, viewTimeframe), (d) => d.data?.[0]),
    ]);
    panel.topBuyers = buyers.value;
    panel.topSellers = sellers.value;
    panel.chart = { timeframe: viewTimeframe, interval, candles: candles.value };
    if (viewFlow) panel.viewFlow = viewFlow.value;
    panel.errors.push(...[buyers.error, sellers.error, candles.error, viewFlow?.error].filter((e): e is string => !!e));
  }

  return { signals, panel, headline };
}
