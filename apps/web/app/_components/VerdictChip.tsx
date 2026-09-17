import { verdictLabel, verdictPlate, type Verdict } from "@tripwire/core";

/** The extension's annunciator plate for a logged verdict. Tone and mark come from
 * verdictPlate: TRIPWIRE and CAUTION are filled lamps, Clear an outlined green plate,
 * Unchecked a dashed unlit plate (never green). */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const { tone, mark } = verdictPlate(verdict);
  return (
    <span className="tw-chip" data-verdict={verdict} data-tone={tone} data-mark={mark}>
      {verdictLabel(verdict)}
    </span>
  );
}
