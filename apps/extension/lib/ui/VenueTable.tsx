import { PERP_VENUES, perpVenueLogo, type PerpVenueId, type PerpVenueQuote } from "@tripwire/core";
import type { FundingPointDto } from "../api-types";
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

const signOfRate = (v: number | null) => (v === null || v === 0 ? "zero" : v < 0 ? "neg" : "pos");

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

export function VenueTable({ rows, unmapped }: { rows: PerpVenueQuote[]; unmapped: PerpVenueId[] }) {
  if (rows.length === 0) return null;
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
                <td className="tw-venue-error" colSpan={5}>
                  {r.error}
                </td>
              ) : (
                <>
                  <td className="tw-fig tw-num" data-sign={signOfRate(r.funding.per8h)}>
                    {fundingPct(r.funding.per8h)}
                    {/* The venue's own schedule, so a reader can see what was rebased. */}
                    <span className="tw-venue-interval tw-meta">{r.funding.intervalHours}h</span>
                  </td>
                  <td className="tw-fig tw-num" data-sign={signOfRate(r.funding.annualPct)}>
                    {annualPct(r.funding.annualPct)}
                  </td>
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
        rate means longs pay shorts.
      </p>
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
