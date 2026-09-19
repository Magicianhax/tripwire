import {
  depthCostLabel,
  NETFLOW_TILE_TIMEFRAME,
  VERDICT_TIMEFRAME,
  VIEW_TIMEFRAMES,
  type DepthSection,
  type FlowRow,
  type Signal,
  type ViewTimeframe,
} from "@tripwire/core";
import type { HitDto, SpotPanel } from "../api-types";
import { Brain, Fish, LogOut, Megaphone, PieChart, Sprout, Trophy } from "lucide-react";
import { rowLimit, useCardSize } from "./card-size";
import { usd } from "./format";
import { Icon } from "./icons";
import { Empty, HitList, Section, SegmentRow, signOf } from "./panel-parts";
import { EMPTY_DEPTH, type DepthState } from "./PerpBody";
import { PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { SectionProblem, Skeleton as LoadingBlock } from "./Skeleton";
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
  return <LoadingBlock shape={tall ? "chart" : "row"} rows={rows} />;
}

/** Which lazy section each spot tab needs. Only Holders costs anything, and it exists only in
 * the expanded card, where there is room for it. */
export const SPOT_TAB_SECTIONS: Record<string, DepthSection[]> = { flow: [], wallets: [], risk: [], holders: ["spotHolders"] };

/** Labeled money's net USD flow in whatever window is on screen: the three segments the
 * `labeled_exit_pct` rule is measured from, summed. */
function labeledNet(flow: FlowRow | null): number | null {
  if (!flow) return null;
  const parts = [flow.smart_trader_net_flow_usd, flow.whale_net_flow_usd, flow.public_figure_net_flow_usd];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce((sum: number, p) => sum + (p ?? 0), 0);
}

function FlowTab({ panel, hits, signals, timeframe }: { panel: SpotPanel; hits: HitDto[]; signals: Signal[]; timeframe?: TimeframeState }) {
  const size = useCardSize();
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
    <div className="tw-spot-flow-layout">
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
        <div className="tw-spot-flow-gauges">
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
        </div>
      ) : null}

      <div className="tw-spot-flow-chart">
        <Section title="Price" aside={panel.token?.symbol ? `$${panel.token.symbol}` : null}>
          {loading ? (
            <Skeleton rows={1} tall />
          ) : (
            // The chart is the one thing that gains most from the expanded card: same series,
            // more than twice the height to read it in.
            <div className="tw-chart-box" data-size={size}>
              <PriceChart candles={chart?.candles} postTimeIso={panel.postTimeIso} timeframe={view} symbol={panel.token?.symbol} />
            </div>
          )}
          {!loading && !(chart?.candles && chart.candles.length > 1) ? <Empty>No price history came back for this window.</Empty> : null}
        </Section>
      </div>

      {netflow ? (
        <div className="tw-spot-flow-netflow">
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
        </div>
      ) : null}
    </div>
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
  // The backend asks for 20 of each either way; compact shows the five that matter, expanded
  // shows the list. Same data, more of it.
  const limit = rowLimit(useCardSize(), 5, 20);
  const sellers = (panel.topSellers ?? []).slice(0, limit);
  const buyers = (panel.topBuyers ?? []).slice(0, limit);
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


/**
 * Who actually holds the token. The one paid thing on a spot card (5 credits), so it lives in
 * its own tab, that tab only exists in the expanded view, and the price is printed on it.
 */
function HoldersTab({ panel, depth }: { panel: SpotPanel; depth: DepthState }) {
  const size = useCardSize();
  const holders = depth.data?.spotHolders;
  const loading = depth.loading.includes("spotHolders");
  const failure = depth.failed.spotHolders;
  const symbol = panel.token?.symbol ?? "the token";

  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) {
    return (
      <Section title="Top holders">
        <LoadingBlock shape="table" rows={rowLimit(size, 8, 16)} label="Loading holders" />
      </Section>
    );
  }
  if (!holders) return <Empty>Open this tab to load who holds {symbol}.</Empty>;
  const rows = (holders.holders ?? []).slice(0, rowLimit(size, 10, 20));
  if (rows.length === 0) return <Empty>Nansen returned no holder list for this token.</Empty>;

  return (
    <>
      {holders.top10SharePct !== null ? (
        <Section title="Concentration">
          <p className="tw-note">
            The top ten wallets hold <b className="tw-fig">{holders.top10SharePct.toFixed(2)}%</b> of {symbol}.
          </p>
        </Section>
      ) : null}
      <Section title="Top holders" aside={`${rows.length} of ${(holders.holders ?? []).length}`}>
        <table className="tw-table">
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col" className="tw-num">
                Holding
              </th>
              <th scope="col" className="tw-num">
                Value
              </th>
              <th scope="col" className="tw-num">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={`${h.address}-${i}`}>
                <th scope="row">
                  <WalletLabel label={h.label} address={h.address ?? ""} />
                </th>
                <td className="tw-fig tw-num">{h.tokenAmount === null ? "—" : h.tokenAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                <td className="tw-fig tw-num" data-sign={signOf(h.valueUsd)}>
                  {usd(h.valueUsd)}
                </td>
                <td className="tw-fig tw-num">{h.sharePct === null ? "—" : `${h.sharePct.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <SectionProblem reasons={holders.errors} />
    </>
  );
}

export function spotTabs(
  panel: SpotPanel,
  hits: HitDto[],
  signals: Signal[] = [],
  timeframe?: TimeframeState,
  depth: DepthState = EMPTY_DEPTH,
  expanded = false,
): TabDef[] {
  const tabs: TabDef[] = [
    { id: "flow", label: "Flow", content: <FlowTab panel={panel} hits={hits} signals={signals} timeframe={timeframe} /> },
    { id: "wallets", label: "Wallets", content: <WalletsTab panel={panel} /> },
    { id: "risk", label: "Risk", content: <RiskTab panel={panel} hits={hits} /> },
  ];
  // Holder concentration is worth 5 credits only when there is room to read it, so the tab
  // exists in the expanded card and nowhere else.
  if (expanded) {
    tabs.push({
      id: "holders",
      label: "Holders",
      icon: <Icon icon={PieChart} size={14} />,
      cost: depthCostLabel(SPOT_TAB_SECTIONS.holders!),
      content: <HoldersTab panel={panel} depth={depth} />,
    });
  }
  return tabs;
}

export function SpotBody({
  panel,
  hits = [],
  signals = [],
  initialTab,
  timeframe,
  depth = EMPTY_DEPTH,
  onNeedSections,
}: {
  panel: SpotPanel;
  hits?: HitDto[];
  signals?: Signal[];
  initialTab?: string;
  timeframe?: TimeframeState;
  depth?: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
  const expanded = useCardSize() === "expanded";
  return (
    <Tabs
      label="Evidence"
      tabs={spotTabs(panel, hits, signals, timeframe, depth, expanded)}
      initial={initialTab}
      onSelect={(id) => {
        const sections = SPOT_TAB_SECTIONS[id];
        if (sections && sections.length > 0) onNeedSections?.(sections);
      }}
    />
  );
}
