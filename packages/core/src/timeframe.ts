export type FlowTimeframe = "5m" | "1h" | "6h" | "12h" | "1d" | "7d";

const STEPS: [FlowTimeframe, number][] = [
  ["5m", 5 * 60_000],
  ["1h", 60 * 60_000],
  ["6h", 6 * 3_600_000],
  ["12h", 12 * 3_600_000],
  ["1d", 24 * 3_600_000],
];

/** Smallest Flow Intelligence window that covers the post's age (capped at 7d). */
export function pickFlowTimeframe(ageMs: number): FlowTimeframe {
  for (const [tf, ms] of STEPS) if (ageMs <= ms) return tf;
  return "7d";
}
