import type { Candle, FlowRow, Signal } from "@tripwire/core";
import type { HitDto, SpotPanel } from "../api-types";
import { Brain, Fish, LogOut, Megaphone, Sprout, Trophy } from "lucide-react";
import { usd } from "./format";
import { Empty, HitList, Section, SegmentRow } from "./panel-parts";
import { postIndex } from "./scales";
import { Tabs, type TabDef } from "./Tabs";
import { WalletLabel } from "./WalletLabel";

const W = 400;
const H = 48;

/** Close price over the window, mint when it rose and red when it fell, with the post's
 * candle marked by a dashed rule and its label set right under it. */
function PriceTrace({ candles, postTimeIso }: { candles: Candle[] | null; postTimeIso: string | null }) {
  if (!candles || candles.length < 2) return null;
  const sorted = [...candles].sort((a, b) => new Date(a.interval_start).getTime() - new Date(b.interval_start).getTime());
  const closes = sorted.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = W / (sorted.length - 1);
  const pad = 4;
  const y = (close: number) => pad + (H - 2 * pad) * (1 - (close - min) / range);
  const points = sorted.map((c, i) => `${(i * stepX).toFixed(1)},${y(c.close).toFixed(1)}`).join(" ");
  const index = postIndex(sorted, postTimeIso);
  const markerPct = index === null ? null : (index / (sorted.length - 1)) * 100;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const change = first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : null;

  return (
    <Section title="Price" aside={change !== null ? <span className="tw-fig" data-sign={change >= 0 ? "pos" : "neg"}>{`${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`}</span> : null}>
      <div className="tw-trace" data-marked={markerPct !== null ? "" : undefined} data-trend={change !== null && change < 0 ? "down" : "up"}>
        <svg className="tw-sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={markerPct !== null ? "Price over the window, post time marked" : "Price over the window"}>
          <line className="tw-spark-base" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} vectorEffect="non-scaling-stroke" />
          <polyline className="tw-spark-line" points={points} vectorEffect="non-scaling-stroke" />
          {index !== null ? <line className="tw-spark-post" x1={index * stepX} x2={index * stepX} y1={0} y2={H} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {markerPct !== null ? (
          <span className="tw-trace-label" style={{ left: `${markerPct}%` }} data-edge={markerPct > 85 ? "end" : markerPct < 15 ? "start" : undefined}>
            Post
          </span>
        ) : null}
      </div>
    </Section>
  );
}

function FlowTab({ panel, hits, signals }: { panel: SpotPanel; hits: HitDto[]; signals: Signal[] }) {
  const flow: FlowRow | null = panel.sincePost?.flow ?? panel.flow;
  const flowWindow = panel.sincePost ? "since post" : panel.flowTimeframe;
  const netflow = panel.netflow;
  if (!flow && !netflow && !(panel.candles && panel.candles.length > 1)) return <Empty>No flow data came back for this token.</Empty>;

  const hit = (id: HitDto["signalId"]) => hits.find((h) => h.signalId === id);
  const exitHit = hit("exit_pressure");
  const freshHit = hit("fresh_buy_share");
  const netflowHit = hit("sm_netflow_24h");
  const exit = signals.find((s) => s.id === "exit_pressure" && s.value !== null) ?? null;
  const exitThreshold = exitHit && typeof exitHit.threshold === "number" ? exitHit.threshold : null;
  // Rows that fed a fired rule light up: selling labeled wallets for exit pressure, fresh
  // wallets for the fresh-buy share.
  const lamp = (h: HitDto | undefined): "warning" | "caution" | null => (h ? (h.action === "block" ? "warning" : "caution") : null);
  const exitLit = (v: number | null) => (v !== null && v < 0 ? lamp(exitHit) : null);

  const rows = flow
    ? [
        { label: "Smart Traders", icon: Brain, value: flow.smart_trader_net_flow_usd, lit: exitLit(flow.smart_trader_net_flow_usd) },
        { label: "Whales", icon: Fish, value: flow.whale_net_flow_usd, lit: exitLit(flow.whale_net_flow_usd) },
        { label: "Public Figures", icon: Megaphone, value: flow.public_figure_net_flow_usd, lit: exitLit(flow.public_figure_net_flow_usd) },
        { label: "Top PnL", icon: Trophy, value: flow.top_pnl_net_flow_usd, lit: null },
        { label: "Fresh wallets", icon: Sprout, value: flow.fresh_wallets_net_flow_usd, lit: lamp(freshHit) },
      ]
    : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)), Math.abs(exit?.value ?? 0), Math.abs(exitThreshold ?? 0));

  return (
    <>
      {flow ? (
        <Section title="Net flow by wallet type" aside={`${flowWindow}, log scale`}>
          <div className="tw-gauges">
            {exit ? <SegmentRow label="Exit pressure" icon={LogOut} value={exit.value} max={max} lit={lamp(exitHit)} rule threshold={exitThreshold} /> : null}
            {rows.map((r) => (
              <SegmentRow key={r.label} label={r.label} icon={r.icon} value={r.value} max={max} lit={r.lit} />
            ))}
          </div>
        </Section>
      ) : null}
      <PriceTrace candles={panel.candles} postTimeIso={panel.postTimeIso} />
      {netflow ? (
        <Section title="Smart Money netflow">
          <dl className="tw-readouts">
            {(
              [
                ["1h", netflow.h1, null],
                ["24h", netflow.h24, lamp(netflowHit)],
                ["7d", netflow.d7, null],
                ["30d", netflow.d30, null],
              ] as const
            ).map(([label, value, lit]) => (
              <div key={label} data-lit={lit ?? undefined}>
                <dt>{label}</dt>
                <dd className="tw-fig" data-sign={value === null || value === 0 ? "zero" : value < 0 ? "neg" : "pos"}>
                  {usd(value, true)}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </>
  );
}

function WalletList({ rows, side }: { rows: { name: string | null; address: string; amount: number | null }[]; side: "sell" | "buy" }) {
  const max = Math.max(1, ...rows.map((r) => r.amount ?? 0));
  return (
    <ul className="tw-rows tw-wallet-rows" data-side={side}>
      {rows.map((r, i) => (
        <li key={i}>
          <WalletLabel label={r.name} address={r.address} />
          <span className="tw-row-bar" aria-hidden="true">
            <i style={{ width: `${((r.amount ?? 0) / max) * 100}%` }} />
          </span>
          <span className="tw-fig tw-row-amount">{usd(r.amount)}</span>
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
          <WalletList side="sell" rows={sellers.map((w) => ({ name: w.address_label, address: w.address, amount: w.sold_volume_usd }))} />
        </Section>
      ) : null}
      {buyers.length > 0 ? (
        <Section title="Top buyers" aside="Bought">
          <WalletList side="buy" rows={buyers.map((w) => ({ name: w.address_label, address: w.address, amount: w.bought_volume_usd }))} />
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

export function spotTabs(panel: SpotPanel, hits: HitDto[], signals: Signal[] = []): TabDef[] {
  return [
    { id: "flow", label: "Flow", content: <FlowTab panel={panel} hits={hits} signals={signals} /> },
    { id: "wallets", label: "Wallets", content: <WalletsTab panel={panel} /> },
    { id: "risk", label: "Risk", content: <RiskTab panel={panel} hits={hits} /> },
  ];
}

export function SpotBody({ panel, hits = [], signals = [], initialTab }: { panel: SpotPanel; hits?: HitDto[]; signals?: Signal[]; initialTab?: string }) {
  return <Tabs label="Evidence" tabs={spotTabs(panel, hits, signals)} initial={initialTab} />;
}
