import { provenWinnerSplit } from "@tripwire/core";
import type { HitDto, PredictionPanel } from "../api-types";
import { shortAddr, timeAgo, usd } from "./format";
import { Empty, HitList, Section } from "./panel-parts";
import { Tabs, type TabDef } from "./Tabs";

function WinnersTab({ panel, hits }: { panel: PredictionPanel; hits: HitDto[] }) {
  // Same rule as the smart_side_disagrees signal: proven winners on Yes/No sides only.
  const { yes, no } = provenWinnerSplit(panel.holders ?? [], (h) => h.pnl);
  const total = yes + no;
  const yesPct = total > 0 ? (yes / total) * 100 : 50;
  const noPct = 100 - yesPct;
  return (
    <>
      {panel.market ? <p className="tw-question">{panel.market.question}</p> : null}
      {hits.length > 0 ? (
        <Section title="Rules that fired">
          <HitList hits={hits} />
        </Section>
      ) : null}
      <Section title="Proven winners by side">
        {total > 0 ? (
          <div className="tw-longshort">
            <div className="tw-longshort-bar" role="img" aria-label={`Proven winners: Yes ${yesPct.toFixed(0)}%, No ${noPct.toFixed(0)}%`}>
              <i className="tw-longshort-long" style={{ width: `${yesPct}%` }} />
              <i className="tw-longshort-short" style={{ width: `${noPct}%` }} />
            </div>
            <div className="tw-longshort-legend">
              <span data-side="long">
                Yes <b className="tw-fig">{yesPct.toFixed(0)}%</b>
              </span>
              <span data-side="short">
                No <b className="tw-fig">{noPct.toFixed(0)}%</b>
              </span>
            </div>
          </div>
        ) : (
          <Empty>No holders with a winning record on either side yet.</Empty>
        )}
      </Section>
    </>
  );
}

function HoldersTab({ panel }: { panel: PredictionPanel }) {
  const holders = (panel.holders ?? []).slice(0, 8);
  if (holders.length === 0) return <Empty>No holder data came back for this market.</Empty>;
  return (
    <Section title="Top holders">
      <table className="tw-table">
        <thead>
          <tr>
            <th scope="col">Wallet</th>
            <th scope="col">Side</th>
            <th scope="col" className="tw-num">
              Size
            </th>
            <th scope="col" className="tw-num">
              PnL
            </th>
          </tr>
        </thead>
        <tbody>
          {holders.map((h) => (
            <tr key={h.key}>
              <td className="tw-mono">{shortAddr(h.address)}</td>
              <td>{h.side}</td>
              <td className="tw-fig tw-num">{h.position_size.toLocaleString()}</td>
              <td className="tw-fig tw-num" data-sign={h.pnl === null || h.pnl === 0 ? "zero" : h.pnl < 0 ? "neg" : "pos"}>
                {usd(h.pnl, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function TradesTab({ panel }: { panel: PredictionPanel }) {
  const trades = (panel.trades ?? []).slice(0, 8);
  if (trades.length === 0) return <Empty>No recent trades on this market.</Empty>;
  return (
    <Section title="Recent trades">
      <ul className="tw-trade-list" data-cols="3">
        {trades.map((t, i) => (
          <li key={i}>
            <span>
              {t.taker_action} {t.side}
            </span>
            <span className="tw-fig">{usd(t.usdc_value)}</span>
            <span className="tw-fig tw-meta">{timeAgo(t.timestamp)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function predictionTabs(panel: PredictionPanel, hits: HitDto[]): TabDef[] {
  return [
    { id: "winners", label: "Proven winners", content: <WinnersTab panel={panel} hits={hits} /> },
    { id: "holders", label: "Holders", content: <HoldersTab panel={panel} /> },
    { id: "trades", label: "Trades", content: <TradesTab panel={panel} /> },
  ];
}

export function PredictionBody({ panel, hits = [], initialTab }: { panel: PredictionPanel; hits?: HitDto[]; initialTab?: string }) {
  return <Tabs label="Evidence" tabs={predictionTabs(panel, hits)} initial={initialTab} />;
}
