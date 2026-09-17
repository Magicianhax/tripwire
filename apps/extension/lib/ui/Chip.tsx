import { verdictLabel, type Verdict } from "@tripwire/core";
import { Plate } from "./Plate";
import { ReplayBadge } from "./ReplayBadge";

export type ChipProps = {
  verdict: Verdict | "LOADING";
  symbol: string;
  headline: string;
  onClick: () => void;
  expanded: boolean;
  replay?: boolean;
};

/** The X verdict chip: a lit annunciator plate (the verdict word) and a mono value cell (the
 * headline). It opens the evidence card, so it announces a dialog popup. While the check is in
 * flight the plate is unlit and names the symbol. */
export function Chip({ verdict, symbol, headline, onClick, expanded, replay }: ChipProps) {
  const isLoading = verdict === "LOADING";
  const valueText = isLoading ? "Checking…" : headline;
  const ariaLabel = isLoading
    ? `Tripwire verdict for $${symbol}: checking`
    : `Tripwire verdict for $${symbol}: ${verdictLabel(verdict)}. ${headline}`;

  return (
    <button type="button" className="tw-chip" data-verdict={verdict} aria-expanded={expanded} aria-haspopup="dialog" aria-label={ariaLabel} onClick={onClick}>
      <Plate verdict={verdict} label={isLoading ? symbol : undefined} className="tw-chip-key" />
      <span className="tw-chip-value tw-mono">{valueText}</span>
      <ReplayBadge replay={replay} />
    </button>
  );
}
