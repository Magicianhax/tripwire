import type { PostIntelResponse } from "../api-types";

/** The X chip's text for a failed call. */
export function chipErrorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire backend offline";
  if (status === 429) return "Nansen credit cap reached";
  return error || "Tripwire check failed";
}

/** The chip's headline: the first hit's label, or the exit_pressure signal's label when
 * nothing hit (there's always at least an exit_pressure signal computed, even for CLEAR). */
export function chipHeadline(data: PostIntelResponse): string {
  const firstHit = data.hits[0];
  if (firstHit) return firstHit.label;
  // UNCHECKED with a known reason, e.g. "Nansen credit cap reached".
  if (data.verdict === "UNCHECKED" && data.headline) return data.headline;
  const exitPressure = data.signals.find((s) => s.id === "exit_pressure");
  return exitPressure?.label ?? "No signal";
}
