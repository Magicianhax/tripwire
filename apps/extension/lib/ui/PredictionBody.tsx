import { depthCostLabel, provenWinnerSplit, type DepthSection } from "@tripwire/core";
import { BookOpen } from "lucide-react";
import type { HitDto, OutcomeBook, PredictionPanel } from "../api-types";
import { rowLimit, useCardSize } from "./card-size";
import { timeAgo, usd } from "./format";
import { WalletLabel } from "./WalletLabel";
import { Icon } from "./icons";
import { Empty, HitList, Section } from "./panel-parts";
import { EMPTY_DEPTH, type DepthState } from "./PerpBody";
import { SectionProblem, Skeleton } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";

/** Which lazy section each prediction tab needs. Only the book costs anything, and it only
 * exists in the expanded card. */
export const PREDICTION_TAB_SECTIONS: Record<string, DepthSection[]> = { winners: [], holders: [], trades: [], book: ["predictionBook"] };

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
  // The backend already fetched 20; compact shows eight of them, expanded shows the table.
  const all = panel.holders ?? [];
  const holders = all.slice(0, rowLimit(useCardSize(), 8, 20));
  if (holders.length === 0) return <Empty>No holder data came back for this market.</Empty>;
  return (
    <Section title="Top holders" aside={`${holders.length} of ${all.length}`}>
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
              PnL
            </th>
          </tr>
        </thead>
        <tbody>
          {holders.map((h) => (
            <tr key={h.key}>
              <td><WalletLabel address={h.address} label={null} chain="polygon" /></td>
              <td>{h.side}</td>
              <td className="tw-fig tw-num">{h.position_size.toLocaleString()}</td>
              <td className="tw-fig tw-num">{h.avg_entry_price === null ? "—" : `${(h.avg_entry_price * 100).toFixed(1)}¢`}</td>
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
  const all = panel.trades ?? [];
  const trades = all.slice(0, rowLimit(useCardSize(), 8, 15));
  if (trades.length === 0) return <Empty>No recent trades on this market.</Empty>;
  return (
    <Section title="Recent trades" aside={`${trades.length} of ${all.length}`}>
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

/** One outcome's resting book: bids down the left in mint, asks down the right in red, each
 * level's bar scaled against the biggest size on either side. Prices are in cents, because that
 * is how a prediction market is read. */
function Book({ book, rows }: { book: OutcomeBook; rows: number }) {
  const bids = book.bids.slice(0, rows);
  const asks = book.asks.slice(0, rows);
  const max = Math.max(1, ...bids.map((l) => l.size), ...asks.map((l) => l.size));
  const cents = (p: number) => `${(p * 100).toFixed(1)}¢`;
  return (
    <Section
      title={book.outcome}
      aside={book.bestBid !== null && book.bestAsk !== null ? `${cents(book.bestBid)} / ${cents(book.bestAsk)}` : null}
    >
      <div className="tw-book">
        <ul className="tw-book-side" data-side="bid" aria-label={`${book.outcome} bids`}>
          {bids.map((l, i) => (
            <li key={i}>
              <i className="tw-book-bar" style={{ width: `${(l.size / max) * 100}%` }} aria-hidden="true" />
              <span className="tw-fig tw-book-price">{cents(l.price)}</span>
              <span className="tw-fig tw-book-size">{l.size.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </li>
          ))}
        </ul>
        <ul className="tw-book-side" data-side="ask" aria-label={`${book.outcome} asks`}>
          {asks.map((l, i) => (
            <li key={i}>
              <i className="tw-book-bar" style={{ width: `${(l.size / max) * 100}%` }} aria-hidden="true" />
              <span className="tw-fig tw-book-price">{cents(l.price)}</span>
              <span className="tw-fig tw-book-size">{l.size.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </li>
          ))}
        </ul>
      </div>
      {book.spread !== null ? (
        <p className="tw-note tw-meta">
          Spread <b className="tw-fig">{(book.spread * 100).toFixed(1)}¢</b>.
        </p>
      ) : null}
    </Section>
  );
}

function BookTab({ depth }: { depth: DepthState }) {
  const size = useCardSize();
  const book = depth.data?.predictionBook;
  const loading = depth.loading.includes("predictionBook");
  const failure = depth.failed.predictionBook;
  if (failure) return <SectionProblem reasons={[failure]} />;
  if (loading) {
    return (
      <Section title="Order book">
        <Skeleton shape="table" rows={8} label="Loading the order book" />
      </Section>
    );
  }
  if (!book) return <Empty>Open this tab to load the resting order book.</Empty>;
  if (!book.books || book.books.length === 0) {
    return (
      <>
        <Empty>Nothing is resting on this market&rsquo;s book — it has most likely already resolved.</Empty>
        <SectionProblem reasons={book.errors} />
      </>
    );
  }
  return (
    <>
      {book.books.map((b) => (
        <Book key={b.outcome} book={b} rows={rowLimit(size, 6, 14)} />
      ))}
      <SectionProblem reasons={book.errors} />
    </>
  );
}

export function predictionTabs(panel: PredictionPanel, hits: HitDto[], depth: DepthState = EMPTY_DEPTH, expanded = false): TabDef[] {
  const tabs: TabDef[] = [
    { id: "winners", label: "Proven winners", content: <WinnersTab panel={panel} hits={hits} /> },
    { id: "holders", label: "Holders", content: <HoldersTab panel={panel} /> },
    { id: "trades", label: "Trades", content: <TradesTab panel={panel} /> },
  ];
  if (expanded) {
    tabs.push({
      id: "book",
      label: "Book",
      icon: <Icon icon={BookOpen} size={14} />,
      cost: depthCostLabel(PREDICTION_TAB_SECTIONS.book!),
      content: <BookTab depth={depth} />,
    });
  }
  return tabs;
}

export function PredictionBody({
  panel,
  hits = [],
  initialTab,
  depth = EMPTY_DEPTH,
  onNeedSections,
}: {
  panel: PredictionPanel;
  hits?: HitDto[];
  initialTab?: string;
  depth?: DepthState;
  onNeedSections?: (sections: DepthSection[]) => void;
}) {
  const expanded = useCardSize() === "expanded";
  return (
    <Tabs
      label="Evidence"
      tabs={predictionTabs(panel, hits, depth, expanded)}
      initial={initialTab}
      onSelect={(id) => {
        const sections = PREDICTION_TAB_SECTIONS[id];
        if (sections && sections.length > 0) onNeedSections?.(sections);
      }}
    />
  );
}
