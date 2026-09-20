import {
  depthCostLabel,
  distanceToLiquidationPct,
  leverageLadder,
  liquidationBands,
  positionCohorts,
  positionLadderAside,
  recentOpens,
  smartMoneyLongShort,
  type DepthSection,
  type PerpPosition,
} from "@tripwire/core";
import { useState } from "react";
import { AlertTriangle, Coins, Layers, Scale, TrendingUp, Users } from "lucide-react";
import { perpLadder, perpWinRate } from "../api";
import type { DepthResponse, HitDto, PerpLadderResponse, PerpPanel, PerpWinRateResponse } from "../api-types";
import { rowLimit, useCardSize } from "./card-size";
import { timeAgo, usd } from "./format";
import { Icon } from "./icons";
import { Empty, HitList, price, Readouts, Section, signOf, Sources } from "./panel-parts";
import { PriceChart } from "./PriceChart";
import { SectionProblem, Skeleton } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";
import { FundingHistory, OpenInterestHistory, VenueTable } from "./VenueTable";
import { WalletLabel } from "./WalletLabel";
import { LiquidationChart } from "./LiquidationChart";
import { usePagination } from "./DataCharts";

/**
 * The perp card.
 *
 * Four tabs, each owning its own data: Positioning and Chart run on free public exchange APIs,
 * Liquidations runs on what the card already fetched, and Traders is the one that costs
 * something — so it says so on the tab and only fires when somebody opens it.
 */

/** What each tab needs from `POST /api/depth`. Positioning's two sections are separate calls so
 * a slow exchange never holds up Hyperliquid's own numbers. */
export const PERP_TAB_SECTIONS: Record<string, DepthSection[]> = {
  positioning: ["perpMarket", "perpVenues"],
  liquidations: [],
  traders: ["perpTraders"],
  chart: ["perpChart"],
};

export type DepthState = {
  data: DepthResponse | null;
  /** Sections currently in flight, so a tab can show its skeletons. */
  loading: DepthSection[];
  /** Sections whose request failed outright (as opposed to a section that answered with gaps). */
  failed: Record<string, string>;
};

export const EMPTY_DEPTH: DepthState = { data: null, loading: [], failed: {} };

const has = (state: DepthState, section: DepthSection) => state.loading.includes(section);

/** A percentage that always carries its sign, so a positive rate is never read as a negative
 * one at a glance. A true minus sign, matching every other figure in the card. */
export const signedPct = (value: number | null, digits: number): string =>
  value === null ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;

/** The window `hlFundingHistory` actually fetches. The chart used to sit under "Funding over the
 * same window" above a series that is always 48h whatever window the price chart is on; a web
 * test pins this constant to the backend's own default so the two cannot drift apart again. */
export const FUNDING_WINDOW_HOURS = 48;
const FUNDING_SECTION_TITLE = `Funding, last ${FUNDING_WINDOW_HOURS}h`;

/**
 * A button that buys something, with the price on it before it is pressed (Round 2.5).
 *
 * Every paid thing this card adds is a press. Not a hover — the trader leaderboard is twelve
 * rows in the expanded card, and a hover trigger would be twelve credits from one careless
 * mouse pass. Not a tab or a segment either: Round 1.5 established that a control reachable by
 * arrow key must not spend, because that is a credit per keypress.
 */
function PricedButton({
  label,
  credits,
  onClick,
  pending,
  pressed,
  priceOnly,
}: {
  label: string;
  credits: number;
  onClick: () => void;
  pending: boolean;
  pressed?: boolean;
  /** Inside a table cell the column header carries the noun, so the button carries only the
   *  price and its own accessible name. A three-line button in every row of a twelve-row table
   *  is the same width problem as a seventh column. */
  priceOnly?: boolean;
}) {
  const price = `${credits} ${credits === 1 ? "credit" : "credits"}`;
  return (
    <button
      type="button"
      className="tw-premium-button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={pressed}
      aria-label={priceOnly ? `${label}, ${price}` : undefined}
    >
      <Icon icon={Coins} size={14} />
      {pending ? "Asking…" : priceOnly ? price : `${label} (${price})`}
    </button>
  );
}

/**
 * Hyperliquid's open-interest cap, as a line and never as a block (Round 2.5).
 *
 * Three states, and only one of them says anything: `true` is the venue's own list naming this
 * coin, `false` is the list not naming it, and **null is the list not being readable** — which
 * is not the same as "not capped" and therefore prints nothing at all.
 */
