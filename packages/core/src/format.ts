import { SIGNAL_UNITS, type SignalId, type Verdict } from "./types";

export type RuleOp = ">" | "<" | ">=" | "<=";

/** Compact USD: -412345 -> "−$412K", 1250000 -> "+$1.25M" (sign only when signed=true). */
export function usd(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  let body = abs < 1 ? abs.toFixed(2) : Math.round(abs).toString();
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const v = abs / div;
      const fixed = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
      // Trim trailing zeros after a decimal point only: "1.50" -> "1.5", but "150" stays "150".
      body = (fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed) + suffix;
      break;
    }
  }
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`;

/** A share of 24h volume: one decimal below 10%, whole percent above, minus sign for outflow.
 * These numbers routinely live between 0.1% and 15%, so rounding to whole percent would erase
 * the difference between "ordinary rotation" and "a block". */
export function pctVol(n: number | null | undefined, withUnit = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  // Trailing zeros read as false precision: "5%", "0.5%", but "14.5%" and "0.75%".
  const body = (abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${n < 0 ? "−" : ""}${body}%${withUnit ? " of volume" : ""}`;
}

/** A signal's value written in its own unit (see SIGNAL_UNITS). */
export function formatSignalValue(signalId: SignalId, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (SIGNAL_UNITS[signalId]) {
    case "pct-volume":
      return pctVol(value, true);
    case "pct":
      return pct(value);
    case "count":
      return String(Math.round(value));
    case "usd":
      return signalId === "author_holds_token" || signalId === "inside_liq_band" ? usd(value) : usd(value, true);
  }
}

/** The secondary clause under a fired rule's finding: "rule: > 70%", "rule: < −$100K".
 * The finding itself (the signal's label) is the primary sentence. */
export function ruleClause(hit: { signalId: SignalId; op: RuleOp; threshold: number }): string {
  return `rule: ${hit.op} ${formatSignalValue(hit.signalId, hit.threshold)}`;
}

export type PlateTone = "warning" | "caution" | "normal" | "unlit";
export type PlateMark = "filled" | "outlined" | "dashed";

/** Crew-alerting plate for a verdict (or a check still in flight): the tone picks the lamp
 * colour, the mark carries the same meaning without colour. Alerts are filled plates, CLEAR an
 * outlined plate, and anything unverified a dashed, unlit plate: never green. */
export function verdictPlate(verdict: Verdict | "LOADING"): { tone: PlateTone; mark: PlateMark } {
  switch (verdict) {
    case "TRIPWIRE":
      return { tone: "warning", mark: "filled" };
    case "CAUTION":
      return { tone: "caution", mark: "filled" };
    case "CLEAR":
      return { tone: "normal", mark: "outlined" };
    default:
      return { tone: "unlit", mark: "dashed" };
  }
}

/** The word shown for a verdict. The two alert words are caps in the DOM; the quiet states stay
 * sentence case (plates set every word in caps visually; screen readers get the DOM word). */
export function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "TRIPWIRE":
      return "TRIPWIRE";
    case "CAUTION":
      return "CAUTION";
    case "CLEAR":
      return "Clear";
    case "UNCHECKED":
      return "Unchecked";
  }
}
