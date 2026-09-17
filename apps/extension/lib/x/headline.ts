import type { PostIntelResponse } from "../api-types";

/** The X chip's text for a failed call. */
export function chipErrorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire backend offline";
  if (status === 429) return "Nansen credit cap reached";
  return error || "Tripwire check failed";
}

/** The chip's headline: the first hit's label, or the labeled-exit signal's label when nothing
 * hit (it is always computed, even for CLEAR, so a quiet token still says something). */
export function chipHeadline(data: PostIntelResponse): string {
  const firstHit = data.hits[0];
  if (firstHit) return firstHit.label;
  // UNCHECKED with a known reason, e.g. "Nansen credit cap reached".
  if (data.verdict === "UNCHECKED" && data.headline) return data.headline;
  const labeledExit = data.signals.find((s) => s.id === "labeled_exit_pct");
  return labeledExit?.label ?? "No signal";
}
