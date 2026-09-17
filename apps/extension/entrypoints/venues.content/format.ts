import type { Target, Verdict } from "@tripwire/core";
import { shortAddr } from "../../lib/ui/format";

export function errorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire couldn't check this: backend offline";
  if (status === 429) return "Tripwire couldn't check this: Nansen credit cap reached";
  return `Tripwire couldn't check this: ${error || "check failed"}`;
}

export function verdictHeadline(verdict: Verdict): string {
  switch (verdict) {
    case "CLEAR":
      return "No flags on this token";
    case "CAUTION":
      return "Caution flagged";
    case "TRIPWIRE":
      return "Tripwire";
    default:
      return "Tripwire couldn't check this: no data";
  }
}

export function targetTitle(target: Target | null): string {
  if (!target) return "Tripwire";
  if (target.kind === "spot") return target.symbol ? `$${target.symbol}` : shortAddr(target.tokenAddress);
  if (target.kind === "perp") return target.side ? `${target.coin} ${target.side}` : target.coin;
  return target.slug;
}

/** JSON.stringify() is used to compare targets (per task-12-context.md); adapter id is folded
 * in since two adapters could otherwise coincidentally produce identical JSON (e.g. two null
 * targets). */
export function keyFor(adapterId: string, target: Target | null): string {
  return `${adapterId}:${target ? JSON.stringify(target) : "null"}`;
}
