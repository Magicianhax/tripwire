import type { Verdict } from "@tripwire/core";

export type DisplayMode = "block" | "strip" | "dock";
export type DisplayAction = "none" | "rebind" | "switch";

/**
 * Pure decision: given the current verdict and whether a tier-1 anchor is present, which
 * display should be showing right now? The single source of truth for both the initial
 * render (`runner.tsx`'s `render_`) and every subsequent unchanged-key tick
 * (`resyncAnchor()`), so the two can never disagree about what "correct" looks like.
 *
 * - Tier 1, trade button present, TRIPWIRE and not unlocked -> "block". The block screen binds
 *   to the trade button and nothing else, whether or not that button is where the strip would
 *   have gone: a block has to cover what it blocks.
 * - A qualifying placement (`lib/adapters/placement.ts`: visible, out of any recycled grid, and
 *   inside the first viewport at the page's default scroll) -> "strip". For tier 1 that
 *   placement usually IS the trade button; for tier 2, and for a tier-1 page whose form has no
 *   pressable primary, it is the venue's own header.
 * - Nothing qualified -> "dock". The fallback, and the only case where the verdict is not
 *   attached to something the user is already looking at — which is why the Dock earns an
 *   entrance and a verdict-coloured edge.
 *
 * UNCHECKED never produces "block".
 */
export function decideDisplay({
  tier,
  verdict,
  anchorPresent,
  placementPresent,
  unlocked,
}: {
  tier: 1 | 2;
  verdict: Verdict;
  /** A tier-1 trade button for the blocker to bind to. */
  anchorPresent: boolean;
  /** An anchor the strip may be mounted to; defaults to `anchorPresent` for callers that have
   * no placement of their own (the tier-1 trade button is always the first candidate). */
  placementPresent?: boolean;
  unlocked: boolean;
}): DisplayMode {
  const placed = placementPresent ?? anchorPresent;
  if (tier === 1 && anchorPresent && verdict === "TRIPWIRE" && !unlocked) return "block";
  return placed ? "strip" : "dock";
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
