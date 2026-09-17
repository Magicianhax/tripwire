/** "just now", "42s ago", "5m ago", "3h ago", "2d ago"; older than a week falls back to the date. */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const sec = Math.round((now - ts) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day <= 7) return `${day}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

/** The full timestamp for a title tooltip: "2026-09-17 13:11:01 UTC". */
export function fullTime(ts: number): string {
  return `${new Date(ts).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
