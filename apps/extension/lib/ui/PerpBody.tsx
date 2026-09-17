import type { PerpPosition } from "@tripwire/core";
import type { HitDto, PerpPanel } from "../api-types";
import { shortAddr, timeAgo, usd } from "./format";
import { Empty, HitList, Section } from "./panel-parts";
import { Tabs, type TabDef } from "./Tabs";

/** Long share filled, short share outlined: the split never relies on colour or lightness. */
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
      <div className="tw-longshort-legend tw-mono">
        <span>
          Long {usd(longUsd)} · {screener?.smart_money_longs_count ?? 0}
        </span>
        <span>
          Short {usd(shortUsd)} · {screener?.smart_money_shorts_count ?? 0}
        </span>
      </div>
    </div>
  );
}

/** Vertical price axis centered on mark price ±15%. A tick per Smart Money position at its
 * liquidation_price, width scaled by position_value_usd. Positions with a null
 * liquidation_price are skipped (never crash). A dashed band marks ±3% around mark; longs are
 * filled ticks, shorts outlined in warning red; mark price is an advisory rule. */
function LiquidationLadder({ positions, markPrice }: { positions: PerpPosition[] | null; markPrice: number | null }) {
  if (!markPrice || !positions || positions.length === 0) return null;
  const lo = markPrice * 0.85;
  const hi = markPrice * 1.15;
  const range = hi - lo;
  if (range <= 0) return null;
  const H = 180;
  const W = 400;

  const ticks = positions.filter(
    (p): p is PerpPosition & { liquidation_price: number } => p.liquidation_price !== null && p.liquidation_price >= lo && p.liquidation_price <= hi,
  );
  if (ticks.length === 0) return null;

  const maxValue = Math.max(...ticks.map((p) => p.position_value_usd));
  const yFor = (price: number) => H - ((price - lo) / range) * H;
  const bandTop = yFor(Math.min(markPrice * 1.03, hi));
  const bandBottom = yFor(Math.max(markPrice * 0.97, lo));

  return (
    <svg className="tw-ladder" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Liquidation ladder">
      <rect className="tw-ladder-band" x={0.5} y={bandTop} width={W - 1} height={Math.max(0, bandBottom - bandTop)} />
      <line className="tw-ladder-mark" x1={0} x2={W} y1={yFor(markPrice)} y2={yFor(markPrice)} />
      {ticks.map((p, i) => {
        const y = yFor(p.liquidation_price);
        const w = maxValue > 0 ? Math.max(8, (p.position_value_usd / maxValue) * (W / 2)) : 8;
        const x = p.side === "Long" ? W / 2 - w : W / 2;
        return p.side === "Long" ? (
          <rect key={i} className="tw-ladder-long" x={x} y={Math.max(0, y - 1.5)} width={w} height={3} />
        ) : (
          <rect key={i} className="tw-ladder-short" x={x + 0.5} y={Math.max(0.5, y - 2)} width={Math.max(0, w - 1)} height={4} />
        );
      })}
    </svg>
  );
}

function PositioningTab({ panel, hits }: { panel: PerpPanel; hits: HitDto[] }) {
  const markPrice = panel.screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const funding = panel.screener?.funding ?? null;
  return (
    <>
      {hits.length > 0 ? (
        <Section title="Rules that fired">
          <HitList hits={hits} />
        </Section>
      ) : null}
      <Section title="Smart Money long vs short">
        {panel.screener ? <LongShortBar screener={panel.screener} /> : <Empty>No positioning data came back for this market.</Empty>}
      </Section>
      {funding !== null || markPrice !== null ? (
        <dl className="tw-readouts">
          {markPrice !== null ? (
            <div>
              <dt>Mark</dt>
              <dd className="tw-mono">{markPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}</dd>
            </div>
          ) : null}
          {funding !== null ? (
            <div>
              <dt>Funding</dt>
              <dd className="tw-mono">{(funding * 100).toFixed(4)}%</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}

function LiquidationsTab({ panel }: { panel: PerpPanel }) {
  const markPrice = panel.screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const ladder = <LiquidationLadder positions={panel.positions} markPrice={markPrice} />;
  const hasTicks = (panel.positions ?? []).some((p) => p.liquidation_price !== null);
  return (
    <Section title="Liquidation ladder" aside="mark ±15%">
      {markPrice && hasTicks ? (
        <>
          {ladder}
          <p className="tw-legend">
            <span>
              <i className="tw-key tw-key-long" aria-hidden="true" />
              Long liq.
            </span>
            <span>
              <i className="tw-key tw-key-short" aria-hidden="true" />
              Short liq.
            </span>
            <span>
              <i className="tw-key tw-key-band" aria-hidden="true" />
              ±3% of mark
            </span>
          </p>
        </>
      ) : (
        <Empty>No Smart Money liquidation prices near mark.</Empty>
      )}
    </Section>
  );
}

function TradesTab({ panel }: { panel: PerpPanel }) {
  const trades = (panel.trades ?? []).slice(0, 8);
  if (trades.length === 0) return <Empty>No recent Smart Money trades on this market.</Empty>;
  return (
    <Section title="Recent Smart Money trades">
      <ul className="tw-trade-list">
        {trades.map((t, i) => (
          <li key={i}>
            <span className="tw-row-name">{t.trader_address_label ?? shortAddr(t.trader_address)}</span>
            <span>
              {t.action} {t.side}
            </span>
            <span className="tw-mono">{usd(t.value_usd)}</span>
            <span className="tw-mono tw-meta">{timeAgo(t.block_timestamp)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function perpTabs(panel: PerpPanel, hits: HitDto[]): TabDef[] {
  return [
    { id: "positioning", label: "Positioning", content: <PositioningTab panel={panel} hits={hits} /> },
    { id: "liquidations", label: "Liquidations", content: <LiquidationsTab panel={panel} /> },
    { id: "trades", label: "Trades", content: <TradesTab panel={panel} /> },
  ];
}

export function PerpBody({ panel, hits = [], initialTab }: { panel: PerpPanel; hits?: HitDto[]; initialTab?: string }) {
  return <Tabs label="Evidence" tabs={perpTabs(panel, hits)} initial={initialTab} />;
}
