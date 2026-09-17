import { useContext, useId, type ReactNode } from "react";
import { formatSignalValue, ruleClause, type Verdict } from "@tripwire/core";
import type { HitDto } from "../api-types";
import { usd } from "./format";
import { CloseIcon } from "./icons";
import { Plate } from "./Plate";
import { PopoverContext } from "./Popover";
import { ReplayBadge } from "./ReplayBadge";

/** Center-zero gauge on a tick scale: selling extends left of zero in warning red, buying
 * extends right in the text tone. Direction carries the sign, so colour is never the only cue. */
export function CenterZeroBar({ value, max }: { value: number | null; max: number }) {
  const v = value ?? 0;
  const width = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
  return (
    <div className="tw-gauge" aria-hidden="true">
      <i className="tw-gauge-fill" data-sign={v < 0 ? "neg" : "pos"} style={{ width: `${width / 2}%` }} />
      <svg className="tw-gauge-scale" viewBox="0 0 100 10" preserveAspectRatio="none" focusable="false">
        {[0, 25, 75, 100].map((x) => (
          <line key={x} x1={x} x2={x} y1={0} y2={3} vectorEffect="non-scaling-stroke" />
        ))}
        <line className="tw-gauge-zero" x1={50} x2={50} y1={0} y2={10} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** A labeled gauge row: label, center-zero gauge, right-aligned mono value. */
export function SegmentRow({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <div className="tw-seg">
      <span className="tw-seg-label">{label}</span>
      <CenterZeroBar value={value} max={max} />
      <span className={`tw-seg-value tw-mono${value !== null && value < 0 ? " tw-neg" : ""}`}>{usd(value, true)}</span>
    </div>
  );
}

/** A titled block inside a tab panel. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="tw-section" aria-label={title}>
      <h3 className="tw-section-title">
        <span>{title}</span>
        {aside ? <span className="tw-section-aside">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="tw-empty">{children}</p>;
}

/** "rule: > $100K" for a hit that carries its rule's comparison, else null. */
export function hitRuleClause(hit: HitDto): string | null {
  return hit.op !== undefined && typeof hit.threshold === "number" ? ruleClause({ signalId: hit.signalId, op: hit.op, threshold: hit.threshold }) : null;
}

/** The finding as a sentence: the signal's label ("Fresh wallets are 82% of buying"), falling
 * back to the rule text plus the formatted value when a label is missing. */
export function hitFinding(hit: HitDto): string {
  if (hit.label) return hit.label;
  return hit.value !== null ? `${hit.text} ${formatSignalValue(hit.signalId, hit.value)}` : hit.text;
}

/** The rules that fired: a square lamp mark (red for block rules, amber for warn rules), the
 * finding as the sentence, and the rule's threshold as a secondary mono clause. Shared by the
 * evidence card (all hits) and BlockScreen (max 3 + "+N more"). */
export function HitList({ hits, max, className = "tw-hits", id }: { hits: HitDto[]; max?: number; className?: string; id?: string }) {
  if (hits.length === 0) return null;
  const shown = typeof max === "number" ? hits.slice(0, max) : hits;
  const extra = hits.length - shown.length;
  return (
    <ul className={className} id={id}>
      {shown.map((h, i) => (
        <li key={`${h.ruleId}-${i}`} className="tw-hit" data-action={h.action}>
          <i className="tw-hit-mark" aria-hidden="true" />
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
    <footer className="tw-card-footer">
      <p className="tw-meta">
        Data: Nansen · <span className="tw-mono">{endpointCount}</span> endpoint{endpointCount === 1 ? "" : "s"}
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

/** The card's header row: annunciator plate, title (the dialog's label and first focus stop),
 * optional age, Replay tag, close. Inside a Popover the close button closes through it. */
export function CardHeader({ verdict, title, age, replay, onClose }: { verdict?: Verdict; title: string; age?: string | null; replay?: boolean; onClose?: () => void }) {
  const pop = useContext(PopoverContext);
  const ownId = useId();
  const headingId = pop?.headingId ?? ownId;
  const close = pop ? () => pop.close("close-button") : onClose;
  return (
    <header className="tw-card-header">
      {verdict ? <Plate verdict={verdict} className="tw-card-plate" /> : null}
      <h2 id={headingId} className="tw-card-title" tabIndex={-1}>
        {title}
      </h2>
      {age ? <span className="tw-card-age tw-mono">{age}</span> : null}
      <ReplayBadge replay={replay} />
      {close ? (
        <button type="button" className="tw-card-close" aria-label="Close" onClick={close}>
          <CloseIcon />
        </button>
      ) : null}
    </header>
  );
}

/** A card that only carries a status line (loading or a failed evidence fetch). */
export function CardMessage({ title, message, kind = "loading", replay }: { title: string; message: string; kind?: "loading" | "error"; replay?: boolean }) {
  return (
    <section className="tw-card">
      <CardHeader verdict={kind === "error" ? "UNCHECKED" : undefined} title={title} replay={replay} />
      <p className={kind === "error" ? "tw-card-message tw-dock-error" : "tw-card-message tw-dock-loading"} role="status">
        {message}
      </p>
    </section>
  );
}
