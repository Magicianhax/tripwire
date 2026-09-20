import { Fragment, useState, type ReactNode } from "react";
import {
  ageInDays,
  bothSidesKeys,
  depthCostLabel,
  exchangeFlowCopy,
  flowWarningRow,
  NETFLOW_TILE_TIMEFRAME,
  priceReadout,
  scoreVocabulary,
  severityLevel,
  MIN_VOL24_USD,
  splitIsReadable,
  tradedBothSides,
  VERDICT_TIMEFRAME,
  VIEW_TIMEFRAMES,
  type DepthSection,
  type FlowRow,
  type FlowWarningRow,
  type Signal,
  type ViewTimeframe,
} from "@tripwire/core";
import type { HitDto, SpotPanel } from "../api-types";
import { Brain, Fish, Landmark, LogOut, Megaphone, PieChart, Sprout, Trophy } from "lucide-react";
import { rowLimit, useCardSize } from "./card-size";
import { timeAgo, usd } from "./format";
import { Icon } from "./icons";
import { Empty, HitList, Readouts, Section, SegmentRow, signOf } from "./panel-parts";
import { EMPTY_DEPTH, signedPct, type DepthState } from "./PerpBody";
import { formatPrice, PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { SectionProblem, Skeleton as LoadingBlock } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";
import { WalletLabel } from "./WalletLabel";
import { AllocationChart, usePagination } from "./DataCharts";

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

/** A whole count ("86,022 holders"), or a dash. Never rounded to "86K": the point of the figure
 * is that it is exact at the moment of the snapshot. */
const count = (n: number | null | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";

/** A token supply: billions of units, so compact, and never a bare "0" for an absent figure. */
const supply = (n: number | null | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }) : "—";

/**
 * A low–high pair written at one precision, so the two ends line up: `$0.9800–$1.0200`, never
 * `$0.9800–$1.02`, which reads as two different kinds of number. The smaller end sets the
 * precision because it is the one that needs the digits.
 */
function priceRange(low: number, high: number): string {
  const digits = (formatPrice(low).split(".")[1] ?? "").length;
  if (digits === 0) return `${formatPrice(low)}–${formatPrice(high)}`;
  const fixed = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return `${fixed(low)}–${fixed(high)}`;
}

/** How old the contract is, from its deployment date. Days while that is still readable, then
 * years — "671d" tells a reader less than "1.8y". */
function tokenAge(iso: string | null | undefined): string {
  const days = ageInDays(iso);
  if (days === null) return "—";
  return days < 365 ? `${days}d` : `${(days / 365).toFixed(1)}y`;
}

/**
 * The price of the token the user is about to buy, stated on the card face (1.1.1).
 *
 * Deliberately outside `PriceChart`, which returns null below two points: a one-candle window
 * still has a price, and hovering a chart is not how anyone should learn what a token costs.
 */
function PriceReadout({ panel, view }: { panel: SpotPanel; view: ViewTimeframe }) {
  const { priceUsd, changePct, lowUsd, highUsd } = priceReadout(panel.chart?.candles, panel.token?.priceUsd ?? null);
  const hasRange = lowUsd !== null && highUsd !== null;
  return (
    <div className="tw-price-readout">
      <p className="tw-price-now">
        {/* formatPrice keeps significant digits, so a memecoin reads $0.00000212, not $0.00. */}
        <span className="tw-price-value tw-fig">{priceUsd === null ? "—" : formatPrice(priceUsd)}</span>
        <span className="tw-price-change tw-fig" data-sign={signOf(changePct)}>
          {signedPct(changePct, 2)}
          <span className="tw-sr-only"> over {view}</span>
        </span>
      </p>
      <p className="tw-price-range tw-meta">
        <span className="tw-fig">{hasRange ? priceRange(lowUsd, highUsd) : "—"}</span>{" "}
        <span>{view} low to high</span>
      </p>
    </div>
  );
}

/**
 * Exchange net flow, on its own line and never in the segment stack (1.1.6).
 *
 * Its polarity is the opposite of the five cohorts — negative means tokens *left* exchanges —
 * and it can never carry a wallet count, so putting it in the stack next to rows that do would
 * invert its meaning and invent a population.
 */
function ExchangeFlowLine({ valueUsd }: { valueUsd: number | null }) {
  const copy = exchangeFlowCopy(valueUsd);
  if (copy.direction === "unknown" || copy.direction === "flat") {
    return (
      <p className="tw-exchange-flow" data-direction={copy.direction}>
        <Icon icon={Landmark} size={14} />
        <span>{copy.text}</span>
      </p>
    );
  }
  return (
    <p className="tw-exchange-flow" data-direction={copy.direction}>
      <Icon icon={Landmark} size={14} />
      <span>
        <b className="tw-fig">{usd(Math.abs(valueUsd!))}</b> {copy.text}
      </span>
    </p>
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
        { key: "smart_trader" as const, label: "Smart Traders", icon: Brain, value: flow.smart_trader_net_flow_usd, lit: exitLit(flow.smart_trader_net_flow_usd) },
        { key: "whale" as const, label: "Whales", icon: Fish, value: flow.whale_net_flow_usd, lit: exitLit(flow.whale_net_flow_usd) },
        { key: "public_figure" as const, label: "Public Figures", icon: Megaphone, value: flow.public_figure_net_flow_usd, lit: exitLit(flow.public_figure_net_flow_usd) },
        { key: "top_pnl" as const, label: "Top PnL", icon: Trophy, value: flow.top_pnl_net_flow_usd, lit: null },
        { key: "fresh_wallets" as const, label: "Fresh wallets", icon: Sprout, value: flow.fresh_wallets_net_flow_usd, lit: null },
      ]
    : [];

  // Documented limitations, placed under the row each one is about (1.1.7). They are captions,
  // not failures: nothing here reaches SectionProblem or the "Unavailable:" list.
  const warnings = panel.warnings ?? [];
  const warningsFor = (row: FlowWarningRow | null) => warnings.filter((w) => flowWarningRow(w) === row);
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
                    <Fragment key={r.label}>
                      <SegmentRow label={r.label} icon={r.icon} value={r.value} max={max} lit={r.lit} />
                      {warningsFor(r.key).map((w) => (
                        <p key={w} className="tw-seg-warning tw-meta">
                          {w}
                        </p>
                      ))}
                    </Fragment>
                  ))}
                </div>
                {/* Its own line below the stack: opposite polarity, no wallet count (1.1.6). */}
                <ExchangeFlowLine valueUsd={flow?.exchange_net_flow_usd ?? null} />
                {warningsFor("exchange").map((w) => (
                  <p key={w} className="tw-seg-warning tw-meta">
                    {w}
                  </p>
                ))}
                {warningsFor(null).map((w) => (
                  <p key={w} className="tw-seg-warning tw-meta">
                    {w}
                  </p>
                ))}
                {onVerdictWindow && absorption !== null ? (
                  <p className="tw-note">
                    Fresh wallets bought <b className="tw-fig">{absorption.toFixed(1)}x</b> what labeled wallets sold.
                  </p>
                ) : null}
                {onVerdictWindow && absorption === null && exitSignal?.value === 0 ? <p className="tw-note">{exitSignal.label}</p> : null}
              </>
            )}
          </Section>
          <SplitSection token={panel.token ?? null} />
        </div>
      ) : null}

      <div className="tw-spot-flow-chart">
        <Section title="Price" aside={panel.token?.symbol ? `$${panel.token.symbol}` : null}>
          {/* The price is stated before the chart is drawn, and survives a window the chart
              refuses (under two points). */}
          {loading ? <Skeleton rows={1} /> : <PriceReadout panel={panel} view={view} />}
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

