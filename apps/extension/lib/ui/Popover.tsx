import { createContext, useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import type { CardSize } from "../card-size";
import { deepActiveElement, focusableIn } from "./focus";
import { anchorOutOfView, computePopoverPosition, popoverMaxHeight, type AnchorRect } from "./popover-position";

export type PopoverCloseReason = "escape" | "outside" | "close-button" | "scroll-out" | "replaced";

/** What the card's contents need from the frame: the id their heading must carry (the dialog
 * is labelled by it and focus lands on it), a close request that keeps focus bookkeeping, and
 * the size control the header's expand button drives. */
export const PopoverContext = createContext<{
  headingId: string;
  close(reason: PopoverCloseReason): void;
  size: CardSize;
  onToggleSize?: () => void;
} | null>(null);

export type PopoverProps = {
  /** The element the card opens beside (chip, dock chip, Details/evidence button). Clicks on
   * it never count as "outside", so its own click handler can toggle the card closed. `null`
   * pins the card to the top-right corner instead. */
  anchor: Element | null;
  onClose: (reason: PopoverCloseReason) => void;
  /** Where focus goes back to after Escape or the close button. */
  returnFocus?: () => HTMLElement | null | undefined;
  /** Below this viewport width the card becomes a bottom sheet (venue evidence and the dock). */
  sheetBelow?: number;
  /** "side" opens beside the anchor (right, else left) before trying below/above: used for the
   * block screen, so its evidence never covers the warning it explains. */
  prefer?: "vertical" | "side";
  /** Close once the anchor scrolls fully out of the viewport (default true). */
  closeWhenAnchorHidden?: boolean;
  verdict?: string;
  className?: string;
  /**
   * "compact" is the anchored card. "expanded" is a centred overlay on a dimmed backdrop, sized
   * by CSS at min(1280px, 80vw) x min(880px, 80vh), with focus trapped inside it. Anchor
   * geometry is skipped entirely while expanded: it has no anchor to follow.
   */
  size?: CardSize;
  /** Flips between the two. Omitted on surfaces that only ever show one. */
  onToggleSize?: () => void;
  children: ReactNode;
};

/** At most one card is open per content-script world. */
let active: { token: object; replace(): void } | null = null;

const MARGIN = 16;

function isLaidOut(rect: AnchorRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

/**
 * The floating instrument card frame: a non-modal dialog positioned `fixed` beside its anchor
 * (flips above when there's no room below, clamped 16px inside the viewport), following scroll
 * and resize on the next animation frame. Closes on Escape, a pointerdown outside, the close
 * button, or its anchor scrolling out of view; opening another card closes this one.
 *
 * Geometry is written straight to the element's style inside a layout effect, before the first
 * paint, so the entrance animation always starts from the right place and origin.
 */
export function Popover({
  anchor,
  onClose,
  returnFocus,
  sheetBelow,
  prefer,
  closeWhenAnchorHidden = true,
  verdict,
  className,
  size = "compact",
  onToggleSize,
  children,
}: PopoverProps) {
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const expanded = size === "expanded";
  const reasonRef = useRef<PopoverCloseReason | null>(null);
  const focusInside = useRef(false);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  onCloseRef.current = onClose;
  returnFocusRef.current = returnFocus;

  const close = useCallback((reason: PopoverCloseReason) => {
    if (reasonRef.current) return; // already closing
    reasonRef.current = reason;
    onCloseRef.current(reason);
  }, []);

  // Native top-layer placement escapes host transforms, clipping, and arbitrarily high
  // stacking contexts. Keep our existing anchor geometry and dismissal/focus contract.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof layer.showPopover !== "function") return;
    try { layer.showPopover(); }
    catch { layer.removeAttribute("popover"); }
    return () => {
      if (layer.isConnected && layer.matches(":popover-open")) layer.hidePopover();
    };
  }, []);

  const reposition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    // Expanded is centred by CSS and has no anchor to follow: clear every inline geometry the
    // anchored mode wrote, so collapsing back later starts from a clean element.
    if (expanded) {
      el.style.top = el.style.left = el.style.right = el.style.width = el.style.maxHeight = el.style.transformOrigin = "";
      delete el.dataset.sheet;
      delete el.dataset.side;
      return;
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    let rect: AnchorRect;
    if (anchor) {
      if (!anchor.isConnected) {
        if (closeWhenAnchorHidden) close("scroll-out");
        return;
      }
      rect = anchor.getBoundingClientRect();
      if (closeWhenAnchorHidden && isLaidOut(rect) && anchorOutOfView(rect, viewport)) {
        close("scroll-out");
        return;
      }
    } else {
      const x = viewport.width - MARGIN;
      rect = { top: 88, bottom: 88, left: x, right: x, width: 0, height: 0 };
    }

    // Natural height at the width it will render: drop the cap for one synchronous read.
    const probe = computePopoverPosition(rect, { height: 0 }, viewport, { sheetBelow, prefer });
    el.style.width = probe.sheet ? "" : `${probe.width}px`;
    el.style.maxHeight = "none";
    const height = el.offsetHeight;
    const p = computePopoverPosition(rect, { height }, viewport, { sheetBelow, prefer });

    if (p.sheet) {
      el.dataset.sheet = "";
      el.style.top = el.style.left = el.style.right = el.style.width = el.style.transformOrigin = "";
      el.style.maxHeight = `${popoverMaxHeight(viewport.height)}px`;
      return;
    }
    delete el.dataset.sheet;
    el.dataset.side = p.side;
    el.style.top = `${Math.round(p.top)}px`;
    el.style.left = `${Math.round(p.left)}px`;
    el.style.right = "auto";
    el.style.width = `${p.width}px`;
    el.style.maxHeight = `${p.maxHeight}px`;
    el.style.transformOrigin = `${Math.round(p.originX)}px ${Math.round(p.originY)}px`;
  }, [anchor, sheetBelow, prefer, closeWhenAnchorHidden, close, expanded]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Follow the anchor: one reposition per frame at most, on any scroll, resize or content size change.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        reposition();
      });
    };
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (rootRef.current) observer?.observe(rootRef.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [reposition]);

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const path = event.composedPath();
      if (rootRef.current && path.includes(rootRef.current)) return;
      if (anchor && path.includes(anchor)) return;
      close("outside");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close("escape");
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, close]);

  // Single open card.
  useEffect(() => {
    const token = {};
    const previous = active;
    active = { token, replace: () => close("replaced") };
    previous?.replace();
    return () => {
      if (active?.token === token) active = null;
    };
  }, [close]);

  // Focus: onto the heading when the card opens, back to the trigger when it closes from inside.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onFocusIn = () => {
      focusInside.current = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && !root.contains(next)) focusInside.current = false;
    };
    // Native keypress too: React only synthesizes it for character keys it knows.
    const stopKeypress = (event: Event) => event.stopPropagation();
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keypress", stopKeypress);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keypress", stopKeypress);
      const reason = reasonRef.current;
      const focused = deepActiveElement();
      if (focused && root.contains(focused)) focusInside.current = true;
      const nothingFocused = document.activeElement === null || document.activeElement === document.body;
      const giveBack =
        reason === "close-button" || (reason === "escape" && (focusInside.current || nothingFocused)) || (reason === null && focusInside.current);
      if (!giveBack) return;
      const target = returnFocusRef.current?.();
      if (!target?.isConnected) return;
      target.focus({ preventScroll: true });
      // The card's shadow host is removed right after this cleanup; re-assert focus if that
      // removal dropped it to <body>.
      queueMicrotask(() => {
        if (target.isConnected && (document.activeElement === null || document.activeElement === document.body)) target.focus({ preventScroll: true });
      });
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const heading = root.querySelector<HTMLElement>(`[id="${headingId}"]`);
    (heading ?? root).focus({ preventScroll: true });
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Focus trap, expanded only. The expanded card covers the page and takes it over, so Tab has
   * to stay inside it; the anchored card deliberately does not trap, because it sits beside the
   * page the user is still reading.
   *
   * Tab order is recomputed on every press rather than cached: the card's own tab panels appear
   * and disappear as the user moves between them.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const stops = focusableIn(root);
      if (stops.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = deepActiveElement();
      const inside = active !== null && root.contains(active);
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    root.addEventListener("keydown", onKeyDown);
    // Also catch a Tab pressed while focus sits outside the card (the host page still has it).
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [expanded]);

  const card = (
    <div
      ref={rootRef}
      className={className ? `tw-pop ${className}` : "tw-pop"}
      data-verdict={verdict}
      data-size={size}
      role="dialog"
      // Expanded covers the page and traps focus, so it is genuinely modal; anchored is not.
      aria-modal={expanded ? "true" : "false"}
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <PopoverContext.Provider value={{ headingId, close, size, onToggleSize }}>{children}</PopoverContext.Provider>
    </div>
  );

  return (
    <div ref={layerRef} className="tw-pop-layer" popover={typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype ? "manual" : undefined}>
      {expanded ? (
        <div className="tw-pop-backdrop" aria-hidden="true" />
      ) : null}
      {card}
    </div>
  );
}
