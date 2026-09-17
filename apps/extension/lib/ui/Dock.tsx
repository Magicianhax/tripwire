import type { ReactNode } from "react";
import { verdictLabel, type Verdict } from "@tripwire/core";
import { ReplayBadge } from "./ReplayBadge";

export type DockProps = {
  /** Whether the dock is collapsed to a small chip. State is owned by the caller so it can be
   * driven from the same place that re-renders the wrapped Panel via mountReact's `update`. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Drives the collapsed chip's key/value anatomy (same as the X Chip) and the expanded
   * frame's border. "LOADING" renders a non-interactive "Checking…" status chip. */
  verdict?: Verdict | "LOADING";
  /** The collapsed chip's value cell: the top finding or the reason it couldn't check. */
  headline?: string;
  /** The Panel (or any content) to show when expanded. */
  children: ReactNode;
  /** Shown on the Dock itself (collapsed chip and expanded frame); don't also pass it to a
   * Panel rendered inside, or the watermark shows twice. */
  replay?: boolean;
};

/** Floating container for the tier-2 dock and the evidence panel: right edge, 360px wide on
 * wide viewports; a bottom sheet capped at 50vh under 720px. Always stacked below the block
 * screen. Collapses to a verdict chip. */
export function Dock({ collapsed, onToggleCollapsed, verdict, headline = "", children, replay }: DockProps) {
  if (collapsed && verdict === "LOADING") {
    return (
      <div className="tw-chip tw-dock-chip" data-verdict="LOADING" role="status">
        <span className="tw-chip-key">Tripwire</span>
        <span className="tw-chip-value tw-mono">Checking…</span>
        <ReplayBadge replay={replay} />
      </div>
    );
  }

  if (collapsed) {
    const word = verdict && verdict !== "LOADING" ? verdictLabel(verdict) : "Tripwire";
    return (
      <button
        type="button"
        className="tw-chip tw-dock-chip"
        data-verdict={verdict}
        onClick={onToggleCollapsed}
        aria-expanded={false}
        aria-label={`Expand Tripwire panel. ${word}${headline ? `: ${headline}` : ""}`}
      >
        <span className="tw-chip-key">{word}</span>
        {headline ? <span className="tw-chip-value tw-mono">{headline}</span> : null}
        <ReplayBadge replay={replay} />
      </button>
    );
  }

  return (
    <div className="tw-dock" data-verdict={verdict === "LOADING" ? undefined : verdict}>
      <button type="button" className="tw-dock-collapse" onClick={onToggleCollapsed} aria-expanded={true} aria-label="Collapse Tripwire panel">
        –
      </button>
      <ReplayBadge replay={replay} />
      {children}
    </div>
  );
}
