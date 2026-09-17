import { CircleDashed, OctagonX, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { verdictLabel, verdictPlate, type Verdict } from "@tripwire/core";

const ICON: Record<Verdict, LucideIcon> = { TRIPWIRE: OctagonX, CAUTION: TriangleAlert, CLEAR: ShieldCheck, UNCHECKED: CircleDashed };

/** The extension's verdict pill for a logged verdict. Tone and fill come from verdictPlate:
 * TRIPWIRE and CAUTION are filled, Clear a mint tint, Unchecked a dashed neutral pill (never
 * mint); the icon shape tells them apart without colour. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const { tone, mark } = verdictPlate(verdict);
  const I = ICON[verdict];
  return (
    <span className="tw-chip" data-verdict={verdict} data-tone={tone} data-mark={mark}>
      <I size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      {verdictLabel(verdict)}
    </span>
  );
}
