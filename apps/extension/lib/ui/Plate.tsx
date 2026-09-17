import { verdictLabel, verdictPlate, type Verdict } from "@tripwire/core";

/** An annunciator plate: the verdict word lit in its crew-alerting tone. `data-tone` picks the
 * lamp colour and `data-mark` the non-colour shape (filled / outlined / dashed); both come from
 * `verdictPlate`, so UNCHECKED can never render as a green plate. */
export function Plate({ verdict, label, className }: { verdict: Verdict | "LOADING"; label?: string; className?: string }) {
  const { tone, mark } = verdictPlate(verdict);
  const text = label ?? (verdict === "LOADING" ? "Checking" : verdictLabel(verdict));
  return (
    <span className={className ? `tw-plate ${className}` : "tw-plate"} data-tone={tone} data-mark={mark}>
      {text}
    </span>
  );
}
