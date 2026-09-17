import type { ReactNode } from "react";
import { ReplayBadge } from "./ReplayBadge";

export type DockProps = {
  /** Whether the dock is collapsed to a small chip. State is owned by the caller so it can be
   * driven from the same place that re-renders the wrapped Panel via mountReact's `update`. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Text shown on the collapsed chip (e.g. the verdict word + headline). */
  collapsedLabel: string;
  /** The Panel (or any content) to show when expanded. */
  children: ReactNode;
  /** Shown on the Dock itself (collapsed chip and expanded frame); don't also pass it to a
   * Panel rendered inside, or the watermark shows twice. */
  replay?: boolean;
};

/** Floating right-edge container for the tier-2 dock: fixed, top 96px, right 16px, 360px
 * wide, max-height calc(100vh - 120px), scrollable. Collapses to a small chip. */
export function Dock({ collapsed, onToggleCollapsed, collapsedLabel, children, replay }: DockProps) {
  if (collapsed) {
    return (
      <button type="button" className="tw-dock-chip" onClick={onToggleCollapsed} aria-expanded={false} aria-label="Expand Tripwire panel">
        {collapsedLabel}
        <ReplayBadge replay={replay} />
      </button>
    );
  }

  return (
    <div className="tw-dock">
      <button type="button" className="tw-dock-collapse" onClick={onToggleCollapsed} aria-expanded={true} aria-label="Collapse Tripwire panel">
        –
      </button>
      <ReplayBadge replay={replay} />
      {children}
    </div>
  );
}
