import { verdictLabel, type Verdict } from "@tripwire/core";

/** Same anatomy as the extension chip (DESIGN.md "Verdict chip"): a key cell carrying the
 * verdict word. TRIPWIRE: yellow key; CAUTION: yellow border and text; Clear: green text;
 * Unchecked: grey. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className="tw-chip" data-verdict={verdict}>
      <span className="tw-chip-key">{verdictLabel(verdict)}</span>
    </span>
  );
}
