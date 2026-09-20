import { Fragment, useState, type ReactNode } from "react";
import {
  ageInDays,
  bothSidesKeys,
  depthCostLabel,
  DEPTH_SECTION_CREDITS,
  exchangeFlowCopy,
  flowWarningRow,
  NETFLOW_TILE_TIMEFRAME,
  priceReadout,
  scoreVocabulary,
  severityLevel,
  MIN_VOL24_USD,
  splitIsReadable,
  tapeDivider,
  tradedBothSides,
  VERDICT_TIMEFRAME,
  VIEW_TIMEFRAMES,
  type DepthSection,
  type FlowRow,
  type FlowWarningRow,
  type Signal,
  type ViewTimeframe,
} from "@tripwire/core";
import type { HitDto, SpotMarketSection, SpotPanel, SpotTapeRow } from "../api-types";
import { ArrowLeftRight, Brain, Coins, Fish, Landmark, ListOrdered, LogOut, Megaphone, PieChart, Sprout, Trophy } from "lucide-react";
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

/**
 * Which lazy section each spot tab needs.
 *
 * `risk` costs nothing: the Dexscreener market structure behind it is a public request, and its
 * tab therefore carries no price label. The three that do cost something — Tape at 1, Holders and
 * Winners at 5 each — exist only in the expanded card, where there is both room to read them and
 * a deliberate press behind getting there.
 */
export const SPOT_TAB_SECTIONS: Record<string, DepthSection[]> = {
  flow: [],
  wallets: [],
  risk: ["spotMarket"],
  tape: ["spotTape"],
  holders: ["spotHolders"],
  winners: ["spotWinners"],
};

/**
 * A section somebody has to ask for by name, with its price on the button.
 *
 * The ruling from the wallet card's lazy views (Round 1.5) applies here too: a credit is spent by
 * a press, never by a view becoming visible and never by a keypress that moves a selection.
 */
