export type Rect = { top: number; left: number; width: number; height: number };

const MIN_BLOCK_HEIGHT = 180;

/** The BlockScreen overlay's rect: covers the anchor's own bounding rect, but never shrinks
 * below `minHeight` -- it grows UPWARD (bottom edge pinned to the anchor's bottom) so a short
 * button never leaves the overlay clipped, and so growth never covers more of the page BELOW
 * the button than the anchor already occupied. */
export function computeBlockRect(anchorRect: { top: number; left: number; width: number; height: number }, minHeight = MIN_BLOCK_HEIGHT): Rect {
  const height = Math.max(anchorRect.height, minHeight);
  const growth = height - anchorRect.height;
  return { top: anchorRect.top - growth, left: anchorRect.left, width: anchorRect.width, height };
}
