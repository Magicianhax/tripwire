/** Pure geometry for the floating instrument card (no DOM access, so it's unit-testable). */

export type AnchorRect = { top: number; left: number; bottom: number; right: number; width: number; height: number };
export type Viewport = { width: number; height: number };

export type PopoverPlacement = {
  top: number;
  left: number;
  width: number;
  /** The card's height limit: min(70vh, 640px), and never taller than the room on its side. */
  maxHeight: number;
  side: "below" | "above";
  /** transform-origin inside the card, so it scales out of the anchor. */
  originX: number;
  originY: number;
  /** Narrow viewport: render as a bottom sheet (CSS owns the geometry). */
  sheet: boolean;
};

export const POPOVER_MARGIN = 16;
export const POPOVER_GAP = 8;
const MAX_WIDTH = 440;
const MAX_HEIGHT = 640;
const MIN_USEFUL_HEIGHT = 160;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** 440px, never wider than the viewport minus a 16px margin on each side. */
export function popoverWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(MAX_WIDTH, viewportWidth - 2 * POPOVER_MARGIN));
}

export function popoverMaxHeight(viewportHeight: number): number {
  return Math.min(Math.round(viewportHeight * 0.7), MAX_HEIGHT);
}

/**
 * Places a card of natural height `size.height` next to `anchor`: below it when it fits (or
 * when below still has more room than above), otherwise flipped above. Horizontally it starts
 * at the anchor's left edge and is clamped inside the 16px viewport margin.
 */
export function computePopoverPosition(
  anchor: AnchorRect,
  size: { height: number },
  viewport: Viewport,
  options: { sheetBelow?: number } = {},
): PopoverPlacement {
  const width = popoverWidth(viewport.width);
  const cap = popoverMaxHeight(viewport.height);
  const sheet = options.sheetBelow !== undefined && viewport.width < options.sheetBelow;

  const spaceBelow = viewport.height - POPOVER_MARGIN - (anchor.bottom + POPOVER_GAP);
  const spaceAbove = anchor.top - POPOVER_GAP - POPOVER_MARGIN;
  const wanted = Math.min(size.height, cap);
  const side = wanted <= spaceBelow || spaceBelow >= spaceAbove ? "below" : "above";
  const room = side === "below" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(Math.min(cap, room), Math.min(cap, MIN_USEFUL_HEIGHT));
  const height = Math.min(size.height, maxHeight);

  let top = side === "below" ? anchor.bottom + POPOVER_GAP : anchor.top - POPOVER_GAP - height;
  top = clamp(top, POPOVER_MARGIN, Math.max(POPOVER_MARGIN, viewport.height - POPOVER_MARGIN - height));
  const left = clamp(anchor.left, POPOVER_MARGIN, Math.max(POPOVER_MARGIN, viewport.width - POPOVER_MARGIN - width));
  const originX = clamp(anchor.left + anchor.width / 2 - left, 0, width);
  const originY = side === "below" ? 0 : height;

  return { top, left, width, maxHeight, side, originX, originY, sheet };
}

/** True once the anchor has scrolled completely out of the viewport. */
export function anchorOutOfView(anchor: AnchorRect, viewport: Viewport): boolean {
  return anchor.bottom <= 0 || anchor.top >= viewport.height || anchor.right <= 0 || anchor.left >= viewport.width;
}
