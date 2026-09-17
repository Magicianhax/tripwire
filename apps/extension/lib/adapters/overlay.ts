export type Rect = { top: number; left: number; width: number; height: number };

const MIN_BLOCK_HEIGHT = 180;

/** The BlockScreen overlay's rect: covers the anchor's own bounding rect, but never shrinks
 * below `minHeight` or below the block's measured `contentHeight` (its scrollHeight after
 * render, 0 before the first measure) -- it grows UPWARD (bottom edge pinned to the anchor's
 * bottom) so neither a short button nor a long hit list leaves the block clipped, and growth
 * never covers more of the page BELOW the button than the anchor already occupied. */
export function computeBlockRect(
  anchorRect: { top: number; left: number; width: number; height: number },
  minHeight = MIN_BLOCK_HEIGHT,
  contentHeight = 0,
): Rect {
  const height = Math.ceil(Math.max(anchorRect.height, minHeight, contentHeight));
  const growth = height - anchorRect.height;
  return { top: anchorRect.top - growth, left: anchorRect.left, width: anchorRect.width, height };
}