function OpenInterestCapNotice({ atCap, coin }: { atCap: boolean | null | undefined; coin: string }) {
  if (atCap !== true) return null;
  return (
    <p className="tw-warnline" role="note">
      <Icon icon={AlertTriangle} size={14} />
      <span>
        Hyperliquid lists <b>{coin}</b> among the perps at their open-interest cap. While a market sits at its cap the venue stops accepting orders that
        would add to open interest; orders that reduce it still go through. This is the venue&rsquo;s own list, not a Tripwire verdict.
      </span>
    </p>
  );
}

/**
 * Where Hyperliquid's leverage ceiling steps down, in notional terms (Round 2.5).
 *
 * The margin table has always been inside the `metaAndAssetCtxs` response the card fetches. A
 * tier only means something at a stated position size and this card has no size input, so the
 * *thresholds* are what ship — they are true without one — and a flat one-tier table says
 * nothing the "Max leverage" tile did not already say, so it renders nothing.
 */
function LeverageLadderNote({ tiers }: { tiers: { lowerBoundUsd: number; maxLeverage: number }[] | null | undefined }) {
  const ladder = leverageLadder(tiers ?? null);
  if (!ladder) return null;
  return (
    <p className="tw-note tw-meta">
      Hyperliquid&rsquo;s ceiling steps down with position size: <b className="tw-fig">{ladder.topLeverage}x</b> up to{" "}
      {ladder.steps.map((step, i) => (
        <span key={step.fromUsd}>
          {i > 0 ? ", then " : ""}
          <b className="tw-fig">{usd(step.fromUsd)}</b>, then <b className="tw-fig">{step.maxLeverage}x</b>
        </span>
      ))}
      .
    </p>
  );
}

/** The two-colour split bar itself: mint for the long share, red for the short. It is only ever
 * rendered from a real total, so a 50/50 bar on screen means the market is actually 50/50. */
function SplitBar({ longPct, label }: { longPct: number; label: string }) {
  return (
    <div className="tw-longshort-bar" role="img" aria-label={label}>
      <i className="tw-longshort-long" style={{ width: `${longPct}%` }} />
      <i className="tw-longshort-short" style={{ width: `${100 - longPct}%` }} />
    </div>
  );
}

/** A wallet count Nansen did not send. `0 wallets` beside a real dollar figure is a claim. */
const wallets = (count: number | null) =>
  count === null ? null : (
    <>
      {" "}
      <span className="tw-fig">{count}</span> wallet{count === 1 ? "" : "s"}
    </>
  );

/**
 * Smart Money's long against short.
 *
 * Until Round 1.3.1 this coerced both sides with `?? 0` and fell back to `50`, so a screener row
 * with null position fields painted an even mint-and-red bar reading "Long $0 · 0 wallets /
 * Short $0 · 0 wallets" — on the same screen as the signal line saying "Smart Money positioning
 * unavailable". Unknown, nobody-positioned and evenly-split are three different answers now.
 */
function LongShortBar({ screener }: { screener: PerpPanel["screener"] }) {
  const split = smartMoneyLongShort(screener);
  if (split.state === "unknown") return <Empty>Nansen returned no Smart Money position figures for this market.</Empty>;
  if (split.state === "empty") return <Empty>No Smart Money is positioned in this market right now.</Empty>;
  return (
    <div className="tw-longshort">
      <SplitBar longPct={split.longPct} label={`Smart Money long ${split.longPct.toFixed(0)}%, short ${split.shortPct.toFixed(0)}%`} />
      <div className="tw-longshort-legend">
        <span data-side="long">
          Long <b className="tw-fig">{usd(split.longUsd)}</b>
          {wallets(split.longCount)}
        </span>
        <span data-side="short">
          Short <b className="tw-fig">{usd(split.shortUsd)}</b>
          {wallets(split.shortCount)}
        </span>
      </div>
    </div>
  );
}

/**
 * Smart traders, whales and public figures, one bar each (Round 1.3.3).
 *
 * Each bar is normalised to **its own** long-plus-short total: whale exposure runs about twenty
 * times the smart-trader figure on the recorded ETH row, and a shared scale would leave the one
 * cohort this product is named after as a sliver. The gross is labelled "Long + short" for the
 * same reason — Nansen's field is called `*_total_usd` and it is not net exposure.
 */