/**
 * The 24h buy/sell split (1.1.3): a readout, not a signal.
 *
 * `tgm/token-information` is requested with `timeframe: "1d"`, so this is always a day's
 * figures whatever window the rest of the tab is showing — hence the fixed "24h" label. Below
 * the volume floor the figures are a handful of bots that a reader would take for a crowd, so
 * the tiles print dashes and say why.
 */
function SplitSection({ token }: { token: SpotPanel["token"] }) {
  if (!token) return null;
  const readable = splitIsReadable(token.volume24hUsd);
  const has = [token.buyVolumeUsd, token.sellVolumeUsd, token.uniqueBuyers, token.uniqueSellers].some((v) => v !== null && v !== undefined);
  if (!has) return null;
  const figure = <T,>(value: T | null | undefined, render: (v: T) => string) => (readable && value !== null && value !== undefined ? render(value) : "—");
  return (
    <Section title="Buys and sells" aside="24h">
      <Readouts
        items={[
          { label: "Bought", value: figure(token.buyVolumeUsd, (v) => usd(v)), sign: readable ? "pos" : undefined },
          { label: "Sold", value: figure(token.sellVolumeUsd, (v) => usd(v)), sign: readable ? "neg" : undefined },
          { label: "Buyers", value: figure(token.uniqueBuyers, count) },
          { label: "Sellers", value: figure(token.uniqueSellers, count) },
        ]}
      />
      {readable ? (
        <p className="tw-note">
          <b className="tw-fig">{count(token.totalBuys)}</b> buys against <b className="tw-fig">{count(token.totalSells)}</b> sells in the last 24 hours.
        </p>
      ) : (
        <p className="tw-note">Below {usd(MIN_VOL24_USD)} of 24h volume these counts are a handful of wallets, so Tripwire does not print them.</p>
      )}
    </Section>
  );
}

