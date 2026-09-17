import { useLayoutEffect, useRef, useState } from "react";
import type { TargetKind } from "@tripwire/core";
import type { HitDto } from "../../lib/api-types";
import { computeBlockRect, type Rect } from "../../lib/adapters/overlay";
import { BlockScreen } from "../../lib/ui/BlockScreen";

export type BlockOverlayProps = {
  /** The anchor button's bounding rect; the block covers it and grows upward to fit. */
  anchorRect: Rect;
  kind: TargetKind;
  hits: HitDto[];
  phrase: string;
  onEvidence: () => void;
  onOverride: () => void;
  /** True while an override() call is in flight -- disables BlockScreen's Override button so
   * rapid repeat clicks can't fire duplicate override() calls. */
  pending?: boolean;
  /** The last failed override attempt's message, or null. Rendered by BlockScreen; the trade
   * stays blocked regardless. */
  error?: string | null;
  replay?: boolean;
};

/**
 * The BlockScreen's positioning frame: an invisible, full-viewport `pointer-events:none`
 * layer (so nothing outside the block rect is ever unclickable) with one `pointer-events:auto`
 * child sized by `computeBlockRect` (`lib/adapters/overlay.ts`) from the anchor's rect and the
 * block's measured content height, so a long hit list grows the rect upward instead of being
 * clipped. Mounted via `mountReact(ctx, { position: "modal" }, …)`, whose "modal" positioning
 * makes the shadow-root container `position:fixed; inset:0`; `mountReact` sets that container
 * to `pointer-events:none` too, so only the block rectangle below is ever hit-testable.
 */
export function BlockOverlay({ anchorRect, kind, hits, phrase, onEvidence, onOverride, pending = false, error = null, replay }: BlockOverlayProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const rect = computeBlockRect(anchorRect, undefined, contentHeight);

  // Measure after every render (hits, error line and fonts all change the height). The block
  // normally stretches to fill the frame (min-height:100%), so drop that for one synchronous
  // read to get its natural height; otherwise a rect that grew once could never shrink back.
  useLayoutEffect(() => {
    const block = frameRef.current?.querySelector<HTMLElement>(".tw-block");
    if (!block) return;
    block.style.minHeight = "0px";
    const measured = block.offsetHeight;
    block.style.minHeight = "";
    if (measured > 0 && Math.abs(measured - contentHeight) > 1) setContentHeight(measured);
  });

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      <div
        ref={frameRef}
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          pointerEvents: "auto",
        }}
      >
        <BlockScreen hits={hits} kind={kind} phrase={phrase} onEvidence={onEvidence} onOverride={onOverride} pending={pending} error={error} replay={replay} />
      </div>
    </div>
  );
}