function CohortBars({ panel }: { panel: PerpPanel }) {
  const cohorts = positionCohorts(panel.cohorts);
  if (panel.mode === "chip") return <Empty>Cohort positioning loads with the full card.</Empty>;
  if (panel.cohortsError) return <SectionProblem reasons={[panel.cohortsError]} />;
  if (!panel.cohorts) return <Empty>Cohort positioning is Hyperliquid-only, and Nansen returned none for this market.</Empty>;
  return (
    <div className="tw-cohorts">
      {cohorts.map((c) => (
        <div className="tw-cohort" key={c.id}>
          <div className="tw-cohort-head">
            <span className="tw-cohort-name">{c.name}</span>
            <span className="tw-cohort-share tw-fig">{c.longPct === null ? "—" : `${c.longPct.toFixed(0)}% long`}</span>
          </div>
          {c.state === "split" ? (
            <SplitBar longPct={c.longPct!} label={`${c.name} long ${c.longPct!.toFixed(0)} percent, short ${(100 - c.longPct!).toFixed(0)} percent`} />
          ) : (
            <p className="tw-cohort-empty">{c.state === "unknown" ? "No figures for this cohort" : "Nobody in this cohort is positioned"}</p>
          )}
          <div className="tw-longshort-legend">
            <span data-side="long">
              Long <b className="tw-fig">{usd(c.longsUsd)}</b>
            </span>
            <span data-side="short">
              Short <b className="tw-fig">{usd(c.shortsUsd === null ? null : Math.abs(c.shortsUsd))}</b>
            </span>
            <span className="tw-meta">
              Long + short <span className="tw-fig">{usd(c.grossUsd)}</span>
            </span>
          </div>
        </div>
      ))}
      <p className="tw-note tw-meta">
        Nansen position intelligence, Hyperliquid perps only. Each bar is scaled to that cohort&rsquo;s own long-plus-short total, so the three are not to
        scale with one another, and &ldquo;long + short&rdquo; is gross exposure rather than a net position.
      </p>
    </div>
  );
}

/**
 * Positions opened in the last hour (Round 1.3.4).
 *
 * `smart-money/perp-trades` costs 5 credits on every panel open and nothing rendered a row of
 * it until now — `PerpBody` read the Traders tab's own trades instead. The response carries
 * `action`, so the 24h page it already bought filters down to the opens. An hour with none in
 * it says so, and says what it looked at, rather than showing a blank strip.
 */
