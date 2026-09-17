import { verdictLabel, type Verdict } from "@tripwire/core";
import { ChainLogo } from "./Logo";
import { Plate } from "./Plate";
import { ReplayBadge } from "./ReplayBadge";

export type ChipProps = {
  verdict: Verdict | "LOADING";
  symbol: string;
  headline: string;
  onClick: () => void;
  expanded: boolean;
  replay?: boolean;
  /** The token's chain: its logo leads the pill. */
  chain?: string | null;
};

/** The X verdict chip: a Nansen-style pill with the chain's logo, the verdict pill and the
 * finding. It opens the evidence card, so it announces a dialog popup. While the check is in
 * flight the verdict pill spins and names the symbol. */
export function Chip({ verdict, symbol, headline, onClick, expanded, replay, chain }: ChipProps) {
  const isLoading = verdict === "LOADING";
  const valueText = isLoading ? "Checking…" : headline;
  const ariaLabel = isLoading
    ? `Tripwire verdict for $${symbol}: checking`
    : `Tripwire verdict for $${symbol}: ${verdictLabel(verdict)}. ${headline}`;

  return (
    <button type="button" className="tw-chip" data-verdict={verdict} aria-expanded={expanded} aria-haspopup="dialog" aria-label={ariaLabel} onClick={onClick}>
      <ChainLogo chain={chain} size={16} labelled={false} />
      <Plate verdict={verdict} label={isLoading ? symbol : undefined} className="tw-chip-key" />
      <span className="tw-chip-value">{valueText}</span>
      <ReplayBadge replay={replay} />
    </button>
  );
}
