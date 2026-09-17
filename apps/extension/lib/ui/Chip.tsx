import type { Verdict } from "@tripwire/core";

export type ChipProps = {
  verdict: Verdict | "LOADING";
  symbol: string;
  headline: string;
  onClick: () => void;
  expanded: boolean;
};

const VERDICT_WORD: Record<Verdict, string> = {
  TRIPWIRE: "TRIPWIRE",
  CAUTION: "CAUTION",
  CLEAR: "CLEAR",
  UNCHECKED: "UNCHECKED",
};

/** Single-line, 24px verdict chip. TRIPWIRE gets the yellow key/ink value split; the other
 * verdicts (and LOADING) are quiet, single-tone cells. See DESIGN.md "Verdict chip". */
export function Chip({ verdict, symbol, headline, onClick, expanded }: ChipProps) {
  const isLoading = verdict === "LOADING";
  const keyText = isLoading ? symbol : VERDICT_WORD[verdict];
  const valueText = isLoading ? "Checking…" : headline;
  const ariaLabel = isLoading
    ? `Tripwire verdict for $${symbol}: checking`
    : `Tripwire verdict for $${symbol}: ${VERDICT_WORD[verdict]}. ${headline}`;

  return (
    <button type="button" className="tw-chip" data-verdict={verdict} aria-expanded={expanded} aria-label={ariaLabel} onClick={onClick}>
      <span className="tw-chip-key">{keyText}</span>
      <span className="tw-chip-value tw-mono">{valueText}</span>
    </button>
  );
}
