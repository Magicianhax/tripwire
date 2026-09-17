import type { Candle, FlowRow } from "@tripwire/core";
import type { HitDto, SpotPanel } from "../api-types";
import { shortAddr, usd } from "./format";
import { Empty, HitList, Section, SegmentRow } from "./panel-parts";
import { Tabs, type TabDef } from "./Tabs";

const W = 400;
const H = 72;

/** Close price over the window, with the post's time marked as an advisory (cyan) rule. */
function Sparkline({ candles, postTimeIso }: { candles: Candle[] | null; postTimeIso: string | null }) {
  if (!candles || candles.length < 2) return null;
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = W / (candles.length - 1);
  const pad = 6;
  const y = (close: number) => pad + (H - 2 * pad) * (1 - (close - min) / range);
  const points = candles.map((c, i) => `${(i * stepX).toFixed(1)},${y(c.close).toFixed(1)}`).join(" ");

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
  const change = first && last && first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : null;

  return (
    <Section title="Price" aside={change !== null ? <span className={`tw-mono${change < 0 ? " tw-neg" : ""}`}>{`${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`}</span> : null}>
      <svg className="tw-sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={markerX !== null ? "Price over the window, post time marked" : "Price over the window"}>
        <line className="tw-spark-base" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} vectorEffect="non-scaling-stroke" />
        {markerX !== null ? <line className="tw-spark-post" x1={markerX} x2={markerX} y1={0} y2={H} vectorEffect="non-scaling-stroke" /> : null}
        <polyline className="tw-spark-line" points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      {markerX !== null ? (
        <p className="tw-legend">
          <i className="tw-key tw-key-post" aria-hidden="true" />
          Post
        </p>
      ) : null}
    </Section>
  );
}

function flowMax(flow: FlowRow): number {
  return Math.max(
    1,
    Math.abs(flow.smart_trader_net_flow_usd ?? 0),
    Math.abs(flow.whale_net_flow_usd ?? 0),
    Math.abs(flow.public_figure_net_flow_usd ?? 0),
    Math.abs(flow.top_pnl_net_flow_usd ?? 0),
    Math.abs(flow.fresh_wallets_net_flow_usd ?? 0),
  );
}

function FlowTab({ panel }: { panel: SpotPanel }) {
  const flow: FlowRow | null = panel.sincePost?.flow ?? panel.flow;
  const flowWindow = panel.sincePost ? "since post" : panel.flowTimeframe;
  const netflow = panel.netflow;
  if (!flow && !netflow && !(panel.candles && panel.candles.length > 1)) return <Empty>No flow data came back for this token.</Empty>;
  return (
    <>
      {flow ? (
        <Section title="Net flow by wallet type" aside={<span className="tw-mono">{flowWindow}</span>}>
          <div className="tw-gauges">
            <SegmentRow label="Smart Traders" value={flow.smart_trader_net_flow_usd} max={flowMax(flow)} />
            <SegmentRow label="Whales" value={flow.whale_net_flow_usd} max={flowMax(flow)} />
            <SegmentRow label="Public Figures" value={flow.public_figure_net_flow_usd} max={flowMax(flow)} />
            <SegmentRow label="Top PnL" value={flow.top_pnl_net_flow_usd} max={flowMax(flow)} />
            <SegmentRow label="Fresh wallets" value={flow.fresh_wallets_net_flow_usd} max={flowMax(flow)} />
          </div>
          <p className="tw-legend">
            <span>Selling</span>
            <span>0</span>
            <span>Buying</span>
          </p>
        </Section>
      ) : null}
      <Sparkline candles={panel.candles} postTimeIso={panel.postTimeIso} />
      {netflow ? (
        <Section title="Smart Money netflow">
          <dl className="tw-readouts">
            {(
              [
                ["1h", netflow.h1],
                ["24h", netflow.h24],
                ["7d", netflow.d7],
                ["30d", netflow.d30],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={`tw-mono${(value ?? 0) < 0 ? " tw-neg" : ""}`}>{usd(value, true)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </>
  );
}

function WalletList({ rows }: { rows: { name: string | null; address: string; amount: number | null; sold?: boolean }[] }) {
  return (
    <ul className="tw-rows">
      {rows.map((r, i) => (
        <li key={i}>
          {r.name ? <span className="tw-row-name">{r.name}</span> : <span className="tw-row-name tw-mono tw-meta">{shortAddr(r.address)}</span>}
          <span className={`tw-mono${r.sold ? " tw-neg" : ""}`}>{usd(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function WalletsTab({ panel }: { panel: SpotPanel }) {
  const sellers = (panel.topSellers ?? []).slice(0, 5);
  const buyers = (panel.topBuyers ?? []).slice(0, 5);
  if (sellers.length === 0 && buyers.length === 0) return <Empty>No top buyers or sellers came back for this window.</Empty>;
  return (
    <>
      {sellers.length > 0 ? (
        <Section title="Top sellers" aside="Sold">
          <WalletList rows={sellers.map((w) => ({ name: w.address_label, address: w.address, amount: w.sold_volume_usd, sold: true }))} />
        </Section>
      ) : null}
      {buyers.length > 0 ? (
        <Section title="Top buyers" aside="Bought">
          <WalletList rows={buyers.map((w) => ({ name: w.address_label, address: w.address, amount: w.bought_volume_usd }))} />
        </Section>
      ) : null}
    </>
  );
}

function RiskTab({ panel, hits }: { panel: SpotPanel; hits: HitDto[] }) {
  const risk = (panel.indicators ?? []).filter((i) => /high|medium/i.test(i.score));
  return (
    <>
      <Section title="Rules that fired">{hits.length > 0 ? <HitList hits={hits} /> : <Empty>None of your rules fired.</Empty>}</Section>
      <Section title="Risk indicators">
        {risk.length > 0 ? (
          <ul className="tw-rows">
            {risk.map((r, i) => (
              <li key={i}>
                <span className="tw-row-name">{r.type}</span>
                <span className="tw-score" data-level={/high/i.test(r.score) ? "high" : "medium"}>
                  {r.score}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No medium or high risk indicators.</Empty>
        )}
      </Section>
    </>
  );
}

export function spotTabs(panel: SpotPanel, hits: HitDto[]): TabDef[] {
  return [
    { id: "flow", label: "Flow", content: <FlowTab panel={panel} /> },
    { id: "wallets", label: "Wallets", content: <WalletsTab panel={panel} /> },
    { id: "risk", label: "Risk", content: <RiskTab panel={panel} hits={hits} /> },
  ];
}

export function SpotBody({ panel, hits = [], initialTab }: { panel: SpotPanel; hits?: HitDto[]; initialTab?: string }) {
  return <Tabs label="Evidence" tabs={spotTabs(panel, hits)} initial={initialTab} />;
}
