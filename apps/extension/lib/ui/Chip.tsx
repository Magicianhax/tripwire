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
  /**
   * Whether `symbol` is a real ticker or the short contract address the chip started with.
   *
   * A contract post opens as `0x1234…abcd` and relabels to `WIF` once `tgm/token-information`
   * answers (1.1.5). The cashtag belongs to a ticker only: "$0x1234…abcd" announces a token
   * that does not exist. Defaults true, because every other caller passes a resolved symbol.
   */
  isSymbol?: boolean;
};

/** The X verdict chip: a Nansen-style pill with the chain's logo, the verdict pill and the
 * finding. It opens the evidence card, so it announces a dialog popup. While the check is in
 * flight the verdict pill spins and names the symbol. */
export function Chip({ verdict, symbol, headline, onClick, expanded, replay, chain, isSymbol = true }: ChipProps) {
  const isLoading = verdict === "LOADING";
  const valueText = isLoading ? "Checking…" : headline;
  const spokenName = isSymbol ? `$${symbol}` : `contract ${symbol}`;
  const ariaLabel = isLoading
    ? `Tripwire verdict for ${spokenName}: checking`
    : `Tripwire verdict for ${spokenName}: ${verdictLabel(verdict)}. ${headline}`;

  return (
    <button type="button" className="tw-chip" data-verdict={verdict} aria-expanded={expanded} aria-haspopup="dialog" aria-label={ariaLabel} onClick={onClick}>
      <ChainLogo chain={chain} size={16} labelled={false} />
      <Plate verdict={verdict} label={isLoading ? symbol : undefined} className="tw-chip-key" />
      <span className="tw-chip-value" title={valueText}>
        {valueText}
      </span>
      <ReplayBadge replay={replay} />
    </button>
  );
}
