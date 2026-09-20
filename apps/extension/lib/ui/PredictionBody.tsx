import { useState } from "react";
import { depthCostLabel, isYesNoOutcomes, provenWinnerWeights, type DepthSection, type HolderRecord } from "@tripwire/core";
import { BookOpen, ChevronRight, CircleSlash, Gavel, ListTree } from "lucide-react";
import type { HitDto, MarketOption, OutcomeBook, PredictionMarket, PredictionPanel } from "../api-types";
import { rowLimit, useCardSize } from "./card-size";
import { usePagination } from "./DataCharts";
import { timeAgo, usd } from "./format";
import { WalletLabel } from "./WalletLabel";
import { Icon } from "./icons";
import { Empty, HitList, Readouts, Section } from "./panel-parts";
import { EMPTY_DEPTH, type DepthState } from "./PerpBody";
import { SectionProblem, Skeleton } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";

/** Which lazy section each prediction tab needs. Nothing here costs a credit any more: the Book
 * tab reads Polymarket's own CLOB, which is public and free (Round 1.2.7). */
export const PREDICTION_TAB_SECTIONS: Record<string, DepthSection[]> = { winners: [], holders: [], trades: [], markets: [], book: ["predictionBook"] };

const DASH = "—";

/**
 * This market's outcome names, in Gamma's order. Index 0 is what the headline price, the bid and
 * the ask are quoted for.
 *
 * There is no fallback to "Yes" and "No": 44 of Polymarket's 100 highest-volume open markets are
 * named something else, and a card that prints "Yes" over a Ravens price is stating a falsehood
 * about what the reader would be buying. A market that arrived without its set gets a positional
 * name, which is ugly and true (Round 2.2).
 */
function outcomeName(outcomes: string[] | null | undefined, index: number): string {
  const name = outcomes?.[index];
  return typeof name === "string" && name.trim() !== "" ? name : `Outcome ${index + 1}`;
}

/** "BAL or NO" / "one of 4 outcomes" — how to ask the reader to pick, in this market's words. */
function outcomeChoice(outcomes: string[] | null | undefined): string {
  if (!outcomes || outcomes.length < 2) return "an outcome";
  if (outcomes.length === 2) return `${outcomes[0]} or ${outcomes[1]}`;
  return `one of ${outcomes.length} outcomes`;
}

/**
 * A probability written the way a prediction market is read. One decimal of a cent normally,
 * two below a cent — a long-shot resting at 0.15¢ must not print as 0.1¢, because at that end
 * of the book the second digit is most of the price. Never renders 0 for a missing price.
 */
function cents(p: number | null | undefined): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return DASH;
  const v = p * 100;
  return `${v.toFixed(Math.abs(v) > 0 && Math.abs(v) < 1 ? 2 : 1)}¢`;
}

