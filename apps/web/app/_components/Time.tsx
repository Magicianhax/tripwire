import { fullTime, relativeTime } from "../_lib/time";

/** Relative time in the cell, the exact UTC time on hover and for assistive tech. */
export function Time({ ts }: { ts: number }) {
  return (
    <time className="tw-data tw-nowrap" dateTime={new Date(ts).toISOString()} title={fullTime(ts)}>
      {relativeTime(ts)}
    </time>
  );
}
