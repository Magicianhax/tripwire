import type { PredictionPanel } from "../api-types";
import { shortAddr, timeAgo, usd } from "./format";

/** Weighted stake per side from proven winners: pnl>0 ? pnl × position_size × current_price : 0,
 * summed by holder.side (yes/no). Mirrors @tripwire/core's smart_side_disagrees signal. */
function weightedSplit(holders: PredictionPanel["holders"]): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const h of holders ?? []) {
    if (h.pnl === null || h.pnl <= 0) continue;
    const price = h.current_price ?? h.avg_entry_price ?? 0;
    const weight = h.pnl * h.position_size * price;
    if (weight <= 0) continue;
    const side = h.side.toLowerCase();
    if (side === "yes") yes += weight;
    else if (side === "no") no += weight;
  }
  return { yes, no };
}

export function PredictionBody({ panel }: { panel: PredictionPanel }) {
  const { yes, no } = weightedSplit(panel.holders);
  const total = yes + no;
  const yesPct = total > 0 ? (yes / total) * 100 : 50;
  const noPct = 100 - yesPct;
  const holders = (panel.holders ?? []).slice(0, 5);
  const trades = (panel.trades ?? []).slice(0, 5);

  return (
    <>
      {panel.market ? <p className="tw-question">{panel.market.question}</p> : null}

      {total > 0 ? (
        <section className="tw-section" aria-label="Proven winners">
          <h3 className="tw-section-title">Proven winners</h3>
          <div className="tw-longshort">
            <div className="tw-longshort-bar" role="img" aria-hidden="true">
              <i className="tw-longshort-long" style={{ width: `${yesPct}%` }} />
              <i className="tw-longshort-short" style={{ width: `${noPct}%` }} />
            </div>
            <div className="tw-longshort-legend tw-mono">
              <span>YES {yesPct.toFixed(0)}%</span>
              <span>NO {noPct.toFixed(0)}%</span>
            </div>
          </div>
        </section>
      ) : null}

      {holders.length > 0 ? (
        <section className="tw-section" aria-label="Top holders">
          <h3 className="tw-section-title">Top holders</h3>
          <table className="tw-table">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Side</th>
                <th>Size</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((h) => (
                <tr key={h.key}>
                  <td>{shortAddr(h.address)}</td>
                  <td>{h.side}</td>
                  <td className="tw-mono">{h.position_size.toLocaleString()}</td>
                  <td className={`tw-mono${h.pnl !== null && h.pnl < 0 ? " tw-neg" : ""}`}>{usd(h.pnl, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {trades.length > 0 ? (
        <section className="tw-section" aria-label="Recent trades">
          <h3 className="tw-section-title">Recent trades</h3>
          <ul className="tw-trade-list">
            {trades.map((t, i) => (
              <li key={i}>
                <span>
                  {t.taker_action} {t.side}
                </span>
                <span className="tw-mono">{usd(t.usdc_value)}</span>
                <span className="tw-mono tw-meta">{timeAgo(t.timestamp)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
