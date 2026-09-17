import { verdictLabel, type Verdict } from "@tripwire/core";
import { ReplayBadge } from "./ReplayBadge";

export type ChipProps = {
  verdict: Verdict | "LOADING";
  symbol: string;
  headline: string;
  onClick: () => void;
  expanded: boolean;
  replay?: boolean;
};

/** Single-line, 24px verdict chip. TRIPWIRE gets the yellow key/ink value split; the other
 * verdicts (and LOADING) are quiet, single-tone cells. See DESIGN.md "Verdict chip". */
export function Chip({ verdict, symbol, headline, onClick, expanded, replay }: ChipProps) {
  const isLoading = verdict === "LOADING";
  const keyText = isLoading ? symbol : verdictLabel(verdict);
  const valueText = isLoading ? "Checking…" : headline;
  const ariaLabel = isLoading
    ? `Tripwire verdict for $${symbol}: checking`
    : `Tripwire verdict for $${symbol}: ${verdictLabel(verdict)}. ${headline}`;

  return (
    <button type="button" className="tw-chip" data-verdict={verdict} aria-expanded={expanded} aria-label={ariaLabel} onClick={onClick}>
      <span className="tw-chip-key">{keyText}</span>
      <span className="tw-chip-value tw-mono">{valueText}</span>
      <ReplayBadge replay={replay} />
    </button>
  );
}
