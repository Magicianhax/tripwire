import type { Candle, FlowRow } from "@tripwire/core";
import type { SpotPanel } from "../api-types";
import { shortAddr, usd } from "./format";
import { SegmentRow } from "./panel-parts";

function Sparkline({ candles, postTimeIso }: { candles: Candle[] | null; postTimeIso: string | null }) {
  if (!candles || candles.length < 2) return null;
  const W = 328;
  const H = 48;
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = W / (candles.length - 1);
  const points = candles.map((c, i) => `${(i * stepX).toFixed(1)},${(H - ((c.close - min) / range) * H).toFixed(1)}`).join(" ");

  const first = candles[0];
  const last = candles[candles.length - 1];
  let markerX: number | null = null;
  if (postTimeIso && first && last) {
    const postTime = new Date(postTimeIso).getTime();
    const firstTime = new Date(first.interval_start).getTime();
    const lastTime = new Date(last.interval_start).getTime();
    if (!Number.isNaN(postTime) && lastTime > firstTime && postTime >= firstTime && postTime <= lastTime) {
      markerX = ((postTime - firstTime) / (lastTime - firstTime)) * W;
    }
  }

  return (
    <section className="tw-section" aria-label="Price since post">
      <svg className="tw-sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price since post">
        <polyline points={points} fill="none" stroke="#EDEDED" strokeWidth={1.5} />
        {markerX !== null ? <line x1={markerX} x2={markerX} y1={0} y2={H} stroke="#FFD400" strokeWidth={1.5} /> : null}
      </svg>
    </section>
  );
}

export function SpotBody({ panel }: { panel: SpotPanel }) {
  const flow: FlowRow | null = panel.sincePost?.flow ?? panel.flow;
  const maxAbs =
    flow === null
      ? 1
      : Math.max(
          1,
          Math.abs(flow.smart_trader_net_flow_usd ?? 0),
          Math.abs(flow.whale_net_flow_usd ?? 0),
          Math.abs(flow.public_figure_net_flow_usd ?? 0),
          Math.abs(flow.top_pnl_net_flow_usd ?? 0),
          Math.abs(flow.fresh_wallets_net_flow_usd ?? 0),
        );
  const risk = (panel.indicators ?? []).filter((i) => /high|medium/i.test(i.score));
  const topSellers = (panel.topSellers ?? []).slice(0, 5);
  const topBuyers = (panel.topBuyers ?? []).slice(0, 5);

  return (
    <>
      {flow ? (
        <section className="tw-section" aria-label="Flow by wallet type">
          <h3 className="tw-section-title">Flow by wallet type</h3>
          <SegmentRow label="Smart Traders" value={flow.smart_trader_net_flow_usd} max={maxAbs} />
          <SegmentRow label="Whales" value={flow.whale_net_flow_usd} max={maxAbs} />
          <SegmentRow label="Public Figures" value={flow.public_figure_net_flow_usd} max={maxAbs} />
          <SegmentRow label="Top PnL" value={flow.top_pnl_net_flow_usd} max={maxAbs} />
          <SegmentRow label="Fresh wallets" value={flow.fresh_wallets_net_flow_usd} max={maxAbs} />
        </section>
      ) : null}

      {topSellers.length > 0 || topBuyers.length > 0 ? (
        <section className="tw-section" aria-label="Top sellers and buyers">
          {topSellers.length > 0 ? (
            <div className="tw-who-list">
              <h3 className="tw-section-title">Top sellers</h3>
              <ul>
                {topSellers.map((w, i) => (
                  <li key={i}>
                    <span>{w.address_label ?? shortAddr(w.address)}</span>
                    <span className="tw-mono tw-neg">{usd(w.sold_volume_usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {topBuyers.length > 0 ? (
            <div className="tw-who-list">
              <h3 className="tw-section-title">Top buyers</h3>
              <ul>
                {topBuyers.map((w, i) => (
                  <li key={i}>
                    <span>{w.address_label ?? shortAddr(w.address)}</span>
                    <span className="tw-mono">{usd(w.bought_volume_usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {panel.netflow ? (
        <section className="tw-section" aria-label="Smart Money netflow">
          <h3 className="tw-section-title">Smart Money netflow</h3>
          <div className="tw-netflow-row">
            <div>
              <span className="tw-seg-label">1h</span>
              <span className={`tw-mono${(panel.netflow.h1 ?? 0) < 0 ? " tw-neg" : ""}`}>{usd(panel.netflow.h1, true)}</span>
            </div>
            <div>
              <span className="tw-seg-label">24h</span>
              <span className={`tw-mono${(panel.netflow.h24 ?? 0) < 0 ? " tw-neg" : ""}`}>{usd(panel.netflow.h24, true)}</span>
            </div>
            <div>
              <span className="tw-seg-label">7d</span>
              <span className={`tw-mono${(panel.netflow.d7 ?? 0) < 0 ? " tw-neg" : ""}`}>{usd(panel.netflow.d7, true)}</span>
            </div>
            <div>
              <span className="tw-seg-label">30d</span>
              <span className={`tw-mono${(panel.netflow.d30 ?? 0) < 0 ? " tw-neg" : ""}`}>{usd(panel.netflow.d30, true)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {risk.length > 0 ? (
        <section className="tw-section" aria-label="Risk">
          <h3 className="tw-section-title">Risk</h3>
          <ul className="tw-risk-list">
            {risk.map((r, i) => (
              <li key={i}>
                <span>{r.type}</span>
                <span className="tw-mono">{r.score}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Sparkline candles={panel.candles} postTimeIso={panel.postTimeIso} />
    </>
  );
}
