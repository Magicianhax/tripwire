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
export function computeBlockRect(
  anchorRect: { top: number; left: number; width: number; height: number },
  minHeight = MIN_BLOCK_HEIGHT,
  contentHeight = 0,
  viewport?: { width: number },
): Rect {
  const height = Math.ceil(Math.max(anchorRect.height, minHeight, contentHeight));
  const growth = height - anchorRect.height;
  const top = anchorRect.top - growth;
  if (!viewport) return { top, left: anchorRect.left, width: anchorRect.width, height };

  const width = Math.max(anchorRect.width, Math.min(BLOCK_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN));
  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width));
  left = Math.max(Math.min(left, anchorRect.left), anchorRect.left + anchorRect.width - width);
  return { top, left: Math.round(left), width, height };
}
