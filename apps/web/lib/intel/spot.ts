import { pickFlowTimeframe, spotSignals, type Candle, type FlowRow, type Signal, type SpotTarget, type WhoRow } from "@tripwire/core";
import { nansen } from "../nansen/endpoints";
import { isoNoMs, settle } from "./util";

export type SpotPanel = {
  flow: FlowRow | null;
  flowTimeframe: string;
  sincePost: { timeframe: string; flow: FlowRow | null } | null;
  netflow: { h1: number | null; h24: number | null; d7: number | null; d30: number | null; symbol: string | null } | null;
  indicators: { type: string; score: string; percentile: number | null }[] | null;
  marketCapUsd: number | null;
  topBuyers: WhoRow[] | null;
  topSellers: WhoRow[] | null;
  candles: Candle[] | null;
  postTimeIso: string | null;
  errors: string[];
};

export type SpotIntel = { signals: Signal[]; panel: SpotPanel };

export async function buildSpotIntel(
  t: SpotTarget,
  opts: { mode: "chip" | "panel"; postTimeIso?: string; author?: { entity: string; valueUsd: number } | null },
): Promise<SpotIntel> {
  const { chain, tokenAddress } = t;
  const now = new Date();

  // Signals always use the 1d window: fresh-wallet data only exists for 1d/7d.
  const [flow, netflow, indicators] = await Promise.all([
    settle(nansen.flowIntel(chain, tokenAddress, "1d"), (d) => d.data?.[0]),
    settle(nansen.smNetflow(chain, tokenAddress), (d) => d.data?.[0]),
    settle(nansen.indicators(chain, tokenAddress), (d) => d),
  ]);

  const signals = spotSignals({ flow: flow.value, netflow: netflow.value, indicators: indicators.value, author: opts.author });
  const errors = [flow.error, netflow.error, indicators.error].filter((e): e is string => !!e);

  const panel: SpotPanel = {
    flow: flow.value,
    flowTimeframe: "1d",
    sincePost: null,
    netflow: netflow.value
      ? {
          h1: netflow.value.net_flow_1h_usd,
          h24: netflow.value.net_flow_24h_usd,
          d7: netflow.value.net_flow_7d_usd,
          d30: netflow.value.net_flow_30d_usd,
          symbol: netflow.value.token_symbol?.replace(/^\$/, "") ?? null,
        }
      : null,
    indicators: indicators.value
      ? [...(indicators.value.risk_indicators ?? []), ...(indicators.value.reward_indicators ?? [])].map((i) => ({
          type: i.indicator_type,
          score: i.score,
          percentile: i.signal_percentile,
        }))
      : null,
    marketCapUsd: indicators.value?.token_info?.market_cap_usd ?? null,
    topBuyers: null,
    topSellers: null,
    candles: null,
    postTimeIso: opts.postTimeIso ?? null,
    errors,
  };

  if (opts.mode === "panel") {
    const postTime = opts.postTimeIso ? new Date(opts.postTimeIso) : null;
    const ageMs = postTime ? Math.max(0, now.getTime() - postTime.getTime()) : 24 * 3_600_000;
    const from = new Date(now.getTime() - Math.max(ageMs, 3_600_000));
    const sinceTf = pickFlowTimeframe(ageMs);
    const chartFrom = new Date(Math.min(from.getTime(), now.getTime() - 6 * 3_600_000) - 3_600_000);
    const chartTf = now.getTime() - chartFrom.getTime() > 4 * 24 * 3_600_000 ? "4h" : "1h";

    const [buyers, sellers, candles, since] = await Promise.all([
      settle(nansen.whoBoughtSold(chain, tokenAddress, "BUY", isoNoMs(from), isoNoMs(now)), (d) => d.data),
      settle(nansen.whoBoughtSold(chain, tokenAddress, "SELL", isoNoMs(from), isoNoMs(now)), (d) => d.data),
      settle(nansen.ohlcv(chain, tokenAddress, chartTf, isoNoMs(chartFrom), isoNoMs(now)), (d) => d.data),
      postTime && sinceTf !== "1d"
        ? settle(nansen.flowIntel(chain, tokenAddress, sinceTf), (d) => d.data?.[0])
        : Promise.resolve(null),
    ]);
    panel.topBuyers = buyers.value;
    panel.topSellers = sellers.value;
    panel.candles = candles.value;
    if (postTime) panel.sincePost = { timeframe: sinceTf, flow: sinceTf === "1d" ? flow.value : (since?.value ?? null) };
    panel.errors.push(...[buyers.error, sellers.error, candles.error, since?.error].filter((e): e is string => !!e));
  }

  return { signals, panel };
}