/** A *change* in probability, signed, in the same unit as the price above it. */
function centsDelta(d: number | null | undefined): string {
  if (typeof d !== "number" || !Number.isFinite(d)) return DASH;
  const v = d * 100;
  const abs = Math.abs(v);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${abs.toFixed(abs > 0 && abs < 1 ? 2 : 1)}¢`;
}

/**
 * A single position's result, to the cent (Round 1.2.4).
 *
 * The house formatter compacts, which is right for a magnitude — a lifetime record across 558
 * markets, a market's 24h volume — and wrong here: this column exists because the recorded top
 * holder reads +$13.8K lifetime and is down $744.52 on *this* market, and "−$745" quietly
 * rounds away the unit a market priced in cents is settled in.
 */
function positionPnl(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return DASH;
  if (Math.abs(n) >= 1e6) return usd(n, true);
  const mark = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${mark}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const sign = (n: number | null | undefined): "pos" | "neg" | "zero" =>
  typeof n !== "number" || !Number.isFinite(n) || n === 0 ? "zero" : n < 0 ? "neg" : "pos";

/** A count, exact: 558 markets is 558, not 560. */
const count = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : DASH);

/** Gamma's `win_rate` is a fraction (0.1219), not a percentage. */
const rate = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : DASH);

/**
 * A calendar date, not "in 4 hours": the reader is deciding whether to hold a position to it.
 *
 * `endDate` carries the hour and `endDateIso` is date-only, so a market that settles at 16:00
 * UTC must not be printed as midnight -- the caller passes the full timestamp first, and a
 * date-only value states no hour at all rather than inventing one.
 */
function marketDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  // The year is only worth a tile when it is not this one.
  const thisYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return day;
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

const PRICE_SOURCE: Record<NonNullable<PredictionMarket["yesPriceSource"]>, string> = {
  book: "mid of the resting book",
  "last-trade": "last trade",
  cached: "Polymarket's cached snapshot",
};

const STATE_COPY: Record<"paused" | "resolved", { label: string; note: string }> = {
  resolved: { label: "Resolved", note: "This market has settled. Holders and trades below are history, not a live read." },
  paused: { label: "Not taking orders", note: "Polymarket is not accepting orders on this market right now." },
};

/**
 * What this market's outcomes are called, and which one the page is buying.
 *
 * It is the only place the card states the thing a wrong answer would block the wrong trade on,
 * so it never fills a gap: an outcome the page did not pick, or one this market does not list,
 * is said in words rather than defaulted to the first one (Round 2.2).
 */
function OutcomeLine({ market, picked, unknown }: { market: PredictionMarket; picked: string | null; unknown: string | null }) {
  const outcomes = market.outcomes;
  if (!outcomes || outcomes.length === 0) return null;
  return (
    <p className="tw-note tw-meta">
      Outcomes: <b>{outcomes.join(" · ")}</b>.{" "}
      {picked ? (
        <>
          The page has <b>{picked}</b> selected.
        </>
      ) : unknown ? (
        <>
          The page offered <b>{unknown}</b>, which is not one of them, so this market is unchecked.
        </>
      ) : (
        <>Nothing is selected on the page, so this market is unchecked.</>
      )}
    </p>
  );
}

/**
 * What the market is and what it costs, stated before any evidence (Round 1.2.1 / 1.2.2 / 1.2.3).
 *
 * The headline price comes from the resting book, not from `outcomePrices` — that field is a
 * cached snapshot which disagrees with the Book tab and with Nansen's `current_price`, and a
 * card that shows two different prices for the same outcome is worse than one that shows none.
 * Every figure below it is nullable and renders a dash when Gamma omits it.
 */
function MarketReadout({ market, historical, picked, unknown }: { market: PredictionMarket; historical: boolean; picked: string | null; unknown: string | null }) {
  const [openRules, setOpenRules] = useState(false);
  const expanded = useCardSize() === "expanded";
  const state = market.state === "resolved" || market.state === "paused" ? STATE_COPY[market.state] : null;
  const uma = market.umaResolutionStatuses;
  return (
    <div className="tw-pm-readout">
      <p className="tw-question">
        {market.question}
        {market.groupItemTitle ? <span className="tw-pm-group tw-fig">{market.groupItemTitle}</span> : null}
      </p>
      {state ? (
        <p className="tw-pm-state" data-state={market.state}>
          <Icon icon={market.state === "resolved" ? Gavel : CircleSlash} size={14} />
          <b>{state.label}</b>
          <span>{state.note}</span>
        </p>
      ) : null}
      <div className="tw-pm-price">
        <p className="tw-price-now">
          <span className="tw-pm-outcome">{outcomeName(market.outcomes, 0)}</span>
          <span className="tw-price-value tw-fig">{cents(market.yesPrice)}</span>
          <span className="tw-price-change tw-fig" data-sign={sign(market.oneDayPriceChange)}>
            {centsDelta(market.oneDayPriceChange)}
            <span className="tw-sr-only"> over 24 hours</span>
          </span>
        </p>
        <p className="tw-price-range tw-meta">
          {market.yesPriceSource ? PRICE_SOURCE[market.yesPriceSource] : "price unavailable"}
          {market.pricedAtIso ? <> · as of {timeAgo(market.pricedAtIso)}</> : null}
        </p>
      </div>
      <OutcomeLine market={market} picked={picked} unknown={unknown} />
      <div className="tw-market-readouts">
        {/* Six tiles at 440px, thirteen when the card has the room. The compact set is what a
            reader needs before a trade: what it costs to get in, how deep it is, and when it
            settles. The rest is context, and context that wraps is worse than context one size
            up. */}
        <Readouts
          items={[
            { label: "Bid", value: cents(market.bestBid) },
            { label: "Ask", value: cents(market.bestAsk) },
            { label: "Spread", value: cents(market.spread) },
            ...(expanded
              ? [
                  { label: "Last trade", value: cents(market.lastTradePrice) },
                  { label: "24h change", value: centsDelta(market.oneDayPriceChange), sign: sign(market.oneDayPriceChange) },
                  { label: "7d change", value: centsDelta(market.oneWeekPriceChange), sign: sign(market.oneWeekPriceChange) },
                ]
              : []),
            { label: "24h volume", value: usd(market.volume24hUsd) },
            ...(expanded
              ? [
                  { label: "7d volume", value: usd(market.volume1wkUsd) },
                  { label: "Total volume", value: usd(market.volumeUsd) },
                ]
              : []),
            { label: "Liquidity", value: usd(market.liquidityUsd) },
            ...(expanded ? [{ label: "Opened", value: marketDate(market.startDateIso) }] : []),
            { label: "Resolves", value: marketDate(market.endDate ?? market.endDateIso) },
            ...(expanded ? [{ label: "Multi-outcome", value: market.negRisk === null ? DASH : market.negRisk ? "Yes" : "No" }] : []),
          ]}
        />
      </div>
      {uma && uma.length > 0 ? (
        <p className="tw-note tw-meta">
          UMA resolution: <b>{uma.join(", ")}</b>.
        </p>
      ) : null}
      {market.description ? (
        <div className="tw-pm-rules">
          <button type="button" className="tw-disclosure" aria-expanded={openRules} onClick={() => setOpenRules((v) => !v)}>
            <Icon icon={ChevronRight} size={14} className={openRules ? "tw-disclosure-open" : undefined} />
            How this market resolves
          </button>
          {/* Polymarket's own prose, capped on the backend and rendered as text. Never innerHTML. */}
          {openRules ? <p className="tw-pm-rules-text">{market.description}</p> : null}
        </div>
      ) : null}
      {historical && !state ? <p className="tw-note tw-meta">Holders and trades below are historical.</p> : null}
    </div>
  );
}


/** Where a market lives on polymarket.com, with the event's own market selector already set. */
const marketUrl = (eventSlug: string, slug: string) =>
  `https://polymarket.com/event/${encodeURIComponent(eventSlug)}?marketSlug=${encodeURIComponent(slug)}`;

/** "Ravens 66.5¢ · Saints 33.5¢" from Gamma's cached snapshot, or null when it sent none. */
function optionPrices(option: MarketOption): string | null {
  const { outcomes, outcomePrices } = option;
  if (!outcomes || !outcomePrices || outcomes.length !== outcomePrices.length) return null;
  return outcomes.map((name, i) => `${name} ${cents(outcomePrices[i])}`).join(" · ");
}

/**
 * The event's other markets (Round 2.2).
 *
 * The list is **evidence, not a verdict**. Tripwire checks the market the page has selected, and
 * a row here opens that market on its own Polymarket page rather than re-pointing this card:
 * getting "which market is the target" from a card control instead of from the page is how a
 * block ends up over the wrong trade.
 *
 * It costs nothing. Every figure comes from a Gamma call that has already been made, which is
 * also why the rows carry Polymarket's cached prices and say so rather than pretending to be the
 * live book the Book tab reads.
 */
function MarketPicker({ panel }: { panel: PredictionPanel }) {
  const size = useCardSize();
  const options = panel.options ?? [];
  const page = usePagination(options, size === "expanded" ? 6 : 3);
  const eventSlug = panel.eventSlug;
  const total = panel.optionsTotal ?? options.length;
  if (options.length === 0) return null;
  const capped = total > options.length;
  return (
    <Section
      title={panel.market ? "Other markets in this event" : "Markets in this event"}
      aside={capped ? `${options.length} of ${total} by 24h volume` : `${options.length}`}
    >
      <p className="tw-note tw-meta">
        Tripwire checks the market this page has selected, so these are not checked and this
        card’s verdict does not change. Opening one checks it on its own page. Prices are
        Polymarket’s cached snapshot{capped ? `, and the ${total - options.length} lowest-volume markets of this event are not listed` : ""}.
      </p>
      <div className="tw-market-options">
        {page.rows.map((o) => (
          <article className="tw-market-option" key={o.id}>
            <div className="tw-market-heading">
              <b>{o.groupItemTitle ?? o.question}</b>
              {o.state === "paused" ? <span className="tw-meta">Not taking orders</span> : null}
            </div>
            {o.groupItemTitle ? <p className="tw-market-name">{o.question}</p> : null}
            <p className="tw-meta tw-fig">{optionPrices(o) ?? "No price from Polymarket"}</p>
            <dl className="tw-market-metrics">
              <div>
                <dt>24h volume</dt>
                <dd className="tw-fig">{usd(o.volume24hUsd)}</dd>
              </div>
              <div>
                <dt>Liquidity</dt>
                <dd className="tw-fig">{usd(o.liquidityUsd)}</dd>
              </div>
              <div>
                <dt>Resolves</dt>
                <dd className="tw-fig">{marketDate(o.endDate)}</dd>
              </div>
            </dl>
            {eventSlug ? (
              <a className="tw-link-btn" href={marketUrl(eventSlug, o.slug)} target="_blank" rel="noopener noreferrer">
                Open this market
              </a>
            ) : null}
          </article>
        ))}
      </div>
      {page.controls}
    </Section>
  );
}

function WinnersTab({ panel, hits }: { panel: PredictionPanel; hits: HitDto[] }) {
  // Same rule as the smart_side_disagrees signal: proven winners resolved against THIS market's
  // outcome set, so a holder whose side reads "NO" on a ["BAL", "NO"] market counts for New
  // Orleans and not for "the no side".
  const outcomes = panel.market?.outcomes ?? null;
  const split = provenWinnerWeights(panel.holders ?? [], outcomes, (h) => h.record?.pnlUsd);
  const total = split.byOutcome.reduce((sum, v) => sum + v, 0);
  const picked = panel.outcomeIndex;
  const sides = panel.sides;
  const checked = panel.recordsChecked;
  const shares = split.byOutcome.map((v) => (total > 0 ? (v / total) * 100 : 0));
  const yesNo = isYesNoOutcomes(outcomes);
  return (
    <>
      {hits.length > 0 ? (
        <Section title="Rules that fired">
          <HitList hits={hits} />
        </Section>
      ) : null}
      <Section title="Proven winners by outcome">
        {total > 0 ? (
          <div className="tw-longshort">
            {/* Mint is the outcome the page is buying and red is everything else, which is what
                the signal above measures. With nothing picked there is no "your side", so the
                bar is drawn in Gamma's order and the legend says which is which. */}
            <div
              className="tw-longshort-bar"
              role="img"
              aria-label={`Proven winners: ${shares.map((v, i) => `${outcomeName(outcomes, i)} ${v.toFixed(0)}%`).join(", ")}`}
            >
              {shares.map((v, i) => (
                <i key={i} className={picked === null ? (i === 0 ? "tw-longshort-long" : "tw-longshort-short") : picked === i ? "tw-longshort-long" : "tw-longshort-short"} style={{ width: `${v}%` }} />
              ))}
            </div>
            <div className="tw-longshort-legend">
              {shares.map((v, i) => (
                <span key={i} data-side={picked === null ? (i === 0 ? "long" : "short") : picked === i ? "long" : "short"}>
                  {outcomeName(outcomes, i)} <b className="tw-fig">{v.toFixed(0)}%</b>
                </span>
              ))}
            </div>
          </div>
        ) : panel.historical ? (
          <Empty>This market has settled, so there is no outcome left to compare.</Empty>
        ) : picked === null ? (
          <Empty>Select {outcomeChoice(outcomes)} on the page to compare it with proven winners.</Empty>
        ) : (
          <Empty>No holders with a settled winning record on any outcome yet.</Empty>
        )}
        {split.unmatchedUsd > 0 ? (
          <p className="tw-note tw-meta">
            Proven-winner money worth <b className="tw-fig">{usd(split.unmatchedUsd, true)}</b> sits on a side this market does not list. It counts for no
            outcome here rather than being folded into one.
          </p>
        ) : null}
        {checked !== null ? (
          <p className="tw-note tw-meta">
            Settled records bought for the <b className="tw-fig">{checked}</b> largest tracked holders (cap{" "}
            <b className="tw-fig">{panel.recordsCap}</b>). A wallet with no record counts for nothing, never as a loss.
          </p>
        ) : null}
      </Section>
      {sides && sides.valued > 0 ? (
        <Section title="Where the sampled money sits">
          <Readouts
            items={
              sides.byOutcome
                ? [
                    // "Yes side" reads right for a Yes/No market and "Ravens side" does not, so
                    // a named outcome is just its name.
                    ...sides.byOutcome.map((v, i) => ({ label: yesNo ? `${outcomeName(outcomes, i)} side` : outcomeName(outcomes, i), value: usd(v) })),
                    { label: "Other sides", value: sides.unmatchedUsd ? usd(sides.unmatchedUsd) : DASH },
                    { label: "Top 10 share", value: sides.top10SharePct === null ? DASH : `${sides.top10SharePct.toFixed(0)}%` },
                  ]
                : [
                    { label: "Yes side", value: usd(sides.yesUsd) },
                    { label: "No side", value: usd(sides.noUsd) },
                    { label: "Other sides", value: usd(sides.otherUsd) },
                    { label: "Top 10 share", value: sides.top10SharePct === null ? DASH : `${sides.top10SharePct.toFixed(0)}%` },
                  ]
            }
          />
          <p className="tw-note tw-meta">
            Of the <b className="tw-fig">{sides.valued}</b> largest tracked holders this market returned. Not of {outcomeName(outcomes, 0)}, and not of the
            market: Polymarket has many more holders than any one page of them.
          </p>
        </Section>
      ) : null}
    </>
  );
}

/** One holder's settled record: the money over the count it was earned across. */
function RecordCell({ record }: { record: HolderRecord | null }) {
  if (!record || record.pnlUsd === null) return <span className="tw-meta">{DASH}</span>;
  return (
    <span className="tw-pm-record">
      <span className="tw-fig" data-sign={sign(record.pnlUsd)}>
        {usd(record.pnlUsd, true)}
      </span>
      <span className="tw-fig tw-meta">
        {record.marketsWon === null || record.marketsTraded === null
          ? `${rate(record.winRate)} win rate`
          : `${count(record.marketsWon)} of ${count(record.marketsTraded)} won · ${rate(record.winRate)}`}
      </span>
    </span>
  );
}

function HoldersTab({ panel }: { panel: PredictionPanel }) {
  // The backend already fetched 20; compact shows eight of them, expanded shows the table.
  const size = useCardSize();
  const expanded = size === "expanded";
  const all = panel.holders ?? [];
  const holders = all.slice(0, rowLimit(size, 8, 20));
  if (holders.length === 0) return <Empty>No holder data came back for this market.</Empty>;
  return (
    <Section title="Top holders" aside={`${holders.length} of ${all.length}`}>
      <table className="tw-table tw-pm-holders">
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
            {expanded ? (
              <th scope="col" className="tw-num">
                Now
              </th>
            ) : null}
            <th scope="col" className="tw-num">
              PnL here
            </th>
            {expanded ? (
              <th scope="col" className="tw-num">
                Settled record
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {holders.map((h) => (
            <tr key={h.key}>
              <td>
                <WalletLabel address={h.address} label={null} chain="polygon" />
              </td>
              <td>{h.side}</td>
              <td className="tw-fig tw-num">{h.position_size.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
              <td className="tw-fig tw-num">{cents(h.avg_entry_price)}</td>
              {expanded ? <td className="tw-fig tw-num">{cents(h.current_price)}</td> : null}
              <td className="tw-fig tw-num" data-sign={sign(h.unrealized_pnl_usd)}>
                {positionPnl(h.unrealized_pnl_usd)}
              </td>
              {expanded ? (
                <td className="tw-num">
                  <RecordCell record={h.record} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tw-note tw-meta">
        <b>PnL here</b> is this wallet&rsquo;s unrealized result on <em>this</em> market
        {expanded ? (
          <>
            ; <b>Settled record</b> is its realized Polymarket PnL across every market it has closed
          </>
        ) : (
          <> (expand the card for each wallet&rsquo;s settled record across every market)</>
        )}
        .{panel.historical ? " This market has settled, so both are final." : ""}
      </p>
    </Section>
  );
}

function TradesTab({ panel }: { panel: PredictionPanel }) {
  const all = panel.trades ?? [];
  const trades = all.slice(0, rowLimit(useCardSize(), 8, 15));
  if (trades.length === 0) return <Empty>No recent trades on this market.</Empty>;
  return (
    <Section title={panel.historical ? "Trades before settlement" : "Recent trades"} aside={`${trades.length} of ${all.length}`}>
      <ul className="tw-trade-list">
        {trades.map((t, i) => (
          <li key={i}>
            <span>
              {t.taker_action} {t.side}
            </span>
            {/* Size and price were already on the wire and dropped by the card. A trade is a
                quantity at a price; the dollar figure alone cannot say which. */}
            <span className="tw-fig">
              {t.size.toLocaleString("en-US", { maximumFractionDigits: 0 })} @ {cents(t.price)}
            </span>
            <span className="tw-fig">{usd(t.usdc_value)}</span>
            <span className="tw-fig tw-meta">{timeAgo(t.timestamp)}</span>
          </li>
        ))}
      </ul>
      <p className="tw-note tw-meta">
        The last <b className="tw-fig">{all.length}</b> trades this market returned, newest first. Not the market’s whole tape.
      </p>
    </Section>
  );
}

/**
 * One outcome's resting book: bids down the left in mint, asks down the right in red. The bar is
 * scaled on *cumulative* size, so its length reads as "this much is resting between the touch
 * and here" rather than as one level's size the eye has to add up. Prices are in cents, because
 * that is how a prediction market is read.
 */
function Book({ book, rows }: { book: OutcomeBook; rows: number }) {
  const bids = book.bids.slice(0, rows);
  const asks = book.asks.slice(0, rows);
  const max = Math.max(1, bids.at(-1)?.cumulative ?? 0, asks.at(-1)?.cumulative ?? 0);
  const side = (levels: typeof bids, kind: "bid" | "ask") => (
    <ul className="tw-book-side" data-side={kind} aria-label={`${book.outcome} ${kind === "bid" ? "bids" : "asks"}`}>
      {levels.map((l, i) => (
        <li key={i}>
          <i className="tw-book-bar" style={{ width: `${(l.cumulative / max) * 100}%` }} aria-hidden="true" />
          <span className="tw-fig tw-book-price">{cents(l.price)}</span>
          <span className="tw-fig tw-book-size">{l.size.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </li>
      ))}
    </ul>
  );
  const resting = (levels: typeof bids) => {
    const c = levels.at(-1)?.cumulative;
    return c === undefined ? null : Math.round(c);
  };
  return (
    <Section title={book.outcome} aside={book.bestBid !== null && book.bestAsk !== null ? `${cents(book.bestBid)} / ${cents(book.bestAsk)}` : null}>
      <div className="tw-book">
        {side(bids, "bid")}
        {side(asks, "ask")}
      </div>
      <p className="tw-note tw-meta">
        {book.spread !== null ? (
          <>
            Spread <b className="tw-fig">{cents(book.spread)}</b>.{" "}
          </>
        ) : null}
        <b className="tw-fig">{count(resting(bids))}</b> resting across the shown bids, <b className="tw-fig">{count(resting(asks))}</b> across the asks.
      </p>
    </Section>
  );
}

function BookTab({ depth, panel }: { depth: DepthState; panel: PredictionPanel }) {
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
        <Empty>
          {panel.historical
            ? "This market has settled, so nothing rests on its book."
            : "Nothing is resting on this market’s book right now."}
        </Empty>
        <SectionProblem reasons={book.errors} />
      </>
    );
  }
  return (
    <>
      {book.books.map((b) => (
        <Book key={b.outcome} book={b} rows={rowLimit(size, 6, 14)} />
      ))}
      <p className="tw-sources tw-meta">
        Data: Polymarket CLOB, both sides of each outcome token. Free — no Nansen credit.
        {book.snapshotIso ? <> Book read {timeAgo(book.snapshotIso)}; the price above it is Polymarket&rsquo;s hourly snapshot, so the two touches can differ.</> : null}
      </p>
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
  // The siblings came back with the market and cost nothing, so the tab is only absent when the
  // event genuinely has one market.
  if ((panel.options?.length ?? 0) > 0) {
    tabs.push({ id: "markets", label: "Markets", icon: <Icon icon={ListTree} size={14} />, content: <MarketPicker panel={panel} /> });
  }
  if (expanded) {
    tabs.push({
      id: "book",
      label: "Book",
      icon: <Icon icon={BookOpen} size={14} />,
      cost: depthCostLabel(PREDICTION_TAB_SECTIONS.book!),
      content: <BookTab depth={depth} panel={panel} />,
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
  // An ambiguous event slug resolves to no market and a list of them. Nothing was fetched for any
  // one, so there is no evidence to tab through and the picker is the whole body. Any other
  // marketless card (not found, lookup failed) keeps its tabs and their empty states.
  if (!panel.market && (panel.options?.length ?? 0) > 0) return <MarketPicker panel={panel} />;
  return (
    <>
      {panel.market ? (
        <MarketReadout market={panel.market} historical={panel.historical} picked={panel.targetOutcome} unknown={panel.unknownOutcome} />
      ) : null}
      <Tabs
        label="Evidence"
        tabs={predictionTabs(panel, hits, depth, expanded)}
        initial={initialTab}
        onSelect={(id) => {
          const sections = PREDICTION_TAB_SECTIONS[id];
          if (sections && sections.length > 0) onNeedSections?.(sections);
        }}
      />
    </>
  );
}
