import { countdownLabel, fundingCapPressure, oiTrend, PERP_VENUES, perpVenueLogo, type OiHistorySeries, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import { useEffect, useState } from "react";
import type { FundingPointDto } from "../api-types";
import { useCardSize } from "./card-size";
import { usd } from "./format";
import { BrandMark } from "./Logo";

/**
 * "Funding & OI across venues": the same coin on Hyperliquid, Binance, Bybit, OKX and dYdX.
 *
 * The one thing this table has to get right is that the venues do not quote funding the same
 * way. Hyperliquid and dYdX pay hourly; the others every eight hours, except when they don't.
 * Every row is therefore printed as the 8-hour figure with the venue's own interval stated
 * beside it, and annualised from that interval — so two numbers in the same column mean the
 * same thing, and the reader can see why.
 *
 * Round 2.5 added what the venues were already sending, under one layout rule: the table is six
 * columns inside a 440px card, so **one** new column ships, and only where there is room for it.
 * Basis takes that column in the expanded card. The next funding time and the venue's own
 * funding cap ride under the funding figure, which is what they are about. The 24h change was
 * left out on purpose: it is a property of the coin rather than of the venue, and the card
 * already states it once under "The market right now".
 */

/** Funding as a percentage per 8h. Small numbers, so 4 decimals, always signed. */
function fundingPct(per8h: number | null): string {
  if (per8h === null) return "—";
  const v = per8h * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(4)}%`;
}

function annualPct(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

/** Mark against the venue's own index or oracle. Basis points, because the numbers are single
 * digits in dollars on a $2,450 contract and would read as noise at two decimal places. */
function basisBps(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

const signOfRate = (v: number | null) => (v === null || v === 0 ? "zero" : v < 0 ? "neg" : "pos");

/**
 * A clock the card owns, ticking every 15 seconds.
 *
 * The funding countdown has to come from the reader's own clock: the backend caches each
 * venue's answer for 60 seconds and a popover stays open for minutes, so a "time remaining"
 * captured at fetch time would be stale the moment it was read. Fifteen seconds is enough for a
 * minute-resolution label and cheap enough to leave running; the interval is cleared on unmount.
 */
function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** At what share of its own published bound a funding rate starts being worth mentioning. Below
 * this a cap is trivia; above it, funding is about to stop tracking the market. */
const CAP_PRESSURE_FLOOR = 0.5;

function VenueName({ venue, symbol }: { venue: PerpVenueId; symbol: string }) {
  const logo = perpVenueLogo(venue);
  return (
    <span className="tw-venue-name">
      {logo ? <BrandMark logo={logo} size={16} /> : null}
      <span className="tw-venue-label">
        {PERP_VENUES[venue].name}
        <span className="tw-venue-symbol tw-mono">{symbol}</span>
      </span>
    </span>
  );
}

/**
 * The funding cell: the rate, the venue's own schedule, when the next payment lands, and — only
 * when it is close enough to matter — how far the rate has travelled toward the venue's own cap.
 */
function FundingCell({ row, now }: { row: PerpVenueQuote; now: number }) {
  const countdown = countdownLabel(row.nextFundingMs, now);
  const pressure = fundingCapPressure(row.funding.raw, row.fundingCap);
  const bound = row.fundingCap && row.funding.raw !== null && row.funding.raw < 0 ? row.fundingCap.lower : row.fundingCap?.upper;
  return (
    <td className="tw-fig tw-num" data-sign={signOfRate(row.funding.per8h)}>
      {fundingPct(row.funding.per8h)}
      {/* The venue's own schedule, so a reader can see what was rebased, and its own next
          payment, so "funding costs this much" has a "starting when" beside it. */}
      <span className="tw-venue-interval tw-meta">
        {row.funding.intervalHours}h{countdown ? ` · ${countdown}` : ""}
      </span>
      {pressure !== null && pressure >= CAP_PRESSURE_FLOOR && bound !== undefined ? (
        <span className="tw-venue-cap tw-meta">
          {(pressure * 100).toFixed(0)}% of its {`${Math.abs(bound * 100).toFixed(3)}%`} cap
        </span>
      ) : null}
    </td>
  );
}

export function VenueTable({ rows, unmapped }: { rows: PerpVenueQuote[]; unmapped: PerpVenueId[] }) {
  const size = useCardSize();
  const now = useNow();
  // One new column, and only where there is room: the compact card is already six columns wide
  // inside 440px (non-negotiable #5), and the expanded card gives this table both tracks.
  const showBasis = size === "expanded";
  const columns = showBasis ? 6 : 5;
  if (rows.length === 0) return null;
  const basisVenues = rows.filter((r) => !r.error && PERP_VENUES[r.venue].basisReference !== null).map((r) => PERP_VENUES[r.venue].name);
  return (
    <>
      <table className="tw-table tw-venue-table">
        <thead>
          <tr>
            <th scope="col">Venue</th>
            <th scope="col" className="tw-num">
              Funding 8h
            </th>
            <th scope="col" className="tw-num">
              Annualised
            </th>
            {showBasis ? (
              <th scope="col" className="tw-num">
                Basis bps
              </th>
            ) : null}
            <th scope="col" className="tw-num">
              Open interest
            </th>
            <th scope="col" className="tw-num">
              24h volume
            </th>
            <th scope="col" className="tw-num">
              Long accts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.venue} data-missing={r.error ? "" : undefined}>
              <th scope="row">
                <VenueName venue={r.venue} symbol={r.symbol} />
              </th>
              {r.error ? (
                <td className="tw-venue-error" colSpan={columns}>
                  {r.error}
                </td>
              ) : (
                <>
                  <FundingCell row={r} now={now} />
                  <td className="tw-fig tw-num" data-sign={signOfRate(r.funding.annualPct)}>
                    {annualPct(r.funding.annualPct)}
                  </td>
                  {showBasis ? (
                    <td className="tw-fig tw-num" data-sign={signOfRate(r.basisBps)}>
                      {basisBps(r.basisBps)}
                    </td>
                  ) : null}
                  <td className="tw-fig tw-num">{usd(r.openInterestUsd)}</td>
                  <td className="tw-fig tw-num">{usd(r.volume24hUsd)}</td>
                  <td className="tw-fig tw-num">{r.longAccountShare === null ? "—" : `${(r.longAccountShare * 100).toFixed(0)}%`}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tw-note tw-meta">
        Funding is shown per 8 hours, rebased from each venue&rsquo;s own interval (the small figure), and annualised from that same schedule. A positive
        rate means longs pay shorts, and the time beside the interval is that venue&rsquo;s own next payment.
      </p>
      {showBasis ? (
        <p className="tw-note tw-meta">
          Basis is mark against each venue&rsquo;s own fair-value price{basisVenues.length > 0 ? ` (${basisVenues.join(", ")})` : ""}, in basis points. OKX
          and dYdX publish only one of the two prices, so their cells stay blank rather than carrying a differently computed figure.
        </p>
      ) : null}
      {unmapped.length > 0 ? (
        <p className="tw-note tw-meta">No contract for this coin on {unmapped.map((v) => PERP_VENUES[v].name).join(", ")}.</p>
      ) : null}
    </>
  );
}

/**
 * Funding over the last two days, one bar per hourly payment, drawn as the 8h-equivalent so the
 * scale matches the table above it. Longs-pay bars sit above the zero rule in red, shorts-pay
 * below it in mint: the colour says who is paying, which is the only thing this chart is for.
 */
export function FundingHistory({ points, height = 56 }: { points: FundingPointDto[]; height?: number }) {
  if (points.length < 2) return null;
  const W = 400;
  const H = height;
  const max = Math.max(...points.map((p) => Math.abs(p.per8h)), 1e-9);
  const barWidth = W / points.length;
  const mid = H / 2;
  const latest = points[points.length - 1]!;
  const hours = Math.max(1, Math.round((latest.timeMs - points[0]!.timeMs) / 3_600_000));

  return (
    <div className="tw-funding-history">
      <svg
        className="tw-funding-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Funding over the last ${hours} hours; latest ${(latest.per8h * 100).toFixed(4)} percent per 8 hours`}
      >
        <line className="tw-funding-zero" x1={0} x2={W} y1={mid} y2={mid} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => {
          const h = (Math.abs(p.per8h) / max) * (mid - 2);
          const positive = p.per8h >= 0;
          return (
            <rect
              key={p.timeMs}
              className="tw-funding-bar"
              data-sign={positive ? "pos" : "neg"}
              x={i * barWidth + barWidth * 0.15}
              y={positive ? mid - h : mid}
              width={Math.max(0.5, barWidth * 0.7)}
              height={Math.max(0.5, h)}
            />
          );
        })}
      </svg>
      <p className="tw-legend">
        <span>
          <i className="tw-key tw-key-short" aria-hidden="true" />
          Longs pay
        </span>
        <span>
          <i className="tw-key tw-key-long" aria-hidden="true" />
          Shorts pay
        </span>
        <span className="tw-meta">last {hours}h, per 8h</span>
      </p>
    </div>
  );
}

