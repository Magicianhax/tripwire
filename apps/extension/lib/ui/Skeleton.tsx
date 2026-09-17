import { CircleAlert } from "lucide-react";
import { Icon } from "./icons";

/**
 * What a section looks like while its data is on its way.
 *
 * The rule the whole card follows: a section reserves the height its real content will take, so
 * nothing below it jumps when the numbers land, and the card never collapses and re-expands.
 * Shimmer is one 1.2s sweep, and `prefers-reduced-motion` turns it into a static block rather
 * than removing the placeholder.
 */

export type SkeletonShape = "row" | "gauge" | "tile" | "chart" | "table";

/** Heights per shape, matched to the real thing they stand in for (see theme.css). */
export function Skeleton({ shape = "row", rows = 3, label = "Loading" }: { shape?: SkeletonShape; rows?: number; label?: string }) {
  return (
    <div className="tw-skeleton" data-shape={shape} role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="tw-skeleton-row" data-shape={shape} />
      ))}
    </div>
  );
}

/**
 * A titled block that is still loading: the heading is real from the first frame (it says what
 * is coming), the body is the placeholder.
 */
export function SkeletonSection({ title, shape = "row", rows = 3 }: { title: string; shape?: SkeletonShape; rows?: number }) {
  return (
    <section className="tw-section" aria-label={title} aria-busy="true">
      <h3 className="tw-section-title">
        <span>{title}</span>
      </h3>
      <Skeleton shape={shape} rows={rows} label={`Loading ${title.toLowerCase()}`} />
    </section>
  );
}

/**
 * A section that failed. It replaces its own skeleton with the reason — the endpoint that
 * didn't answer — rather than a spinner that never ends.
 */
export function SectionProblem({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="tw-errors">
      {reasons.map((r, i) => (
        <li key={i}>
          <Icon icon={CircleAlert} size={14} />
          Unavailable: {r}
        </li>
      ))}
    </ul>
  );
}

/**
 * The card's own "still loading" announcement. Visually hidden, polite, and removed once the
 * card has something to say — a screen reader hears one sentence, not a skeleton per section.
 */
export function LoadingAnnouncement({ what }: { what: string }) {
  return (
    <p className="tw-sr-only" role="status" aria-live="polite">
      Loading {what}…
    </p>
  );
}