function PricedSectionButton({
  label,
  section,
  depth,
  onNeedSections,
}: {
  label: string;
  section: DepthSection;
  depth: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
  const pending = depth.loading.includes(section);
  const credits = DEPTH_SECTION_CREDITS[section];
  return (
    <button type="button" className="tw-premium-button" onClick={() => onNeedSections?.([section])} disabled={pending || !onNeedSections}>
      <Icon icon={Coins} size={14} />
      {pending ? "Asking Nansen…" : `${label} (${credits} ${credits === 1 ? "credit" : "credits"})`}
    </button>
  );
}

/** A signed percentage that keeps its sign at any size, for the change columns. */
const changePct = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) < 1 && value !== 0 ? 2 : 1)}%` : "—";

/** A token quantity, compact, and never a bare zero for an absent figure. */
const amount = (n: number | null | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }) : "—";

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

/**
 * The transfers behind the exchange line (Round 2.1), bought by a press that states its price.
 *
 * A transfer is a transfer. The list names both wallets, the amount and the value, and says
 * nothing about why: a deposit to an exchange is custody moving, not a sale, and ordering by
 * value over a day on a large token returns routine rebalancing every single day.
 */
function TransfersBlock({ depth, onNeedSections }: { depth: DepthState; onNeedSections?: (sections: DepthSection[]) => void }) {
  const section = depth.data?.spotTransfers;
  const failure = depth.failed.spotTransfers;
  const loading = depth.loading.includes("spotTransfers");
  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) return <LoadingBlock shape="row" rows={3} label="Loading transfers" />;
  if (!section) {
    return (
      <div className="tw-flow-transfers">
        <PricedSectionButton label="Show the largest transfers" section="spotTransfers" depth={depth} onNeedSections={onNeedSections} />
      </div>
    );
  }
  if (!section.transfers) {
    return (
      <p className="tw-note">Nansen returned no transfers for this token in the last {section.windowHours} hours.</p>
    );
  }
  return (
    <div className="tw-flow-transfers">
      <ul className="tw-rows tw-transfer-rows">
        {section.transfers.slice(0, 5).map((t, i) => (
          <li key={`${t.txHash ?? i}`}>
            <span className="tw-transfer-pair">
              <WalletLabel label={t.fromLabel} address={t.fromAddress ?? ""} />
              <Icon icon={ArrowLeftRight} size={12} />
              <WalletLabel label={t.toLabel} address={t.toAddress ?? ""} />
            </span>
            <span className="tw-fig tw-row-amount">
              {usd(t.valueUsd)}
              <span className="tw-row-amount-other">{amount(t.amount)} tokens</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="tw-meta">
        The {Math.min(5, section.transfers.length)} largest transfers of the last {section.windowHours} hours, by value. A transfer is a movement between
        wallets: it is not a trade and says nothing about intent.
      </p>
      <SectionProblem reasons={section.errors} />
    </div>
  );
}

function FlowTab({
  panel,
  hits,
  signals,
  timeframe,
  depth,
  onNeedSections,
}: {
  panel: SpotPanel;
  hits: HitDto[];
  signals: Signal[];
  timeframe?: TimeframeState;
  depth: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
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
                {/* The exchange line says money moved; this says which wallets moved it (2.1). */}
                <TransfersBlock depth={depth} onNeedSections={onNeedSections} />
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

/**
 * Market structure from Dexscreener (Round 1.6.1): pair age, short-window price change and the
 * buy/sell trade counts, none of which Nansen's token record carries.
 *
 * Every figure names its source and its scope, because two of them have a Nansen counterpart a
 * few lines above and the two will disagree: liquidity here is **one pool's**, the deepest, while
 * Nansen's is the token's; the counts are summed across pools and say so. Pair age is captioned
 * as the pair's, never the token's — a migrated pool reads newer than the contract it trades.
 *
 * Nothing here feeds a signal, and boosts, socials and websites never reach this component: they
 * are bought or team-submitted, and are not in the backend's schema at all.
 *
 * Three different states, three different sentences (C-1). `structure === null` means the answer
 * could not be read — nothing is known, so the section says so and names the source; it never
 * reads as a negative finding about a token that may trade in thirty pools. `poolCount === 0`
 * means Dexscreener answered "none", which is a finding. And a partly unreadable answer prints
 * its figures with the count of pools that were dropped, so no number claims a sample it missed.
 */
function MarketStructure({ section }: { section: SpotMarketSection | undefined }) {
  if (!section) return null;
  if (section.errors.length > 0) return <SectionProblem reasons={section.errors} />;
  const s = section.structure;
  if (!s) {
    return (
      <Section title="Market structure" aside="Dexscreener">
        <Empty>Dexscreener's answer couldn't be read, so market structure is unchecked. This says nothing about the token's pools.</Empty>
      </Section>
    );
  }
  if (s.poolCount === 0) {
    return (
      <Section title="Market structure" aside="Dexscreener">
        <Empty>
          {s.droppedPoolCount > 0
            ? `Dexscreener lists no readable pools for this token on this chain; ${s.droppedPoolCount} entr${s.droppedPoolCount === 1 ? "y" : "ies"} couldn't be read.`
            : "Dexscreener lists no pools for this token on this chain."}
        </Empty>
      </Section>
    );
  }
  const windows = [
    { key: "m5" as const, label: "5m" },
    { key: "h1" as const, label: "1h" },
    { key: "h6" as const, label: "6h" },
  ];
  const pool = s.pool;
  return (
    <Section title="Market structure" aside="Dexscreener">
      <div className="tw-market-readouts">
        <Readouts
          items={[
            { label: "Pair age", value: tokenAge(pool?.createdAtIso) },
            { label: "Deepest pool", value: usd(pool?.liquidityUsd ?? null) },
            { label: "Venue", value: pool?.dexId ?? "—" },
            { label: "Pools", value: count(s.poolCount) },
          ]}
        />
      </div>
      <table className="tw-table tw-structure-table">
        <thead>
          <tr>
            <th scope="col">Window</th>
            <th scope="col" className="tw-num">
              Price
            </th>
            <th scope="col" className="tw-num">
              Buys
            </th>
            <th scope="col" className="tw-num">
              Sells
            </th>
          </tr>
        </thead>
        <tbody>
          {windows.map(({ key, label }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td className="tw-fig tw-num" data-sign={signOf(s.priceChangePct[key])}>
                {changePct(s.priceChangePct[key])}
              </td>
              <td className="tw-fig tw-num">{count(s.txns[key].buys)}</td>
              <td className="tw-fig tw-num">{count(s.txns[key].sells)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tw-meta">
        Price change is the deepest pool's, {pool?.quoteSymbol ? `quoted in ${pool.quoteSymbol}` : "at its own quote"}; the trade counts are summed across all{" "}
        <b className="tw-fig">{count(s.poolCount)}</b> pools. Pair age is how long that pool has existed, not how long the token has: a migrated pool reads
        newer than its contract.
        {s.droppedPoolCount > 0 ? (
          <>
            {" "}
            <b className="tw-fig">{count(s.droppedPoolCount)}</b> more {s.droppedPoolCount === 1 ? "entry was" : "entries were"} unreadable and {s.droppedPoolCount === 1 ? "is" : "are"}{" "}
            in none of these figures.
          </>
        ) : null}
      </p>
    </Section>
  );
}

function RiskTab({ panel, hits, depth }: { panel: SpotPanel; hits: HitDto[]; depth: DepthState }) {
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
                // Named for its source: Dexscreener reports the deepest pool's liquidity a few
                // lines below, and the two will not agree (1.6.1).
                { label: "Liquidity (Nansen)", value: usd(token!.liquidityUsd) },
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
      <MarketStructure section={depth.data?.spotMarket} />
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


/** One trade, newest first: when, who, which way, and for how much. */
function TapeRows({ rows, dividerIndex, postTimeIso }: { rows: SpotTapeRow[]; dividerIndex: number | null; postTimeIso: string | null }) {
  return (
    <ul className="tw-rows tw-tape-rows">
      {rows.map((t, i) => (
        <Fragment key={`${t.txHash ?? i}`}>
          {i === dividerIndex ? (
            <li className="tw-tape-divider" aria-label="Everything above this line happened after the post">
              <span>
                post, <time dateTime={postTimeIso ?? undefined}>{postTimeIso ? timeAgo(postTimeIso) : ""}</time>
              </span>
            </li>
          ) : null}
          <li>
            <span className="tw-tape-when tw-meta">
              <time className="tw-fig" dateTime={t.timestampIso}>
                {timeAgo(t.timestampIso)}
              </time>
            </span>
            <span className="tw-tape-who">
              <WalletLabel label={t.label} address={t.address ?? ""} />
            </span>
            <span className="tw-tape-side" data-side={t.action ?? "unknown"}>
              {t.action === "buy" ? "Bought" : t.action === "sell" ? "Sold" : "—"}
            </span>
            <span className="tw-fig tw-row-amount">
              {usd(t.valueUsd)}
              <span className="tw-row-amount-other">
                {amount(t.tokenAmount)}
                {t.counterSymbol ? ` for ${t.counterSymbol}` : ""}
              </span>
            </span>
          </li>
        </Fragment>
      ))}
    </ul>
  );
}

/**
 * Open Jupiter DCA vaults: pending demand no trade or flow window can see (Round 2.1).
 *
 * Solana only, hard — `tgm/jup-dca` has no chain parameter — so the button does not exist on an
 * EVM token rather than existing and failing. An empty answer is the normal case and is reported
 * as an empty answer: the press was paid for, so hiding the section afterwards would be the
 * dishonest version of "hide when empty".
 */
function DcaBlock({ panel, depth, onNeedSections }: { panel: SpotPanel; depth: DepthState; onNeedSections?: (sections: DepthSection[]) => void }) {
  if ((panel.chain ?? "").toLowerCase() !== "solana") return null;
  const section = depth.data?.spotDca;
  const failure = depth.failed.spotDca;
  const loading = depth.loading.includes("spotDca");
  return (
    <Section title="Scheduled buying" aside="Jupiter DCA">
      {failure ? <SectionProblem reasons={[failure]} /> : null}
      {loading ? <LoadingBlock shape="row" rows={2} label="Loading Jupiter DCA vaults" /> : null}
      {!failure && !loading && !section ? (
        <>
          <PricedSectionButton label="Check open DCA vaults" section="spotDca" depth={depth} onNeedSections={onNeedSections} />
          <p className="tw-meta">Jupiter's recurring orders are demand nobody has spent yet. Solana only, and the trailing window is 14 days.</p>
        </>
      ) : null}
      {section && section.vaults && section.vaults.length === 0 ? (
        <p className="tw-note">Nansen returned no open Jupiter DCA vaults for this token. That is the usual answer, not a failure.</p>
      ) : null}
      {section && section.vaults && section.vaults.length > 0 ? (
        <>
          <p className="tw-note">
            <b className="tw-fig">{count(section.vaults.length)}</b> open DCA {section.vaults.length === 1 ? "vault" : "vaults"} in the trailing 14 days.
          </p>
          <ul className="tw-rows tw-dca-rows">
            {section.vaults.slice(0, 6).map((v, i) => (
              <li key={`${v.address ?? i}`}>
                <WalletLabel label={v.label} address={v.address ?? ""} chain="solana" />
                <span className="tw-fig tw-row-amount">
                  {amount(v.remainingAmount ?? (v.depositAmount !== null && v.depositSpent !== null ? v.depositAmount - v.depositSpent : null))}
                  <span className="tw-row-amount-other">left of {amount(v.depositAmount)}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* Token amounts, not dollars: Nansen sends no price for a pending order and deriving
              one would state a figure it never gave. */}
          <p className="tw-meta">Figures are token amounts as Nansen reports them, not a dollar value of pending demand.</p>
        </>
      ) : null}
      <SectionProblem reasons={section?.errors ?? []} />
    </Section>
  );
}

/**
 * The trade tape (Round 2.1): the Wallets tab answers "who", and this answers "in what order".
 *
 * Expanded card only. The compact card is 440px and already carries a scrolling tab strip; a
 * forty-row tape with a time, a wallet and two figures per line is not readable in it, and the
 * aggregate answer to "who bought since the post" is already one tab away.
 *
 * The divider is the part that could lie. The page is "the most recent N trades", not "every
 * trade since the post" — measured, 100 trades on a liquid token covered fourteen minutes — so it
 * is drawn only when the post time genuinely falls inside the fetched span, and the section says
 * which case it is in.
 */
function TapeTab({
  panel,
  depth,
  onNeedSections,
}: {
  panel: SpotPanel;
  depth: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
  const size = useCardSize();
  const section = depth.data?.spotTape;
  const loading = depth.loading.includes("spotTape");
  const failure = depth.failed.spotTape;
  const symbol = panel.token?.symbol ?? "this token";

  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) {
    return (
      <Section title="Trade tape">
        <LoadingBlock shape="table" rows={rowLimit(size, 8, 14)} label="Loading trades" />
      </Section>
    );
  }
  if (!section) return <Empty>Open this tab to load the most recent trades in {symbol}.</Empty>;
  const rows = (section.trades ?? []).slice(0, rowLimit(size, 10, 24));
  if (rows.length === 0) {
    return (
      <div className="tw-detail">
        <Section title="Trade tape">
          <Empty>Nansen returned no labelled or above-floor trades in this window.</Empty>
          <p className="tw-meta">
            {count(section.fetched)} trades came back; none carried a Nansen label or reached {usd(section.minUsd)}.
          </p>
        </Section>
        <DcaBlock panel={panel} depth={depth} onNeedSections={onNeedSections} />
      </div>
    );
  }

  const divider = tapeDivider(rows, panel.postTimeIso);
  const spanMinutes =
    section.spanFromIso && section.spanToIso ? Math.max(1, Math.round((Date.parse(section.spanToIso) - Date.parse(section.spanFromIso)) / 60_000)) : null;

  return (
    <div className="tw-detail">
      <Section title="Trade tape" aside={spanMinutes === null ? null : `${count(section.kept)} of ${count(section.fetched)} · ${spanMinutes}m`}>
        <TapeRows rows={rows} dividerIndex={divider.kind === "inside" ? divider.index : null} postTimeIso={panel.postTimeIso} />
        {divider.kind === "older-than-window" ? (
          <p className="tw-note">
            Every trade here is newer than the post. This page is the most recent trades Nansen returned, not the whole run since the post, so there is no
            line to draw.
          </p>
        ) : null}
        {divider.kind === "newer-than-window" ? <p className="tw-note">Every trade here happened before the post.</p> : null}
        <p className="tw-meta">
          Newest first. Every labelled wallet's trade is shown whatever its size; unlabelled trades are shown from {usd(section.minUsd)} up. The label is
          the evidence, not the count: one large buy can be a single wallet splitting a route.
          {section.isLastPage === false ? " Nansen said this page was not the whole window." : ""}
        </p>
        <SectionProblem reasons={section.errors} />
      </Section>
      <DcaBlock panel={panel} depth={depth} onNeedSections={onNeedSections} />
    </div>
  );
}

/**
 * The winners, and whether they have already sold (Round 2.1). Five credits, expanded only, and
 * the price is printed on the tab.
 *
 * The headline is weighted by peak position value, because ten wallets that bought once and never
 * sold carry a ratio of exactly 1.0 and would otherwise decide the sentence for the money.
 */
function WinnersTab({ panel, depth }: { panel: SpotPanel; depth: DepthState }) {
  const size = useCardSize();
  const section = depth.data?.spotWinners;
  const loading = depth.loading.includes("spotWinners");
  const failure = depth.failed.spotWinners;
  const pagination = usePagination(section?.winners ?? [], 6);
  const symbol = panel.token?.symbol ?? "this token";

  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) {
    return (
      <Section title="Top traders by realized PnL">
        <LoadingBlock shape="table" rows={rowLimit(size, 8, 16)} label="Loading the leaderboard" />
      </Section>
    );
  }
  if (!section) return <Empty>Open this tab to load who made money on {symbol}.</Empty>;
  if (!section.winners) return <Empty>Nansen returned no trader leaderboard for this token.</Empty>;
  const held = section.stillHolding;

  return (
    <div className="tw-detail tw-detail-columns">
      <div>
        <Section title="Have they sold?">
          {held ? (
            <>
              <p className="tw-note">
                Of the <b className="tw-fig">{usd(held.weightUsd)}</b> these {count(held.counted)} wallets held at their largest,{" "}
                <b className="tw-fig">{held.pct.toFixed(1)}%</b> is still held.
              </p>
              <p className="tw-meta">Weighted by each wallet's peak position, so a crowd of small never-sold wallets does not decide the figure.</p>
            </>
          ) : (
            <Empty>Nansen sent no holding ratios for this sample, so there is nothing to weigh.</Empty>
          )}
        </Section>
      </div>
      <Section title="Top traders by realized PnL" aside={`${section.winners.length} wallets${section.isLastPage === false ? ", page 1" : ""}`}>
        <table className="tw-table">
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col" className="tw-num">
                Realized
              </th>
              <th scope="col" className="tw-num">
                ROI
              </th>
              <th scope="col" className="tw-num">
                Still held
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((w, i) => (
              <tr key={`${w.address}-${i}`}>
                <th scope="row">
                  <WalletLabel label={w.label} address={w.address ?? ""} chain={panel.chain} />
                </th>
                <td className="tw-fig tw-num" data-sign={signOf(w.realizedPnlUsd)}>
                  {usd(w.realizedPnlUsd)}
                </td>
                <td className="tw-fig tw-num" data-sign={signOf(w.roiPct)}>
                  {signedPct(w.roiPct, 1)}
                </td>
                <td className="tw-fig tw-num">{w.stillHoldingRatio === null ? "—" : `${Math.round(w.stillHoldingRatio * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination.controls}
        <p className="tw-meta">
          Realized PnL over the last 30 days, ordered by it. "Still held" is the share of the wallet's largest-ever position it has not sold.
        </p>
        <SectionProblem reasons={section.errors} />
      </Section>
    </div>
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
          {/* Both lines below are measurements of the returned page, stated rather than assumed:
              `total_outflow` and `balance_change_24h` were already paid for on every row. */}
          {typeof holders.neverSentOutCount === "number" && holders.neverSentOutCount > 0 ? (
            <p className="tw-meta">
              <b className="tw-fig">{count(holders.neverSentOutCount)}</b> of the {count(rows.length > 0 ? (holders.holders ?? []).length : 0)} returned
              wallets have never sent a token out.
            </p>
          ) : null}
          {holders.allChange24hZero === true ? (
            <p className="tw-meta">Every returned wallet reports a 24h balance change of exactly zero, so the 7d and 30d columns carry the movement.</p>
          ) : null}
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
              {/* Two more columns only where there is room for them: this table is already four
                  wide, and the expanded card is the one with a thousand pixels (2.1). */}
              {size === "expanded" ? (
                <>
                  <th scope="col" className="tw-num">
                    7d
                  </th>
                  <th scope="col" className="tw-num">
                    30d
                  </th>
                </>
              ) : null}
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
                {size === "expanded" ? (
                  <>
                    <td className="tw-fig tw-num" data-sign={signOf(h.change7dPct)}>
                      {changePct(h.change7dPct)}
                    </td>
                    <td className="tw-fig tw-num" data-sign={signOf(h.change30dPct)}>
                      {changePct(h.change30dPct)}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {pagination.controls}
        {size === "expanded" ? (
          <p className="tw-meta">
            The 7d and 30d columns are each wallet's balance change over that window, as a percent of what it holds now. Nansen reports them as raw token
            amounts.
          </p>
        ) : null}
        {(holders.warnings ?? []).map((w) => (
          <p key={w} className="tw-meta tw-seg-warning">
            {w}
          </p>
        ))}
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
  /** How a priced button inside a tab asks for its own section (transfers, Jupiter DCA). */
  onNeedSections?: (sections: DepthSection[]) => void,
): TabDef[] {
  const tabs: TabDef[] = [
    { id: "flow", label: "Flow", content: <FlowTab panel={panel} hits={hits} signals={signals} timeframe={timeframe} depth={depth} onNeedSections={onNeedSections} /> },
    { id: "wallets", label: "Wallets", content: <WalletsTab panel={panel} /> },
    { id: "risk", label: "Risk", content: <RiskTab panel={panel} hits={hits} depth={depth} /> },
  ];
  // The three tabs below need room as much as they need a press: the anchored card is 440px with
  // a tab strip that already scrolls, and a tape, a holder table and a leaderboard are all wide.
  // Holder concentration and the winners are 5 credits each, which is the other half of the same
  // ruling — both print their price on the tab.
  if (expanded) {
    // Beside Wallets, before Risk: "who" and "in what order" are the same question twice.
    tabs.splice(2, 0, {
      id: "tape",
      label: "Tape",
      icon: <Icon icon={ListOrdered} size={14} />,
      cost: depthCostLabel(SPOT_TAB_SECTIONS.tape!),
      content: <TapeTab panel={panel} depth={depth} onNeedSections={onNeedSections} />,
    });
    tabs.push({
      id: "holders",
      label: "Holders",
      icon: <Icon icon={PieChart} size={14} />,
      cost: depthCostLabel(SPOT_TAB_SECTIONS.holders!),
      content: <HoldersTab panel={panel} depth={depth} />,
    });
    tabs.push({
      id: "winners",
      label: "Winners",
      icon: <Icon icon={Trophy} size={14} />,
      cost: depthCostLabel(SPOT_TAB_SECTIONS.winners!),
      content: <WinnersTab panel={panel} depth={depth} />,
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
  const tabs = spotTabs(panel, hits, signals, timeframe, depth, expanded, onNeedSections);
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
