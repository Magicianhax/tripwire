import type { HitDto } from "../../lib/api-types";
import type { Rect } from "../../lib/adapters/overlay";
import { BlockScreen } from "../../lib/ui/BlockScreen";

export type BlockOverlayProps = {
  rect: Rect;
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
 * child sized to the anchor's rect (`computeBlockRect`, from `lib/adapters/overlay.ts`).
 * Mounted via `mountReact(ctx, { position: "modal" }, …)`, whose "modal" positioning makes the
 * shadow-root container `position:fixed; inset:0`; `mountReact` sets that container to
 * `pointer-events:none` too, so only the block rectangle below is ever hit-testable.
 */
export function BlockOverlay({ rect, hits, phrase, onEvidence, onOverride, pending = false, error = null, replay }: BlockOverlayProps) {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          pointerEvents: "auto",
        }}
      >
        <BlockScreen hits={hits} phrase={phrase} onEvidence={onEvidence} onOverride={onOverride} pending={pending} error={error} replay={replay} />
      </div>
    </div>
  );
}