/**
 * Open interest over the last day (Round 2.5).
 *
 * Every other row of the venue table publishes a single current figure; Binance is the only one
 * that publishes a history, so this chart carries **Binance's name and Binance's symbol**
 * throughout. Labelling it with the coin alone would put Binance's delta under Hyperliquid's
 * open-interest figure, which is the same mistake in shape as quoting two venues' open interest
 * under two different conventions.
 *
 * The span is measured from the points that actually came back, not from the window asked for.
 */
export function OpenInterestHistory({ series, height = 56 }: { series: OiHistorySeries; height?: number }) {
  const trend = oiTrend(series.points);
  if (!trend) return null;
  const W = 400;
  const H = height;
  const values = series.points.map((p) => p.oiUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // A floor and a ceiling inside the box, so a flat day is a flat line rather than a full-height
  // one and the largest reading does not touch the edge.
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const x = (i: number) => (series.points.length === 1 ? W / 2 : (i / (series.points.length - 1)) * W);
  const line = series.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(p.oiUsd).toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const venueName = PERP_VENUES[series.venue].name;
  const change = trend.changePct;

  return (
    <div className="tw-oi-history">
      <svg
        className="tw-oi-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${venueName} open interest in ${series.symbol} over the last ${trend.hours} hours, ${usd(trend.first)} to ${usd(trend.last)}`}
      >
        <path className="tw-oi-area" d={area} />
        <path className="tw-oi-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="tw-legend">
        <span>
          <b className="tw-fig">{usd(trend.last)}</b> now
        </span>
        <span className="tw-fig" data-sign={signOfRate(change)}>
          {change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`} over {trend.hours}h
        </span>
        <span className="tw-meta">
          {venueName} {series.symbol}, {series.period} buckets
        </span>
      </p>
    </div>
  );
}
