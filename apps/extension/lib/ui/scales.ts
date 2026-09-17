/** Pure scale helpers for the evidence card's instruments (no DOM, unit-tested). */

/**
 * Symmetric log position of `value` on a center-zero half-track, in [-1, 1]. Flow sizes span
 * five orders of magnitude on one token (a $400 seller next to a $576K buyer), so a linear
 * scale renders every small seller as nothing; log keeps each row readable on a shared scale.
 */
export function symlogFraction(value: number | null, maxAbs: number): number {
  if (value === null || value === 0 || maxAbs <= 0) return 0;
  const f = Math.log10(1 + Math.abs(value)) / Math.log10(1 + maxAbs);
  return Math.sign(value) * Math.min(1, f);
}

/** Decade ticks ($1K, $10K, $100K, ...) that fall strictly inside the scale's maximum. */
export function decadeTicks(maxAbs: number): number[] {
  const ticks: number[] = [];
  for (let d = 1_000; d < maxAbs; d *= 10) ticks.push(d);
  return ticks;
}

/** Index of the candle nearest the post time, or null when the post is outside the window. */
export function postIndex(candles: { interval_start: string }[], postTimeIso: string | null): number | null {
  if (!postTimeIso || candles.length === 0) return null;
  const post = new Date(postTimeIso).getTime();
  const times = candles.map((c) => new Date(c.interval_start).getTime());
  const first = times[0]!;
  const last = times[times.length - 1]!;
  if (Number.isNaN(post) || post < first || post > last) return null;
  let best = 0;
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i]! - post) < Math.abs(times[best]! - post)) best = i;
  return best;
}
