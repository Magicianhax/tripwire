import { pct, usd } from "@tripwire/core";

export { usd, pct };

/** First 4 + "…" + last 4 of an address; returns short strings unchanged. */
export function shortAddr(address: string): string {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The name the chip carries for a token (Round 1.1.5).
 *
 * A contract-address post starts as `0x1234…abcd`, because that is genuinely all the page said.
 * Once `tgm/token-information` answers — a call the chip already makes and pays for — the panel
 * carries the real ticker and the chip should say `WIF`. A failed or empty lookup leaves the
 * short address: the chip never invents a ticker, and never shows a cashtag on one.
 */
export function chipLabel(fallback: string, symbol: string | null | undefined): { text: string; isSymbol: boolean } {
  const resolved = typeof symbol === "string" ? symbol.trim() : "";
  return resolved.length > 0 && resolved.length <= 32 ? { text: resolved, isSymbol: true } : { text: fallback, isSymbol: false };
}

/** Compact relative time: "now", "12s ago", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 1) return "now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
