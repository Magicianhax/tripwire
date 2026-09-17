import { useState, type ReactNode } from "react";
import { verdictLabel, type Verdict } from "@tripwire/core";
import { Plate } from "./Plate";
import { Popover } from "./Popover";
import { ReplayBadge } from "./ReplayBadge";

/** Below this width the evidence card opens as a bottom sheet. */
export const SHEET_BELOW = 720;

export type DockProps = {
  /** Whether the evidence card is closed. State is owned by the caller so it can be driven
   * from the same place that re-renders the card's contents via mountReact's `update`. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Drives the dock chip's plate. "LOADING" renders a non-interactive "Checking…" status. */
  verdict?: Verdict | "LOADING";
  /** The dock chip's value cell: the top finding or the reason it couldn't check. */
  headline?: string;
  /** The card contents (evidence card or a status card) shown when open. */
  children: ReactNode;
  /** Shown on the dock chip; don't also pass it to a card rendered inside, or it shows twice. */
  replay?: boolean;
};

/** The tier-2 dock: a verdict chip pinned to the top-right edge that opens the evidence card
 * beside it (a bottom sheet under 720px). Always stacked below the block screen. */
export function Dock({ collapsed, onToggleCollapsed, verdict, headline = "", children, replay }: DockProps) {
  const [chip, setChip] = useState<HTMLButtonElement | null>(null);

  if (verdict === "LOADING") {
    return (
      <div className="tw-chip tw-dock-chip" data-verdict="LOADING" role="status">
        <Plate verdict="LOADING" label="Tripwire" className="tw-chip-key" />
        <span className="tw-chip-value">Checking…</span>
        <ReplayBadge replay={replay} />
      </div>
    );
  }

  const word = verdict ? verdictLabel(verdict) : "Tripwire";
  return (
    <>
      <button
        ref={setChip}
        type="button"
        className="tw-chip tw-dock-chip"
        data-verdict={verdict}
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-haspopup="dialog"
        aria-label={`Tripwire evidence. ${word}${headline ? `: ${headline}` : ""}`}
      >
        {verdict ? <Plate verdict={verdict} className="tw-chip-key" /> : <span className="tw-chip-key tw-plate" data-tone="unlit" data-mark="dashed">Tripwire</span>}
        {headline ? <span className="tw-chip-value">{headline}</span> : null}
        <ReplayBadge replay={replay} />
      </button>
      {!collapsed ? (
        <Popover
          anchor={chip}
          onClose={onToggleCollapsed}
          returnFocus={() => chip}
          sheetBelow={SHEET_BELOW}
          closeWhenAnchorHidden={false}
          verdict={verdict}
          className="tw-dock"
        >
          {children}
        </Popover>
      ) : null}
    </>
  );
}
