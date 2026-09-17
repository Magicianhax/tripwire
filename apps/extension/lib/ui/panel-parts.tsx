import { formatSignalValue, ruleClause } from "@tripwire/core";
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

/** "rule: > $100K" for a hit that carries its rule's comparison, else null. */
export function hitRuleClause(hit: HitDto): string | null {
  return hit.op !== undefined && typeof hit.threshold === "number" ? ruleClause({ signalId: hit.signalId, op: hit.op, threshold: hit.threshold }) : null;
}

/** The finding as a sentence: the signal's label ("Fresh wallets are 82% of buying"), falling
 * back to the rule text plus the formatted value when a label is missing. */
function hitFinding(hit: HitDto): string {
  if (hit.label) return hit.label;
  return hit.value !== null ? `${hit.text} ${formatSignalValue(hit.signalId, hit.value)}` : hit.text;
}

/** The rules that fired: square bullet, the finding (signal label) as the sentence, and the
 * rule's threshold as a secondary mono clause. Shared by Panel (all hits) and BlockScreen
 * (max 3 + "+N more"). */
export function HitList({ hits, max, className = "tw-hits", id }: { hits: HitDto[]; max?: number; className?: string; id?: string }) {
  if (hits.length === 0) return null;
  const shown = typeof max === "number" ? hits.slice(0, max) : hits;
  const extra = hits.length - shown.length;
  return (
    <ul className={className} id={id}>
      {shown.map((h, i) => (
        <li key={`${h.ruleId}-${i}`} className="tw-hit">
          <em className="tw-hit-bullet" aria-hidden="true">
            ■
          </em>
          <span className="tw-hit-text">
            <span className="tw-hit-finding">{hitFinding(h)}</span>
            {hitRuleClause(h) ? <span className="tw-hit-rule tw-mono">{hitRuleClause(h)}</span> : null}
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
