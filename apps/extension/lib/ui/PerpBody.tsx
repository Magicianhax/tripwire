import {
  depthCostLabel,
  distanceToLiquidationPct,
  liquidationBands,
  type DepthSection,
  type PerpPosition,
} from "@tripwire/core";
import { Layers, Scale, TrendingUp, Users } from "lucide-react";
import type { DepthResponse, HitDto, PerpPanel } from "../api-types";
import { rowLimit, useCardSize } from "./card-size";
import { timeAgo, usd } from "./format";
import { Icon } from "./icons";
import { Empty, HitList, price, Readouts, Section, signOf, Sources } from "./panel-parts";
import { PriceChart } from "./PriceChart";
import { SectionProblem, Skeleton } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";
import { FundingHistory, VenueTable } from "./VenueTable";
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

/** Long share in mint, short share in red, each named with its value and wallet count in the
 * legend so the split never relies on colour alone. */
function LongShortBar({ screener }: { screener: PerpPanel["screener"] }) {
  const longUsd = screener?.current_smart_money_position_longs_usd ?? 0;
  const shortUsd = Math.abs(screener?.current_smart_money_position_shorts_usd ?? 0);
  const total = longUsd + shortUsd;
  const longPct = total > 0 ? (longUsd / total) * 100 : 50;
  const shortPct = 100 - longPct;
  return (
    <div className="tw-longshort">
      <div className="tw-longshort-bar" role="img" aria-label={`Smart Money long ${longPct.toFixed(0)}%, short ${shortPct.toFixed(0)}%`}>
        <i className="tw-longshort-long" style={{ width: `${longPct}%` }} />
        <i className="tw-longshort-short" style={{ width: `${shortPct}%` }} />
      </div>
      <div className="tw-longshort-legend">
        <span data-side="long">
          Long <b className="tw-fig">{usd(longUsd)}</b> <span className="tw-fig">{screener?.smart_money_longs_count ?? 0}</span> wallets
        </span>
        <span data-side="short">
          Short <b className="tw-fig">{usd(shortUsd)}</b> <span className="tw-fig">{screener?.smart_money_shorts_count ?? 0}</span> wallets
        </span>
      </div>
    </div>
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
        {screener ? <LongShortBar screener={screener} /> : <Empty>No positioning data came back for this market.</Empty>}
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
        <Section title="Funding history" aside="Hyperliquid, per 8h">
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

      <Sources>Nansen perp-screener, Hyperliquid, Binance, Bybit, OKX and dYdX public APIs</Sources>
      {markPrice === null ? null : <span className="tw-sr-only">Mark price {markPrice}</span>}
    </>
  );
}

function LiquidationsTab({ panel, depth }: { panel: PerpPanel; depth: DepthState }) {
  const size = useCardSize();
  const markPrice = depth.data?.perpMarket?.market?.markPrice ?? panel.screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const positions = panel.positions ?? [];
  const bands = liquidationBands(positions, markPrice);
  const hasTicks = positions.some((p) => p.liquidation_price !== null);
  // Keep all returned positions reachable without a long nested scrolling table.
  const pagination = usePagination([...positions]
    .filter((p) => p.liquidation_price !== null)
    .sort((a, b) => b.position_value_usd - a.position_value_usd), 6);
  const shown = pagination.rows;

  return (
    <>
      <Section title="Liquidation ladder" aside="mark ±15%">
        {markPrice && hasTicks ? (
          <>
            <LiquidationChart positions={positions} markPrice={markPrice} height={size === "expanded" ? 320 : 240} />
          </>
        ) : (
          <Empty>No liquidation levels available for the returned positions.</Empty>
        )}
      </Section>

      <div className="tw-liquidation-summary">
      {bands ? (
        <Section title="How much liquidates near here" aside="Smart Money">
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
        <Section title="Largest Smart Money positions" aside={`${shown.length} of ${positions.length}`}>
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

function TradersTab({ depth, coin }: { depth: DepthState; coin: string }) {
  const size = useCardSize();
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
          <table className="tw-table">
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
        Nansen tgm/perp-pnl-leaderboard, tgm/perp-trades and perp-leaderboard
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
      {market?.funding && market.funding.length > 1 ? (
        <Section title="Funding over the same window" aside="per 8h">
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
