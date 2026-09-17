import type { Verdict } from "@tripwire/core";

export type DisplayMode = "block" | "strip" | "dock";
export type DisplayAction = "none" | "rebind" | "switch";

/**
 * Pure decision: given the current verdict and whether a tier-1 anchor is present, which
 * display should be showing right now? The single source of truth for both the initial
 * render (`runner.tsx`'s `render_`) and every subsequent unchanged-key tick
 * (`resyncAnchor()`), so the two can never disagree about what "correct" looks like.
 *
 * - Tier 2 (no anchor concept at all) -> always "dock".
 * - Tier 1 with no anchor found (not yet mounted, or lost) -> "dock" (fallback; nothing to
 *   block, but the verdict still needs to be visible somewhere).
 * - Tier 1, anchor present, TRIPWIRE and not unlocked -> "block".
 * - Tier 1, anchor present, anything else (CAUTION/UNCHECKED/CLEAR, or an unlocked TRIPWIRE)
 *   -> "strip". UNCHECKED never produces "block".
 */
export function decideDisplay({
  tier,
  verdict,
  anchorPresent,
  unlocked,
}: {
  tier: 1 | 2;
  verdict: Verdict;
  anchorPresent: boolean;
  unlocked: boolean;
}): DisplayMode {
  if (tier === 2) return "dock";
  if (!anchorPresent) return "dock";
  if (verdict === "TRIPWIRE" && !unlocked) return "block";
  return "strip";
}

/**
 * What to do about a freshly-recomputed `decision`, given what was showing before
 * (`prevDisplay`, `null` before the first render):
 * - Same mode, and it's "dock" -> "none": still nothing to anchor to, nothing changed.
 * - Same mode, and it's "block"/"strip" -> "rebind": the display mode itself didn't change,
 *   but the bound DOM node might have (a venue's SPA can replace the button without the
 *   verdict changing) -- the caller's `AnchorBinding.sync()` already handles that node-level
 *   swap in place; there's nothing higher-level to do.
 * - Different mode (including `null` -> anything, the very first render) -> "switch": a full
 *   teardown + re-route is needed -- e.g. the anchor just appeared (dock -> block/strip), was
 *   lost entirely (block/strip -> dock), or the verdict/unlock state flipped which anchored
 *   display applies (block <-> strip) while still anchored.
 */
export function nextAction(prevDisplay: DisplayMode | null, decision: DisplayMode): DisplayAction {
  if (prevDisplay === decision) return decision === "dock" ? "none" : "rebind";
  return "switch";
}
