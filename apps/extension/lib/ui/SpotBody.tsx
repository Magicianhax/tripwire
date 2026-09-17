import { NETFLOW_TILE_TIMEFRAME, VERDICT_TIMEFRAME, VIEW_TIMEFRAMES, type FlowRow, type Signal, type ViewTimeframe } from "@tripwire/core";
import type { HitDto, SpotPanel } from "../api-types";
import { Brain, Fish, LogOut, Megaphone, Sprout, Trophy } from "lucide-react";
import { usd } from "./format";
import { Empty, HitList, Section, SegmentRow } from "./panel-parts";
import { PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { Tabs, type TabDef } from "./Tabs";
import { WalletLabel } from "./WalletLabel";

const TIMEFRAME_OPTIONS = VIEW_TIMEFRAMES.map((value) => ({ value, label: value }));

const NETFLOW_TILES = [
  { key: "h1", label: "1h" },
  { key: "h24", label: "24h" },
  { key: "d7", label: "7d" },
  { key: "d30", label: "30d" },
] as const;

export type TimeframeState = {
  value: ViewTimeframe;
  onChange: (next: ViewTimeframe) => void;
  /** The window being fetched, while its data is still in flight. */
  pending: ViewTimeframe | null;
};

/** A section still waiting for the window the user just picked. Keeps the card's height instead
 * of collapsing it, so nothing below jumps while the data arrives. */
function Skeleton({ rows = 3, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="tw-skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="tw-skeleton-row" data-tall={tall ? "" : undefined} />
      ))}
    </div>
  );
}

/** Labeled money's net USD flow in whatever window is on screen: the three segments the
 * `labeled_exit_pct` rule is measured from, summed. */
function labeledNet(flow: FlowRow | null): number | null {
  if (!flow) return null;
  const parts = [flow.smart_trader_net_flow_usd, flow.whale_net_flow_usd, flow.public_figure_net_flow_usd];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce((sum: number, p) => sum + (p ?? 0), 0);
}

