import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * An explanatory label for an icon-only control. The trigger receives the tooltip id so
 * assistive technology gets the same explanation that appears on hover or keyboard focus.
 */
export function Tooltip({
  label,
  align = "center",
  placement = "top",
  children,
}: {
  label: string;
  align?: "center" | "end";
  placement?: "top" | "bottom";
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const native = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

  useLayoutEffect(() => {
    const anchor = trigger.current;
    const bubble = tip.current;
    if (!native || !anchor || !bubble || !open) return;
    bubble.showPopover();
    const position = () => {
      const box = anchor.getBoundingClientRect();
      const bounds = bubble.getBoundingClientRect();
      const margin = 8;
      const above = box.top - bounds.height - 7;
      const below = box.bottom + 7;
      const preferred = placement === "top" ? (above >= margin ? above : below) : (below + bounds.height <= innerHeight - margin ? below : above);
      const left = align === "end" ? box.right - bounds.width : box.left + (box.width - bounds.width) / 2;
      bubble.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
      bubble.style.top = `${Math.max(margin, Math.min(preferred, innerHeight - bounds.height - margin))}px`;
    };
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      if (bubble.isConnected && bubble.matches(":popover-open")) bubble.hidePopover();
    };
  }, [native, open, align, placement]);

  return (
    <span ref={trigger} className="tw-tooltip" data-align={align} data-placement={placement}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => { if (!trigger.current?.matches(":focus-within")) setOpen(false); }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
      onClick={() => setOpen(false)}
      onKeyDown={(event) => { if (open && event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}
    >
      {children(labelId)}
      <span ref={tip} id={labelId} className="tw-tooltip-content" role="tooltip" popover={native ? "manual" : undefined}
        style={native ? { position: "fixed", margin: 0, inset: "auto", transform: "none", opacity: 1, visibility: "visible", maxWidth: "calc(100vw - 16px)", whiteSpace: "normal", transition: "none" } : undefined}>
        {label}
      </span>
    </span>
  );
}
