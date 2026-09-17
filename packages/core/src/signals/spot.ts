import { pct, usd } from "../format";
import type { FlowRow, IndicatorsResp, NetflowRow } from "../nansen-types";
import type { Signal } from "../types";

export type SpotSignalInput = {
  flow?: FlowRow | null;
  netflow?: NetflowRow | null;
  indicators?: IndicatorsResp | null;
  author?: { entity: string; valueUsd: number } | null;
};

const FLOW = "tgm/flow-intelligence";

/**
 * Nansen returns null net flow when a segment had no wallets in the window.
 * With wallet_count 0 that is a real zero; with a null count it is missing data.
 */
function seg(value: number | null, count: number | null): number | null {
  if (value !== null) return value;
  return count === 0 ? 0 : null;
}

export function spotSignals(input: SpotSignalInput): Signal[] {
  const out: Signal[] = [];
  const f = input.flow;

  // exit_pressure: labeled money (smart traders, whales, public figures) net flow
  if (f) {
    const st = seg(f.smart_trader_net_flow_usd, f.smart_trader_wallet_count) ?? 0;
    const wh = seg(f.whale_net_flow_usd, f.whale_wallet_count) ?? 0;
    const pf = seg(f.public_figure_net_flow_usd, f.public_figure_wallet_count) ?? 0;
    const fresh = seg(f.fresh_wallets_net_flow_usd, f.fresh_wallets_wallet_count);
    const labeled = st + wh + pf;
    out.push({
      id: "exit_pressure",
      kind: "spot",
      value: labeled,
      severity: labeled < 0 && (fresh ?? 0) > 0 ? "high" : labeled < 0 ? "warn" : "info",
      label:
        labeled < 0
          ? `Smart money, whales & public figures net ${usd(labeled, true)}`
          : `Labeled wallets net ${usd(labeled, true)}`,
      evidence: [
        { endpoint: FLOW, field: "smart_trader_net_flow_usd", value: usd(st, true) },
        { endpoint: FLOW, field: "whale_net_flow_usd", value: usd(wh, true) },
        { endpoint: FLOW, field: "public_figure_net_flow_usd", value: usd(pf, true) },
      ],
    });

    // fresh_buy_share: fresh wallets' share of all positive inflow
    const positives = [st, wh, pf, seg(f.top_pnl_net_flow_usd, f.top_pnl_wallet_count) ?? 0].filter((v) => v > 0);
    const freshPos = fresh !== null && fresh > 0 ? fresh : 0;
    const totalPos = positives.reduce((a, b) => a + b, 0) + freshPos;
    const share = fresh === null || totalPos === 0 ? null : (freshPos / totalPos) * 100;
    out.push({
      id: "fresh_buy_share",
      kind: "spot",
      value: share,
      severity: share !== null && share > 70 ? "warn" : "info",
      label: share === null ? "Fresh wallet share unavailable for this window" : `Fresh wallets are ${pct(share)} of buying`,
      evidence: fresh === null ? [] : [{ endpoint: FLOW, field: "fresh_wallets_net_flow_usd", value: usd(fresh, true) }],
    });
  } else {
    out.push(unavailable("exit_pressure", "Flow data unavailable"), unavailable("fresh_buy_share", "Flow data unavailable"));
  }

  // sm_netflow_24h
  const nf = input.netflow?.net_flow_24h_usd ?? null;
  out.push({
    id: "sm_netflow_24h",
    kind: "spot",
    value: nf,
    severity: nf !== null && nf < 0 ? "warn" : "info",
    label: nf === null ? "Smart Money netflow unavailable" : `Smart Money 24h netflow ${usd(nf, true)}`,
    evidence: nf === null ? [] : [{ endpoint: "smart-money/netflow", field: "net_flow_24h_usd", value: usd(nf, true) }],
  });

  // risk_high_count
  if (input.indicators) {
    const highs = input.indicators.risk_indicators.filter((i) => i.score === "high");
    out.push({
      id: "risk_high_count",
      kind: "spot",
      value: highs.length,
      severity: highs.length >= 2 ? "high" : highs.length === 1 ? "warn" : "info",
      label: highs.length ? `High risk: ${highs.map((h) => h.indicator_type.replace(/-/g, " ")).join(", ")}` : "No high risk indicators",
      evidence: highs.map((h) => ({ endpoint: "tgm/indicators", field: h.indicator_type, value: `high (p${h.signal_percentile ?? "?"})` })),
    });
  } else {
    out.push(unavailable("risk_high_count", "Risk indicators unavailable"));
  }

  if (input.author) {
    out.push({
      id: "author_holds_token",
      kind: "spot",
      value: input.author.valueUsd,
      severity: "info",
      label: input.author.valueUsd > 0 ? `${input.author.entity} holds ${usd(input.author.valueUsd)}` : `${input.author.entity} holds none`,
      evidence: [{ endpoint: "profiler/address/current-balance", field: "value_usd", value: usd(input.author.valueUsd) }],
    });
  }
  return out;
}

function unavailable(id: Signal["id"], label: string): Signal {
  return { id, kind: "spot", value: null, severity: "info", label, evidence: [] };
}
