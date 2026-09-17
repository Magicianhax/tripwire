import type { HitDto } from "../api-types";
import { usd } from "./format";

/** Center-zero segment bar: negative = yellow extending left, positive = #EDEDED extending right. */
export function CenterZeroBar({ value, max }: { value: number | null; max: number }) {
  const v = value ?? 0;
  const width = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
  return (
    <div className="tw-bar" role="img" aria-hidden="true">
      {v < 0 ? <i className="tw-bar-neg" style={{ width: `${width}%` }} /> : <i className="tw-bar-pos" style={{ width: `${width}%` }} />}
    </div>
  );
}

/** A labeled center-zero segment row: label, bar, right-aligned mono value. */
export function SegmentRow({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <div className="tw-seg">
      <span className="tw-seg-label">{label}</span>
      <CenterZeroBar value={value} max={max} />
      <span className={`tw-seg-value tw-mono${value !== null && value < 0 ? " tw-neg" : ""}`}>{usd(value, true)}</span>
    </div>
  );
}

/** The rules that fired: square bullet, sentence, bold mono value. Shared by Panel (all hits)
 * and BlockScreen (max 3 + "+N more"). */
export function HitList({ hits, max, className = "tw-hits" }: { hits: HitDto[]; max?: number; className?: string }) {
  if (hits.length === 0) return null;
  const shown = typeof max === "number" ? hits.slice(0, max) : hits;
  const extra = hits.length - shown.length;
  return (
    <ul className={className}>
      {shown.map((h, i) => (
        <li key={`${h.ruleId}-${i}`} className="tw-hit">
          <em className="tw-hit-bullet" aria-hidden="true">
            ■
          </em>
          <span>
            {h.text}
            {h.value !== null ? <b className="tw-mono"> {usd(h.value, true)}</b> : null}
          </span>
        </li>
      ))}
      {extra > 0 ? <li className="tw-hit-more">+{extra} more</li> : null}
    </ul>
  );
}

/** "Data: Nansen · N endpoints" plus "Unavailable: <message>" per panel.errors entry. */
export function PanelFooter({ endpointCount, errors }: { endpointCount: number; errors: string[] }) {
  return (
    <footer className="tw-panel-footer">
      <p className="tw-meta">
        Data: Nansen · {endpointCount} endpoint{endpointCount === 1 ? "" : "s"}
      </p>
      {errors.length > 0 ? (
        <ul className="tw-errors">
          {errors.map((e, i) => (
            <li key={i}>Unavailable: {e}</li>
          ))}
        </ul>
      ) : null}
    </footer>
  );
}
