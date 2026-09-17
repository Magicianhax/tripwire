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
      body = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, "") + suffix;
      break;
    }
  }
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`;
