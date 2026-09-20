export type Rect = { top: number; left: number; width: number; height: number };

const MIN_BLOCK_HEIGHT = 180;
/** The block screen shares the evidence card's width clamp. */
const BLOCK_WIDTH = 440;
const VIEWPORT_MARGIN = 16;

/** The BlockScreen overlay's rect: covers the anchor's own bounding rect, but never shrinks
 * below `minHeight` or below the block's measured `contentHeight` (its scrollHeight after
 * render, 0 before the first measure) -- it grows UPWARD (bottom edge pinned to the anchor's
 * bottom) so neither a short button nor a long hit list leaves the block clipped, and growth
 * never covers more of the page BELOW the button than the anchor already occupied.
 *
 * With `viewport`, it also widens to min(440px, viewport - 32px) (never narrower than the
 * anchor), centred on the anchor and clamped 16px inside the viewport, without ever leaving
 * part of the anchor uncovered: a narrow trade button no longer leaves its host card's edges
 * showing around the block. */
/** The smallest rect covering all of `rects`. */
function union(rects: Rect[]): Rect {
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

export function computeBlockRect(
  anchorRect: { top: number; left: number; width: number; height: number },
  minHeight = MIN_BLOCK_HEIGHT,
  contentHeight = 0,
  viewport?: { width: number },
  /** Other elements blocked in the same session (pump.fun's quick-buy chips). The block screen
   * covers everything it blocks: a chip left visible below the block reads as still clickable,
   * which is the exact impression this round exists to remove. */
  extraRects: Rect[] = [],
  /**
   * The trade button's own card: the box the block may not leave (`hostBox` in `lib/ui/fit.ts`,
   * the container `liftOutOfRow` walks to). Without it the block takes the 440px card width
   * centred on the anchor, which on jumper.xyz put it 45px outside the widget it was guarding —
   * a detached modal over the form rather than a barrier over the button.
   */
  container?: Rect,
): Rect {
  // Read field by field, never `{ ...anchorRect }`: a live `DOMRect` keeps its values in
  // prototype accessors, so spreading one yields `{}` and the whole union goes NaN.
  if (extraRects.length > 0) {
    anchorRect = union([
      { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height },
      ...extraRects,
    ]);
  }
  const height = Math.ceil(Math.max(anchorRect.height, minHeight, contentHeight));
  const growth = height - anchorRect.height;
  const top = anchorRect.top - growth;
  if (!viewport) return { top, left: anchorRect.left, width: anchorRect.width, height };

  const bound = container && container.width > 0 ? container : null;
  const width = Math.max(anchorRect.width, Math.min(BLOCK_WIDTH, bound?.width ?? BLOCK_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN));
  // Flush with the card's own left edge, rather than centred on whatever the button happens to
  // be; with no card to sit in, centred on the anchor as before.
  let left = bound ? bound.left : anchorRect.left + anchorRect.width / 2 - width / 2;
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width));
  // The block always covers the button it guards: pushed right for a button parked at the card's
  // right edge, pulled left for one that starts before it.
  left = Math.max(Math.min(left, anchorRect.left), anchorRect.left + anchorRect.width - width);
  // …and never outside the card, which outranks the two nudges above.
  if (bound) left = Math.max(bound.left, Math.min(left, bound.left + bound.width - width));
  return { top, left: Math.round(left), width, height };
}
