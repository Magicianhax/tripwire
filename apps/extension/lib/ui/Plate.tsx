import { verdictLabel, verdictPlate, type Verdict } from "@tripwire/core";
import { Icon, VERDICT_ICON } from "./icons";

/** The verdict pill: a shape icon plus the verdict word. `data-tone` picks the colour and
 * `data-mark` the fill (filled / outlined / dashed); both come from `verdictPlate`, so
 * UNCHECKED can never render as a mint pill. */
export function Plate({ verdict, label, className }: { verdict: Verdict | "LOADING"; label?: string; className?: string }) {
  const { tone, mark } = verdictPlate(verdict);
  const text = label ?? (verdict === "LOADING" ? "Checking" : verdictLabel(verdict));
  return (
    <span className={className ? `tw-plate ${className}` : "tw-plate"} data-tone={tone} data-mark={mark}>
      <Icon icon={VERDICT_ICON[verdict]} size={14} className={verdict === "LOADING" ? "tw-spin" : undefined} />
      {text}
    </span>
  );
}