function OpensStrip({ panel }: { panel: PerpPanel }) {
  const size = useCardSize();
  if (panel.mode === "chip") return <Empty>Smart Money&rsquo;s recent position changes load with the full card.</Empty>;
  if (panel.tradesError) return <SectionProblem reasons={[panel.tradesError]} />;
  if (panel.trades === null) return <Empty>Nansen returned no Smart Money trades for this market.</Empty>;
  const { opens, latestOpenIso, tradeCount } = recentOpens(panel.trades, Date.now());
  if (opens.length === 0) {
    return (
      <Empty>
        No Smart Money opened a position in the last hour. The last 24h returned {tradeCount} position change{tradeCount === 1 ? "" : "s"}
        {latestOpenIso ? `, the most recent open ${timeAgo(latestOpenIso)}` : ", none of them an open"}.
      </Empty>
    );
  }
  return (
    <ul className="tw-trade-list">
      {opens.slice(0, rowLimit(size, 4, 10)).map((t, i) => (
        <li key={`${t.transaction_hash ?? t.trader_address}-${i}`}>
          <WalletLabel label={t.trader_address_label} address={t.trader_address} />
          <span data-side={t.side === "Short" ? "short" : "long"}>Opened {t.side.toLowerCase()}</span>
          <span className="tw-fig">{usd(t.value_usd)}</span>
          <span className="tw-fig tw-meta">{timeAgo(t.block_timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Smart Money's two-sided turnover in the window, split buy against sell. */
function PressureBar({ screener }: { screener: PerpPanel["screener"] }) {
  const buy = screener?.smart_money_buy_volume ?? null;
  const sell = screener?.smart_money_sell_volume ?? null;
  if (buy === null && sell === null) return null;
  const total = (buy ?? 0) + (sell ?? 0);
  const buyPct = total > 0 ? ((buy ?? 0) / total) * 100 : 50;
  return (
    <div className="tw-longshort">
      <div className="tw-longshort-bar" role="img" aria-label={`Smart Money buying ${buyPct.toFixed(0)}% of its volume, selling ${(100 - buyPct).toFixed(0)}%`}>
        <i className="tw-longshort-long" style={{ width: `${buyPct}%` }} />
        <i className="tw-longshort-short" style={{ width: `${100 - buyPct}%` }} />
      </div>
      <div className="tw-longshort-legend">
        <span data-side="long">
          Bought <b className="tw-fig">{usd(buy)}</b>
        </span>
        <span data-side="short">
          Sold <b className="tw-fig">{usd(sell)}</b>
        </span>
      </div>
    </div>
  );
}

function PositioningTab({ panel, hits, depth }: { panel: PerpPanel; hits: HitDto[]; depth: DepthState }) {
  const size = useCardSize();
  const screener = panel.screener;
  const market = depth.data?.perpMarket;
  const venues = depth.data?.perpVenues;
  const markPrice = market?.market?.markPrice ?? screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const book = market?.book;

  return (
    <>
      {hits.length > 0 ? (
        <Section title="Rules that fired">
          <HitList hits={hits} />
        </Section>
      ) : null}

      <Section title="Smart Money long vs short" aside={screener?.trader_count ? `${screener.trader_count} traders` : null}>
        <LongShortBar screener={screener} />
      </Section>

      <Section title="Positioning by cohort" aside={panel.cohortsAtIso ? `as of ${timeAgo(panel.cohortsAtIso)}` : "Hyperliquid"}>
        <CohortBars panel={panel} />
      </Section>

      <Section title="Opened in the last hour" aside="Smart Money">
        <OpensStrip panel={panel} />
      </Section>

      {screener && (screener.smart_money_buy_volume !== null || screener.smart_money_sell_volume !== null) ? (
        <Section title="Smart Money buy vs sell pressure" aside="24h">
          <PressureBar screener={screener} />
          <Readouts
            items={[
              { label: "Turnover", value: usd(screener.smart_money_volume ?? null) },
              { label: "Net position change", value: usd(screener.net_position_change ?? null, true), sign: signOf(screener.net_position_change) },
              { label: "Traders", value: screener.trader_count === null || screener.trader_count === undefined ? "—" : String(screener.trader_count) },
            ]}
          />
        </Section>
      ) : null}

      <Section title="The market right now" aside="Hyperliquid">
        <OpenInterestCapNotice atCap={market?.atOpenInterestCap} coin={panel.coin} />
        {has(depth, "perpMarket") ? (
          <Skeleton shape="tile" rows={2} label="Loading market data" />
        ) : market?.market ? (
          <>
            <div className="tw-market-readouts">
              <Readouts
                items={[
                  { label: "Mark", value: price(market.market.markPrice) },
                  { label: "Oracle", value: price(market.market.oraclePrice) },
                  { label: "Premium", value: signedPct(market.market.premiumPct, 3), sign: signOf(market.market.premiumPct) },
                  { label: "24h change", value: signedPct(market.market.dayChangePct, 2), sign: signOf(market.market.dayChangePct) },
                  { label: "Open interest", value: usd(market.market.openInterestUsd) },
                  { label: "24h volume", value: usd(market.market.dayVolumeUsd) },
                  {
                    label: "Funding 8h",
                    value: signedPct(market.market.fundingPer8h === null ? null : market.market.fundingPer8h * 100, 4),
                    sign: signOf(market.market.fundingPer8h),
                  },
                  { label: "Max leverage", value: market.market.maxLeverage === null ? "—" : `${market.market.maxLeverage}x` },
                ]}
              />
            </div>
            <LeverageLadderNote tiers={market.market.marginTiers} />
            {book ? (
              <p className="tw-note">
                Within <b className="tw-fig">±{book.bandPct}%</b> of mid there is <b className="tw-fig">{usd(book.bidUsd)}</b> of bids against{" "}
                <b className="tw-fig">{usd(book.askUsd)}</b> of offers
                {book.spreadBps !== null ? (
                  <>
                    , spread <b className="tw-fig">{book.spreadBps.toFixed(1)} bps</b>
                  </>
                ) : null}
                .
              </p>
            ) : null}
          </>
        ) : (
          <Empty>Hyperliquid&rsquo;s public market data didn&rsquo;t answer for this coin.</Empty>
        )}
        <SectionProblem reasons={market?.errors ?? []} />
      </Section>

      {has(depth, "perpMarket") || (market?.funding && market.funding.length > 1) ? (
        <Section title={FUNDING_SECTION_TITLE} aside="Hyperliquid, per 8h">
          {has(depth, "perpMarket") ? <Skeleton shape="chart" rows={1} label="Loading funding history" /> : <FundingHistory points={market!.funding!} height={size === "expanded" ? 96 : 56} />}
        </Section>
      ) : null}

      <Section title="Funding &amp; OI across venues">
        {has(depth, "perpVenues") ? (
          <Skeleton shape="table" rows={5} label="Loading venue funding" />
        ) : venues && venues.rows.length > 0 ? (
          <VenueTable rows={venues.rows} unmapped={venues.unmapped} />
        ) : (
          <Empty>No venue answered for this coin.</Empty>
        )}
        <SectionProblem reasons={venues?.errors ?? []} />
      </Section>

      {/* Open interest is a single point on every row of the table above: Binance is the only
          venue in the set that publishes a history, so the section is titled after Binance and
          never after the coin. Free, weight 0, and absent rather than empty when it fails. */}
      {venues?.oiHistory ? (
        <Section title="Open interest over time" aside="Binance USD-M">
          <OpenInterestHistory series={venues.oiHistory} height={size === "expanded" ? 96 : 56} />
          <p className="tw-note tw-meta">
            One side of the book, on the same convention as the table&rsquo;s own column. The other four venues publish a current figure and no history, so
            this line is one venue&rsquo;s open interest rather than the table&rsquo;s.
          </p>
        </Section>
      ) : null}

      <Sources>
        Nansen perp-screener, tgm/position-intelligence and smart-money/perp-trades; Hyperliquid, Binance, Bybit, OKX and dYdX public APIs
      </Sources>
      {markPrice === null ? null : <span className="tw-sr-only">Mark price {markPrice}</span>}
    </>
  );
}

/**
 * The ladders the Liquidations tab can draw (Round 2.5).
 *
 * Smart Money is the one the panel already bought and the only one any verdict rests on. The
 * other three are `tgm/perp-positions` asked for a different population: **5 credits each**, so
 * each is a button with its price on it and nothing here fires on opening the tab.
 */
const LADDER_COHORTS = [
  { id: "smart_money", name: "Smart Money" },
  { id: "all_traders", name: "All traders" },
  { id: "whale", name: "Whales" },
  { id: "public_figure", name: "Public figures" },
] as const;
type LadderCohortId = (typeof LADDER_COHORTS)[number]["id"];
/** Measured in the round's own recording run: the call bills 5 whichever cohort it names. */
const LADDER_COHORT_CREDITS = 5;
const cohortName = (id: LadderCohortId) => LADDER_COHORTS.find((c) => c.id === id)!.name;

type LadderView = { positions: PerpPosition[]; isLastPage: boolean | null };

function LiquidationsTab({ panel, depth }: { panel: PerpPanel; depth: DepthState }) {
  const size = useCardSize();
  const [cohort, setCohort] = useState<LadderCohortId>("smart_money");
  /** Answers already paid for, kept for the life of the card so switching back is free. */
  const [bought, setBought] = useState<Partial<Record<LadderCohortId, LadderView>>>({});
  const [pending, setPending] = useState<LadderCohortId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: LadderCohortId) {
    if (id === "smart_money" || bought[id]) {
      setCohort(id);
      setError(null);
      return;
    }
    if (pending) return;
    setPending(id);
    setError(null);
    const result = await perpLadder(panel.coin, id as Exclude<LadderCohortId, "smart_money">);
    setPending(null);
    const section = result.ok ? result.data : null;
    if (!section || !section.positions) {
      setError(section?.errors?.[0] ?? (result.ok ? "Nansen returned no positions for this cohort." : result.error));
      return;
    }
    setBought((prev) => ({ ...prev, [id]: { positions: section.positions!, isLastPage: section.isLastPage } }));
    setCohort(id);
  }

  const view: LadderView =
    cohort === "smart_money" ? { positions: panel.positions ?? [], isLastPage: panel.positionsIsLastPage } : (bought[cohort] ?? { positions: [], isLastPage: null });
  const markPrice = depth.data?.perpMarket?.market?.markPrice ?? panel.screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const positions = view.positions;
  const bands = liquidationBands(positions, markPrice);
  const hasTicks = positions.some((p) => p.liquidation_price !== null);
  // Keep all returned positions reachable without a long nested scrolling table.
  const pagination = usePagination([...positions]
    .filter((p) => p.liquidation_price !== null)
    .sort((a, b) => b.position_value_usd - a.position_value_usd), 6);
  const shown = pagination.rows;
  const name = cohortName(cohort);

  return (
    <>
      <Section title="Liquidation ladder" aside={`${name}, mark ±15%`}>
        <div className="tw-cohort-picker" role="group" aria-label="Which traders to draw the ladder for">
          {LADDER_COHORTS.map((c) =>
            c.id === "smart_money" || bought[c.id] ? (
              <button key={c.id} type="button" className="tw-cohort-choice" aria-pressed={cohort === c.id} onClick={() => void choose(c.id)}>
                {c.name}
              </button>
            ) : (
              <PricedButton
                key={c.id}
                label={c.name}
                credits={LADDER_COHORT_CREDITS}
                pending={pending === c.id}
                pressed={cohort === c.id}
                onClick={() => void choose(c.id)}
              />
            ),
          )}
        </div>
        {error ? <SectionProblem reasons={[error]} /> : null}
        {markPrice && hasTicks ? (
          <>
            <LiquidationChart positions={positions} markPrice={markPrice} height={size === "expanded" ? 320 : 240} />
          </>
        ) : (
          <Empty>No liquidation levels available for the returned {name} positions.</Empty>
        )}
        {cohort === "smart_money" ? null : (
          <p className="tw-note tw-meta">
            This ladder is Nansen&rsquo;s {name.toLowerCase()} page for {panel.coin}. Any rule this card fired still read Smart Money&rsquo;s positions, not
            this cohort&rsquo;s, and a wallet can carry a different label in each page.
          </p>
        )}
      </Section>

      <div className="tw-liquidation-summary">
      {bands ? (
        <Section title="How much liquidates near here" aside={name}>
          <Readouts
            items={bands.map((b) => ({
              label: `Within ±${b.pct}%`,
              value: `${usd(b.usd)}`,
            }))}
          />
          <p className="tw-note tw-meta">
            {bands[0]!.count === 0
              ? "No returned positions liquidate within 3% of mark."
              : `${bands[0]!.count} returned position${bands[0]!.count === 1 ? "" : "s"} have liquidation levels within 3% of mark — ${usd(bands[0]!.longUsd)} of longs and ${usd(bands[0]!.shortUsd)} of shorts.`}
          </p>
        </Section>
      ) : null}

      {shown.length > 0 ? (
        <Section title={`Largest ${name} positions`} aside={positionLadderAside(shown.length, positions.length, view.isLastPage)}>
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Wallet</th>
                <th scope="col">Side</th>
                <th scope="col" className="tw-num">
                  Size
                </th>
                <th scope="col" className="tw-num">
                  Entry
                </th>
                <th scope="col" className="tw-num">
                  Liquidation
                </th>
                <th scope="col" className="tw-num">
                  To liq.
                </th>
                <th scope="col" className="tw-num">
                  uPnL
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => {
                const distance = distanceToLiquidationPct(p, markPrice);
                return (
                  <tr key={`${p.address}-${i}`}>
                    <th scope="row">
                      <WalletLabel label={p.address_label} address={p.address} />
                    </th>
                    <td data-side={p.side === "Long" ? "long" : "short"}>
                      {p.side}
                      {p.leverage ? <span className="tw-meta"> {p.leverage}</span> : null}
                    </td>
                    <td className="tw-fig tw-num">{usd(p.position_value_usd)}</td>
                    <td className="tw-fig tw-num">{price(p.entry_price)}</td>
                    <td className="tw-fig tw-num">{price(p.liquidation_price)}</td>
                    <td className="tw-fig tw-num">{distance === null ? "—" : `${distance > 0 ? "+" : "−"}${Math.abs(distance).toFixed(1)}%`}</td>
                    <td className="tw-fig tw-num" data-sign={signOf(p.upnl_usd)}>
                      {usd(p.upnl_usd, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.controls}
        </Section>
      ) : null}
      </div>
      <Sources>Nansen tgm/perp-positions</Sources>
    </>
  );
}

/**
 * One trader's win rate, bought a row at a time (Round 2.5).
 *
 * `tgm/perp-pnl-leaderboard` carries no win-rate field of its own, so this is a second call:
 * `profiler/perp-pnl-summary`, **1 credit**, over the same 30 days the leaderboard asked for,
 * so the two figures in the row describe the same period. It is a click and never a hover, and
 * the answer is kept for the life of the card so a second look is free.
 *
 * The percentage never ships alone: 41% across twelve closed trades and 41% across 585,166 are
 * different claims, and only the second one is about a strategy.
 */
function WinRateCell({ address, state, onLoad }: { address: string | null; state: PerpWinRateResponse | "pending" | string | undefined; onLoad: () => void }) {
  if (!address) return <td className="tw-num tw-meta">—</td>;
  if (state === undefined || state === "pending") {
    return (
      <td className="tw-num">
        <PricedButton label="Win rate for this trader" credits={1} pending={state === "pending"} onClick={onLoad} priceOnly />
      </td>
    );
  }
  if (typeof state === "string") return <td className="tw-num tw-meta">{state}</td>;
  if (state.winRate === null) {
    return (
      <td className="tw-num tw-meta">
        Nansen returned no win rate for this trader over {state.windowDays}d
      </td>
    );
  }
  return (
    <td className="tw-num">
      <span className="tw-fig">{(state.winRate * 100).toFixed(1)}%</span>
      <span className="tw-meta tw-winrate-of">
        {state.closedTrades === null ? `${state.windowDays}d` : `${state.closedTrades.toLocaleString("en-US")} closed · ${state.windowDays}d`}
      </span>
    </td>
  );
}

function TradersTab({ depth, coin }: { depth: DepthState; coin: string }) {
  const size = useCardSize();
  // Expanded only: the compact card already carries six columns in 440px, and a seventh would
  // wrap every row (non-negotiable #5). The same ruling as Round 1.3.8's position table.
  const showWinRate = size === "expanded";
  const [rates, setRates] = useState<Record<string, PerpWinRateResponse | "pending" | string>>({});

  async function loadWinRate(address: string) {
    if (rates[address]) return;
    setRates((prev) => ({ ...prev, [address]: "pending" }));
    const result = await perpWinRate(address);
    setRates((prev) => ({
      ...prev,
      [address]: result.ok ? (result.data.error ? result.data.error : result.data) : result.error,
    }));
  }

  const traders = depth.data?.perpTraders;
  const loading = has(depth, "perpTraders");
  const failure = depth.failed.perpTraders;

  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) {
    return (
      <>
        <Section title={`Top traders in ${coin} by PnL`}>
          <Skeleton shape="table" rows={rowLimit(size, 5, 12)} label="Loading the PnL leaderboard" />
        </Section>
        <Section title="Largest recent trades">
          <Skeleton shape="row" rows={rowLimit(size, 4, 12)} label="Loading recent trades" />
        </Section>
      </>
    );
  }
  if (!traders) return <Empty>Open this tab to load the {coin} trader leaderboard.</Empty>;

  const leaders = (traders.leaderboard ?? []).slice(0, rowLimit(size, 5, 12));
  const trades = (traders.trades ?? []).slice(0, rowLimit(size, 5, 12));
  const here = (traders.topAccounts ?? []).filter((a) => a.hereNow).slice(0, rowLimit(size, 5, 15));

  return (
    <>
      <Section title={`Top traders in ${coin} by PnL`} aside="30 days">
        {leaders.length === 0 ? (
          <Empty>Nansen returned no PnL leaderboard for this coin.</Empty>
        ) : (
          <table className="tw-table tw-perp-leaders">
            <thead>
              <tr>
                <th scope="col">Trader</th>
                <th scope="col">Side</th>
                <th scope="col" className="tw-num">
                  Realized
                </th>
                <th scope="col" className="tw-num">
                  Unrealized
                </th>
                <th scope="col" className="tw-num">
                  ROI
                </th>
                <th scope="col" className="tw-num">
                  Trades
                </th>
                {showWinRate ? (
                  <th scope="col" className="tw-num">
                    Win rate
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {leaders.map((r, i) => (
                <tr key={`${r.address}-${i}`}>
                  <th scope="row">
                    <WalletLabel label={r.label} address={r.address ?? ""} />
                  </th>
                  <td data-side={r.side === null ? undefined : r.side.toLowerCase() === "long" ? "long" : "short"}>{r.side ?? "flat"}</td>
                  <td className="tw-fig tw-num" data-sign={signOf(r.realizedPnlUsd)}>
                    {usd(r.realizedPnlUsd, true)}
                  </td>
                  <td className="tw-fig tw-num" data-sign={signOf(r.unrealizedPnlUsd)}>
                    {usd(r.unrealizedPnlUsd, true)}
                  </td>
                  <td className="tw-fig tw-num" data-sign={signOf(r.roiPct)}>
                    {r.roiPct === null ? "—" : `${r.roiPct.toFixed(1)}%`}
                  </td>
                  <td className="tw-fig tw-num">{r.tradeCount ?? "—"}</td>
                  {showWinRate ? <WinRateCell address={r.address} state={r.address ? rates[r.address] : undefined} onLoad={() => void loadWinRate(r.address!)} /> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Largest recent trades" aside="24h">
        {trades.length === 0 ? (
          <Empty>No recent trades came back for this coin.</Empty>
        ) : (
          <ul className="tw-trade-list">
            {trades.map((t, i) => (
              <li key={i}>
                <WalletLabel label={t.label} address={t.address ?? ""} />
                <span data-side={t.side && /short/i.test(t.side) ? "short" : "long"}>
                  {t.action} {t.side}
                </span>
                <span className="tw-fig">{usd(t.valueUsd)}</span>
                <span className="tw-fig tw-meta">{t.timestamp ? timeAgo(t.timestamp) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Top Hyperliquid accounts in ${coin}`} aside={`${traders.topAccountsHere} of ${(traders.topAccounts ?? []).length}`}>
        {here.length === 0 ? (
          <Empty>None of Hyperliquid&rsquo;s top accounts has {coin} among its five largest positions.</Empty>
        ) : (
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Here</th>
                <th scope="col" className="tw-num">
                  Position
                </th>
                <th scope="col" className="tw-num">
                  Entry
                </th>
                <th scope="col" className="tw-num">
                  uPnL here
                </th>
                <th scope="col" className="tw-num">
                  30d PnL
                </th>
              </tr>
            </thead>
            <tbody>
              {here.map((a, i) => (
                <tr key={`${a.address}-${i}`}>
                  <th scope="row">
                    <WalletLabel label={a.label} address={a.address ?? ""} />
                  </th>
                  <td data-side={a.hereNow!.side?.toLowerCase() === "short" ? "short" : "long"}>{a.hereNow!.side ?? "—"}</td>
                  <td className="tw-fig tw-num">{usd(a.hereNow!.valueUsd)}</td>
                  <td className="tw-fig tw-num">{price(a.hereNow!.entryPrice)}</td>
                  <td className="tw-fig tw-num" data-sign={signOf(a.hereNow!.unrealizedPnlUsd)}>
                    {usd(a.hereNow!.unrealizedPnlUsd, true)}
                  </td>
                  <td className="tw-fig tw-num" data-sign={signOf(a.totalPnlUsd)}>
                    {usd(a.totalPnlUsd, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <SectionProblem reasons={traders.errors} />
      <Sources>
        Nansen tgm/perp-pnl-leaderboard, tgm/perp-trades and perp-leaderboard{showWinRate ? "; profiler/perp-pnl-summary per win rate asked for" : ""}
      </Sources>
    </>
  );
}

function ChartTab({ depth, coin }: { depth: DepthState; coin: string }) {
  const size = useCardSize();
  const chart = depth.data?.perpChart;
  const market = depth.data?.perpMarket;
  const loading = has(depth, "perpChart");
  return (
    <>
      <Section title="Price" aside={chart?.interval ? `${coin}, ${chart.interval} candles` : coin}>
        {loading ? (
          <Skeleton shape="chart" rows={1} label="Loading the price chart" />
        ) : chart?.candles && chart.candles.length > 1 ? (
          <div className="tw-chart-box" data-size={size}>
            <PriceChart candles={chart.candles} postTimeIso={null} timeframe="1d" symbol={coin} />
          </div>
        ) : (
          <Empty>Hyperliquid returned no candles for this market.</Empty>
        )}
        <SectionProblem reasons={chart?.errors ?? []} />
      </Section>
      {/* Not "the same window": `hlFundingHistory` always fetches 48h whatever window the price
          chart above it is on, and the chart's own legend has printed "last 48h" the whole
          time. Threading the real window is deferred — the Positioning tab renders the same
          array with no window control, and a 1h window would fall below the 2-point floor
          `FundingHistory` draws nothing under. */}
      {market?.funding && market.funding.length > 1 ? (
        <Section title={FUNDING_SECTION_TITLE} aside="Hyperliquid, per 8h">
          <FundingHistory points={market.funding} height={size === "expanded" ? 96 : 56} />
        </Section>
      ) : null}
      <Sources>Hyperliquid public API (candleSnapshot, fundingHistory)</Sources>
    </>
  );
}

export function perpTabs(panel: PerpPanel, hits: HitDto[], depth: DepthState): TabDef[] {
  return [
    { id: "positioning", label: "Positioning", icon: <Icon icon={Scale} size={14} />, content: <PositioningTab panel={panel} hits={hits} depth={depth} /> },
    { id: "liquidations", label: "Liquidations", icon: <Icon icon={Layers} size={14} />, content: <LiquidationsTab panel={panel} depth={depth} /> },
    {
      id: "traders",
      label: "Traders",
      icon: <Icon icon={Users} size={14} />,
      // The one tab that spends. The price is on the tab, so it is read before it is paid.
      cost: depthCostLabel(PERP_TAB_SECTIONS.traders!),
      content: <TradersTab depth={depth} coin={panel.coin} />,
    },
    { id: "chart", label: "Chart", icon: <Icon icon={TrendingUp} size={14} />, content: <ChartTab depth={depth} coin={panel.coin} /> },
  ];
}

export function PerpBody({
  panel,
  hits = [],
  initialTab,
  depth = EMPTY_DEPTH,
  onNeedSections,
}: {
  panel: PerpPanel;
  hits?: HitDto[];
  initialTab?: string;
  depth?: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
  return (
    <Tabs
      label="Evidence"
      tabs={perpTabs(panel, hits, depth)}
      initial={initialTab}
      onSelect={(id) => {
        const sections = PERP_TAB_SECTIONS[id];
        if (sections && sections.length > 0) onNeedSections?.(sections);
      }}
    />
  );
}
