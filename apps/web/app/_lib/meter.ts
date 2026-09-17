/** Five evenly spaced scale marks from zero to `max`. */
export function meterTicks(max: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4));
}

/** Fill percentage clamped to the track, and whether the meter reads zero. */
export function meterFill(value: number, max: number): { pct: number; zero: boolean } {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return { pct: Math.round(pct * 10) / 10, zero: value <= 0 };
}
