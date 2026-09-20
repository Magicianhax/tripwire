import { isVisible } from "./dom";
import type { AnchorCandidate, AnchorRole, Placement, VenueAdapter } from "./types";

/**
 * Where the verdict gets mounted, and the rules that make that place findable.
 *
 * The user's report: "on dexscreener positions of banners we are showing are on odd places like
 * someone cannot catch without having good eye". The verdict IS the product — a technically
 * valid mount in a corner of a dense page is a failure, not a detail. So an anchor has to earn
 * its place against four conditions, in this order (`docs/briefs/placement-visibility.md`):
 *
 * 1. It exists and is rendered (`isVisible`).
 * 2. It is not inside a scrolling data grid or a virtualised list — those rows are recycled
 *    under us and nobody reads a verdict that scrolls away with row 47.
 * 3. Its box is inside the FIRST viewport at the page's DEFAULT scroll, measured in document
 *    coordinates, so an anchor the user would have to scroll to never qualifies.
 * 4. Earlier candidates win: the trade button, then the trade-panel header, then the token
 *    identity header, then the page header.
 *
 * Nothing qualifying is a real answer: the caller falls back to the Dock, which Round 1.6 gives
 * an entrance and a verdict-coloured edge precisely because it is the fallback.
 */

export type Rect = { top: number; left: number; width: number; height: number };
export type Viewport = { width: number; height: number; scrollX: number; scrollY: number };

/**
 * Geometry, injected. Every rule here is about where an element sits, and happy-dom has no
 * layout — so the measurements arrive through this rather than being read off the DOM, and the
 * unit suite states a venue's real 1440x900 numbers instead of pretending to measure them.
 */
export type PlacementProbe = {
  rect(el: Element): Rect;
  viewport(): Viewport;
};

/** How much of an anchor has to be inside the first viewport to count: one hit target. */
export const MIN_VISIBLE_PX = 24;

export const domProbe: PlacementProbe = {
  rect(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  },
  viewport() {
    return { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY };
  },
};

/** An all-zero box means "this environment does not do layout" (happy-dom, a display-less test
 * document), not "this element is a point at the origin". Treated as unmeasured, so the
 * visibility check alone decides — a real rendered element in a browser never reports all four
 * as zero while `isVisible()` is true. */
function isUnmeasured(rect: Rect): boolean {
  return rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0;
}

/**
 * Is this box inside the first screenful, for a user who has just arrived at the page?
 *
 * Document coordinates, not viewport ones: `rect.top + scrollY`. Reading the viewport box alone
 * would call an element "visible" because the page happens to be scrolled to it, which is the
 * opposite of the question. A box may straddle the fold as long as `MIN_VISIBLE_PX` of it is
 * above it.
 */
export function isInFirstViewport(rect: Rect, viewport: Viewport): boolean {
  if (isUnmeasured(rect)) return true;
  if (rect.width <= 0 || rect.height <= 0) return false;
  const top = rect.top + viewport.scrollY;
  const left = rect.left + viewport.scrollX;
  if (top < 0 || left < 0 || left >= viewport.width) return false;
  return top + Math.min(rect.height, MIN_VISIBLE_PX) <= viewport.height;
}

/**
 * Containers whose children are recycled, re-ordered or re-rendered on every tick.
 *
 * Structural signals only — no "is this a scroll container" heuristic, which would also reject
 * a trade form that happens to live in a scroll pane and would have cost us anchors that work.
 * `data-virtuoso-scroller` / `data-testid="virtuoso-scroller"` were read off the live
 * DexScreener transactions pane on 2026-09-20.
 */
const VOLATILE_SELECTOR = [
  "[data-virtuoso-scroller]",
  '[data-testid="virtuoso-scroller"]',
  "[data-virtual-list]",
  '[role="grid"]',
  '[role="row"]',
  '[role="rowgroup"]',
  '[role="listbox"]',
  '[role="feed"]',
  "table",
  "thead",
  "tbody",
  "tr",
].join(",");

export function isInVolatileContainer(el: Element): boolean {
  return el.closest(VOLATILE_SELECTOR) !== null;
}

/** A strip sits above the control it guards and below the header it describes. */
export function defaultPlace(role: AnchorRole): "before" | "after" {
  return role === "trade-button" ? "before" : "after";
}

/**
 * The ordered candidate list for an adapter. A tier-1 adapter's `anchor()` — the trade button
 * Round 1.4 and everything before it tuned, and the only thing the blocker may ever bind to —
 * always leads, so declaring `anchorPriority` can only ever ADD fallbacks behind it.
 */
export function anchorCandidates(adapter: VenueAdapter): AnchorCandidate[] {
  const declared = adapter.anchorPriority ?? [];
  if (adapter.tier !== 1 || !adapter.anchor) return declared;
  return [{ role: "trade-button", find: (doc, url) => adapter.anchor?.(doc, url) ?? null }, ...declared];
}

/** The first candidate that exists, is visible, is not inside a recycled container, and is in
 * the first viewport. `null` means "nothing on this page is worth mounting to" — the Dock. */
export function pickPlacement(candidates: AnchorCandidate[], doc: Document, url?: URL, probe: PlacementProbe = domProbe): Placement | null {
  const viewport = probe.viewport();
  for (const candidate of candidates) {
    let element: HTMLElement | null = null;
    // A venue's DOM is hostile: a selector that throws must cost us the candidate, not the page.
    try {
      element = candidate.find(doc, url);
    } catch {
      element = null;
    }
    if (!element || !element.isConnected) continue;
    if (!isVisible(element)) continue;
    if (isInVolatileContainer(element)) continue;
    if (!isInFirstViewport(probe.rect(element), viewport)) continue;
    return { role: candidate.role, place: candidate.place ?? defaultPlace(candidate.role), element };
  }
  return null;
}

export function placementFor(adapter: VenueAdapter, doc: Document, url?: URL, probe: PlacementProbe = domProbe): Placement | null {
  return pickPlacement(anchorCandidates(adapter), doc, url, probe);
}