function WalletList({
  rows,
  side,
}: {
  rows: { name: string | null; address: string; amount: number | null; otherAmount: number | null; bothSides: boolean }[];
  side: "sell" | "buy";
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount ?? 0));
  // The word for the *other* side, so the secondary figure names itself on every row.
  const otherWord = side === "buy" ? "sold" : "bought";
  return (
    <ul className="tw-rows tw-wallet-rows" data-side={side}>
      {rows.map((r, i) => (
        <li key={i}>
          <span className="tw-wallet-cell">
            <WalletLabel label={r.name} address={r.address} />
            {r.bothSides ? <span className="tw-tag tw-both-sides">both sides</span> : null}
          </span>
          <span className="tw-row-bar" aria-hidden="true">
            <i style={{ width: `${((r.amount ?? 0) / max) * 100}%` }} />
          </span>
          <span className="tw-fig tw-row-amount">
            {usd(r.amount)}
            {/* A reported zero is a measurement ("sold $0.00"); a missing figure is a dash.
                The two must never look the same. */}
            <span className="tw-row-amount-other">
              {otherWord} {usd(r.otherAmount)}
            </span>
          </span>
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
  // Every row already carries both of its own volumes; page overlap is a second source, because
  // the two top-20 cuts rank different wallets and frequently share none (1.1.4).
  const overlap = bothSidesKeys(panel.topBuyers, panel.topSellers);
  const note = (
    <p className="tw-note">
      <b>Both sides</b> marks a wallet that bought and sold inside this window. Wallets outside the two top-20 lists are not compared.
    </p>
  );
  return (
    <>
      {sellers.length > 0 ? (
        <Section title="Top sellers" aside="Sold">
          <WalletList
            side="sell"
            rows={sellers.map((w) => ({
              name: w.address_label,
              address: w.address,
              amount: w.sold_volume_usd,
              otherAmount: w.bought_volume_usd,
              bothSides: tradedBothSides(w, overlap),
            }))}
          />
        </Section>
      ) : null}
      {buyers.length > 0 ? (
        <Section title="Top buyers" aside="Bought">
          <WalletList
            side="buy"
            rows={buyers.map((w) => ({
              name: w.address_label,
              address: w.address,
              amount: w.bought_volume_usd,
              otherAmount: w.sold_volume_usd,
              bothSides: tradedBothSides(w, overlap),
            }))}
          />
        </Section>
      ) : null}
      {note}
    </>
  );
}

type IndicatorRow = NonNullable<SpotPanel["indicators"]>[number];

/**
 * One indicator: its name, what Nansen scored it, where that sits against comparable tokens,
 * and when it last fired.
 *
 * The percentile is a **peer ranking**, not a severity — 87th percentile means "higher than 87%
 * of comparable tokens", which on a `low` score is not a warning — so it is labelled as one. An
 * unknown last trigger prints "last fired unknown", never a date derived from the Unix epoch.
 */
function IndicatorList({ rows }: { rows: IndicatorRow[] }) {
  return (
    <ul className="tw-rows tw-indicator-rows">
      {rows.map((r, i) => {
        const level = severityLevel(r.score);
        const triggered = r.lastTriggerIso ?? null;
        return (
          <li key={`${r.type}-${i}`}>
            <span className="tw-indicator-cell">
              <span className="tw-row-name">{r.type}</span>
              <span className="tw-indicator-meta tw-meta">
                {r.percentile === null || r.percentile === undefined ? (
                  "rank against peers —"
                ) : (
                  <>
                    <b className="tw-fig">{Math.round(r.percentile)}th</b> percentile of comparable tokens
                  </>
                )}
                {triggered ? (
                  <>
                    {", last fired "}
                    <time className="tw-fig" dateTime={triggered}>
                      {timeAgo(triggered)}
                    </time>
                  </>
                ) : (
                  ", last fired unknown"
                )}
              </span>
            </span>
            <span className="tw-score" data-level={level ?? undefined} data-score={r.score.toLowerCase()}>
              {r.score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RiskTab({ panel, hits }: { panel: SpotPanel; hits: HitDto[] }) {
  const indicators = panel.indicators ?? [];
  // Split on the score's vocabulary, not on the array it arrived in: the live response puts a
  // `high`-scored risk row and a `low`-scored reward row on the same severity scale, and
  // `price-momentum` on a bearish/neutral/bullish one (1.1.8).
  const severity = indicators.filter((i) => scoreVocabulary(i.score) === "severity" && /high|med/i.test(i.score));
  const direction = indicators.filter((i) => scoreVocabulary(i.score) === "direction");
  const token = panel.token;
  const hasRecord =
    !!token &&
    [token.marketCapUsd, token.volume24hUsd, token.liquidityUsd, token.fdvUsd, token.totalHolders, token.deploymentDateIso, token.circulatingSupply].some(
      (v) => v !== null && v !== undefined,
    );
  return (
    <>
      <Section title="Rules that fired">{hits.length > 0 ? <HitList hits={hits} /> : <Empty>None of your rules fired.</Empty>}</Section>
      {hasRecord ? (
        <Section title="Market" aside="Nansen token record">
          <div className="tw-market-readouts">
            <Readouts
              items={[
                { label: "Market cap", value: usd(token!.marketCapUsd) },
                { label: "FDV", value: usd(token!.fdvUsd) },
                { label: "24h volume", value: usd(token!.volume24hUsd) },
                { label: "Liquidity", value: usd(token!.liquidityUsd) },
                { label: "Holders", value: count(token!.totalHolders) },
                { label: "Token age", value: tokenAge(token!.deploymentDateIso) },
                { label: "Circulating", value: supply(token!.circulatingSupply) },
                { label: "Total supply", value: supply(token!.totalSupply) },
              ]}
            />
          </div>
          {/* The whole block is one call on a 24h cache, so it has to say so: on a launch that
              is minutes old the holder count can be a day behind the chart above it. */}
          <p className="tw-note">Holders, supply and age are a daily snapshot and can be up to 24h old.</p>
        </Section>
      ) : null}
      <Section title="Risk indicators" aside={severity.length > 0 ? "medium and high" : null}>
        {severity.length > 0 ? <IndicatorList rows={severity} /> : <Empty>No medium or high risk indicators.</Empty>}
      </Section>
      {direction.length > 0 ? (
        <Section title="Directional signals" aside="bearish to bullish">
          <IndicatorList rows={direction} />
        </Section>
      ) : null}
    </>
  );
}


/**
 * Who actually holds the token. The one paid thing on a spot card (5 credits), so it lives in
 * its own tab, that tab only exists in the expanded view, and the price is printed on it.
 */
function HoldersTab({ panel, depth }: { panel: SpotPanel; depth: DepthState }) {
  const pagination = usePagination(depth.data?.spotHolders?.holders ?? [], 6);
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
  const rows = pagination.rows;
  if (rows.length === 0) return <Empty>Nansen returned no holder list for this token.</Empty>;

  return (
    <div className="tw-detail tw-detail-columns">
      <div>
      {holders.top10SharePct !== null ? (
        <Section title="Concentration">
          <p className="tw-note">
            The top ten wallets hold <b className="tw-fig">{holders.top10SharePct.toFixed(2)}%</b> of {symbol}.
          </p>
        </Section>
      ) : null}
      <Section title="Holder distribution" aside="Returned wallets">
        <AllocationChart label="Share of the returned holders' value" rows={(holders.holders ?? []).map((h,i)=>({label:h.label || `Holder ${i+1}`,value:h.valueUsd ?? 0}))} />
        <p className="tw-meta">Relative value within this holder list, not total token supply.</p>
      </Section>
      </div>
      <Section title="Top holders" aside={`${(holders.holders ?? []).length} wallets`}>
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
        {pagination.controls}
      </Section>
      <SectionProblem reasons={holders.errors} />
    </div>
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
  markets,
}: {
  panel: SpotPanel;
  hits?: HitDto[];
  signals?: Signal[];
  initialTab?: string;
  timeframe?: TimeframeState;
  depth?: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
  markets?: (active: boolean) => ReactNode;
}) {
  const expanded = useCardSize() === "expanded";
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabs = spotTabs(panel, hits, signals, timeframe, depth, expanded);
  if (markets) tabs.unshift({ id: "markets", label: "Markets", content: markets(activeTab === "markets") });
  return (
    <Tabs
      label="Evidence"
      tabs={tabs}
      initial={initialTab ?? "flow"}
      onSelect={(id) => {
        setActiveTab(id);
        const sections = SPOT_TAB_SECTIONS[id];
        if (sections && sections.length > 0) onNeedSections?.(sections);
      }}
    />
  );
}
