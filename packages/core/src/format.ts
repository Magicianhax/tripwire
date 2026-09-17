import type { SignalId } from "./types";

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

/** A signal's value in its own unit: percent, plain count, or (signed for flows) USD. */
export function formatSignalValue(signalId: SignalId, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (signalId) {
    case "fresh_buy_share":
    case "sm_opposite_side_pct":
    case "smart_side_disagrees":
      return pct(value);
    case "risk_high_count":
      return String(Math.round(value));
    case "exit_pressure":
    case "sm_netflow_24h":
      return usd(value, true);
    case "inside_liq_band":
    case "author_holds_token":
      return usd(value);
  }
}