function FlowTab({ panel, hits, signals, timeframe }: { panel: SpotPanel; hits: HitDto[]; signals: Signal[]; timeframe?: TimeframeState }) {
  const view = timeframe?.value ?? panel.viewTimeframe ?? VERDICT_TIMEFRAME;
  const loading = timeframe?.pending != null;
  const flow: FlowRow | null = panel.viewFlow ?? panel.flow;
  const netflow = panel.netflow;
  const chart = panel.chart;
  const hasAnything = flow || netflow || (chart?.candles && chart.candles.length > 1);

  const hit = (id: HitDto["signalId"]) => hits.find((h) => h.signalId === id);
  const exitHit = hit("labeled_exit_pct") ?? hit("distribution_pct");
  const netflowHit = hit("sm_netflow_pct");
  const lamp = (h: HitDto | undefined): "warning" | "caution" | null => (h ? (h.action === "block" ? "warning" : "caution") : null);
  const exitLit = (v: number | null) => (v !== null && v < 0 ? lamp(exitHit) : null);

  const labeled = labeledNet(flow);
  // The rule's threshold is a share of 24h volume, so it only has a place on this USD scale
  // while the window on screen is the one the rule was measured on.
  const vol24 = panel.token?.volume24hUsd ?? null;
  const onVerdictWindow = view === VERDICT_TIMEFRAME;
  const thresholdUsd =
    onVerdictWindow && exitHit && typeof exitHit.threshold === "number" && vol24 !== null ? (exitHit.threshold / 100) * vol24 : null;

  const rows = flow
    ? [
        { label: "Smart Traders", icon: Brain, value: flow.smart_trader_net_flow_usd, lit: exitLit(flow.smart_trader_net_flow_usd) },
        { label: "Whales", icon: Fish, value: flow.whale_net_flow_usd, lit: exitLit(flow.whale_net_flow_usd) },
        { label: "Public Figures", icon: Megaphone, value: flow.public_figure_net_flow_usd, lit: exitLit(flow.public_figure_net_flow_usd) },
        { label: "Top PnL", icon: Trophy, value: flow.top_pnl_net_flow_usd, lit: null },
        { label: "Fresh wallets", icon: Sprout, value: flow.fresh_wallets_net_flow_usd, lit: null },
      ]
    : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)), Math.abs(labeled ?? 0), Math.abs(thresholdUsd ?? 0));

  const absorption = panel.absorption ?? null;
  const exitSignal = signals.find((s) => s.id === "labeled_exit_pct");

  return (
    <>
      {timeframe ? (
      <div className="tw-window">
        <Segmented options={TIMEFRAME_OPTIONS} value={view} onChange={timeframe.onChange} label="Flow and price window" />
        <p className="tw-window-note">
          {onVerdictWindow ? (
            <>
              Verdict uses <b className="tw-fig">{VERDICT_TIMEFRAME}</b>
            </>
          ) : (
            <>
              Verdict uses <b className="tw-fig">{VERDICT_TIMEFRAME}</b> · viewing <b className="tw-fig">{view}</b>
            </>
          )}
        </p>
      </div>
      ) : null}

      {!hasAnything && !loading ? <Empty>No flow data came back for this token.</Empty> : null}

      {flow || loading ? (
        <Section title="Net flow by wallet type" aside={`${view}, log scale`}>
          {loading ? (
            <Skeleton rows={6} />
          ) : (
            <>
              <div className="tw-gauges">
                <SegmentRow label="Labeled wallets" icon={LogOut} value={labeled} max={max} lit={lamp(exitHit)} rule threshold={thresholdUsd} />
                {rows.map((r) => (
                  <SegmentRow key={r.label} label={r.label} icon={r.icon} value={r.value} max={max} lit={r.lit} />
                ))}
              </div>
              {onVerdictWindow && absorption !== null ? (
                <p className="tw-note">
                  Fresh wallets bought <b className="tw-fig">{absorption.toFixed(1)}x</b> what labeled wallets sold.
                </p>
              ) : null}
              {onVerdictWindow && absorption === null && exitSignal?.value === 0 ? <p className="tw-note">{exitSignal.label}</p> : null}
            </>
          )}
        </Section>
      ) : null}

      <Section title="Price" aside={panel.token?.symbol ? `$${panel.token.symbol}` : null}>
        {loading ? <Skeleton rows={1} tall /> : <PriceChart candles={chart?.candles} postTimeIso={panel.postTimeIso} timeframe={view} symbol={panel.token?.symbol} />}
        {!loading && !(chart?.candles && chart.candles.length > 1) ? <Empty>No price history came back for this window.</Empty> : null}
      </Section>

      {netflow ? (
        <Section title="Smart Money netflow" aside={netflow.traders ? `${netflow.traders} traders` : null}>
          <dl className="tw-readouts">
            {NETFLOW_TILES.map(({ key, label }) => {
              const value = netflow[key];
              const target = NETFLOW_TILE_TIMEFRAME[key];
              const selected = target === view && (key !== "d30" || view === "7d");
              return (
                <div key={key} data-lit={key === "h24" ? (lamp(netflowHit) ?? undefined) : undefined}>
                  <dt>
                    <button
                      type="button"
                      className="tw-tile-button"
                      aria-pressed={selected}
                      title={key === "d30" ? "Flows go back 7 days at most" : `Show the ${target} window`}
                      onClick={() => timeframe?.onChange(target)}
                    >
                      {label}
                      {key === "d30" ? <span className="tw-sr-only"> (flows go back 7 days at most)</span> : null}
                    </button>
                  </dt>
                  <dd className="tw-fig" data-sign={value === null || value === 0 ? "zero" : value < 0 ? "neg" : "pos"}>
                    {usd(value, true)}
                  </dd>
                </div>
              );
            })}
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
  const token = panel.token;
  return (
    <>
      <Section title="Rules that fired">{hits.length > 0 ? <HitList hits={hits} /> : <Empty>None of your rules fired.</Empty>}</Section>
      {token && (token.marketCapUsd !== null || token.volume24hUsd !== null || token.liquidityUsd !== null) ? (
        <Section title="Market">
          <dl className="tw-readouts">
            <div>
              <dt>Market cap</dt>
              <dd className="tw-fig">{usd(token.marketCapUsd)}</dd>
            </div>
            <div>
              <dt>24h volume</dt>
              <dd className="tw-fig">{usd(token.volume24hUsd)}</dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd className="tw-fig">{usd(token.liquidityUsd)}</dd>
            </div>
          </dl>
        </Section>
      ) : null}
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

export function spotTabs(panel: SpotPanel, hits: HitDto[], signals: Signal[] = [], timeframe?: TimeframeState): TabDef[] {
  return [
    { id: "flow", label: "Flow", content: <FlowTab panel={panel} hits={hits} signals={signals} timeframe={timeframe} /> },
    { id: "wallets", label: "Wallets", content: <WalletsTab panel={panel} /> },
    { id: "risk", label: "Risk", content: <RiskTab panel={panel} hits={hits} /> },
  ];
}

export function SpotBody({
  panel,
  hits = [],
  signals = [],
  initialTab,
  timeframe,
}: {
  panel: SpotPanel;
  hits?: HitDto[];
  signals?: Signal[];
  initialTab?: string;
  timeframe?: TimeframeState;
}) {
  return <Tabs label="Evidence" tabs={spotTabs(panel, hits, signals, timeframe)} initial={initialTab} />;
}
