import type { PerpPosition } from "@tripwire/core";
import type { PerpPanel } from "../api-types";
import { shortAddr, timeAgo, usd } from "./format";

function LongShortBar({ screener }: { screener: PerpPanel["screener"] }) {
  const longUsd = screener?.current_smart_money_position_longs_usd ?? 0;
  const shortUsd = Math.abs(screener?.current_smart_money_position_shorts_usd ?? 0);
  const total = longUsd + shortUsd;
  const longPct = total > 0 ? (longUsd / total) * 100 : 50;
  const shortPct = 100 - longPct;
  return (
    <div className="tw-longshort">
      <div className="tw-longshort-bar" role="img" aria-hidden="true">
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
 * liquidation_price are skipped (never crash). A yellow band marks ±3% around mark. */
function LiquidationLadder({ positions, markPrice }: { positions: PerpPosition[] | null; markPrice: number | null }) {
  if (!markPrice || !positions || positions.length === 0) return null;
  const lo = markPrice * 0.85;
  const hi = markPrice * 1.15;
  const range = hi - lo;
  if (range <= 0) return null;
  const H = 160;
  const W = 328;

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
      <rect x={0} y={bandTop} width={W} height={Math.max(0, bandBottom - bandTop)} fill="#FFD400" opacity={0.18} />
      <line x1={0} x2={W} y1={yFor(markPrice)} y2={yFor(markPrice)} stroke="#EDEDED" strokeWidth={1} />
      {ticks.map((p, i) => {
        const y = yFor(p.liquidation_price);
        const w = maxValue > 0 ? Math.max(8, (p.position_value_usd / maxValue) * (W / 2)) : 8;
        const x = p.side === "Long" ? W / 2 - w : W / 2;
        return <rect key={i} x={x} y={Math.max(0, y - 1.5)} width={w} height={3} fill={p.side === "Long" ? "#EDEDED" : "#FF5A36"} />;
      })}
    </svg>
  );
}

export function PerpBody({ panel }: { panel: PerpPanel }) {
  const markPrice = panel.screener?.mark_price ?? panel.positions?.[0]?.mark_price ?? null;
  const funding = panel.screener?.funding ?? null;
  const trades = (panel.trades ?? []).slice(0, 5);

  return (
    <>
      <section className="tw-section" aria-label="Long vs short">
        <h3 className="tw-section-title">Long vs short</h3>
        <LongShortBar screener={panel.screener} />
      </section>

      {funding !== null ? (
        <section className="tw-section" aria-label="Funding">
          <div className="tw-seg">
            <span className="tw-seg-label">Funding</span>
            <span />
            <span className="tw-mono">{(funding * 100).toFixed(4)}%</span>
          </div>
        </section>
      ) : null}

      <section className="tw-section" aria-label="Liquidation ladder">
        <h3 className="tw-section-title">Liquidation ladder</h3>
        <LiquidationLadder positions={panel.positions} markPrice={markPrice} />
      </section>

      {trades.length > 0 ? (
        <section className="tw-section" aria-label="Recent Smart Money trades">
          <h3 className="tw-section-title">Recent Smart Money trades</h3>
          <ul className="tw-trade-list">
            {trades.map((t, i) => (
              <li key={i}>
                <span>{t.trader_address_label ?? shortAddr(t.trader_address)}</span>
                <span>
                  {t.action} {t.side}
                </span>
                <span className="tw-mono">{usd(t.value_usd)}</span>
                <span className="tw-mono tw-meta">{timeAgo(t.block_timestamp)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
