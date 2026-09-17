import type { Verdict } from "@tripwire/core";

const CLASS: Record<Verdict, string> = {
  TRIPWIRE: "tw-chip tw-chip-tripwire",
  CAUTION: "tw-chip tw-chip-caution",
  CLEAR: "tw-chip tw-chip-clear",
  UNCHECKED: "tw-chip tw-chip-unchecked",
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return <span className={CLASS[verdict]}>{verdict}</span>;
}
