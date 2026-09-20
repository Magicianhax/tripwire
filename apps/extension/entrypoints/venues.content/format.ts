import type { Target, Verdict } from "@tripwire/core";
import { chainName } from "../../lib/adapters/chains";
import type { TargetGap } from "../../lib/adapters/types";
import { shortAddr } from "../../lib/ui/format";

export function errorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire couldn't check this: backend offline";
  if (status === 429) return "Tripwire couldn't check this: Nansen credit cap reached";
  return `Tripwire couldn't check this: ${error || "check failed"}`;
}

/** BlockScreen's `error` prop text after a failed `override()` call. The trade stays blocked
 * -- this is purely informational (fix round 1/5: override failures previously had no
 * user-visible feedback). */
export function overrideFailureText(status: number, error: string): string {
  if (status === 0) return "Override not recorded: backend offline. Still blocked.";
  if (status === 429) return "Override not recorded: Nansen credit cap reached. Still blocked.";
  return `Override not recorded: ${error || "request failed"}. Still blocked.`;
}

/** The one-line headline for a guard result: the top hit, else the backend's UNCHECKED reason,
 * else a generic line for the verdict. */
export function guardHeadline(data: { verdict: Verdict; hits: { text: string; label?: string }[]; headline?: string | null }): string {
  const hit = data.hits[0];
  if (hit) return hit.label || hit.text;
  if (data.verdict === "UNCHECKED" && data.headline) return `Tripwire couldn't check this: ${data.headline}`;
  return verdictHeadline(data.verdict);
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

/**
 * What the strip says when there is no target. Each of these is an answer about the page, not
 * a report of a failure: Tripwire's coverage, the nature of a native coin, or a symbol Nansen
 * could not place. Only a page with nothing selected at all gets the old line.
 */
export function gapHeadline(gap: TargetGap | null | undefined): string {
  if (!gap) return "Select a token to see its onchain activity";
  switch (gap.kind) {
    // The only line here that tells the user to do something, and so the only one that can be
    // wrong about them. It is reachable only from positive evidence that the venue's network
    // control is empty (see TargetGap): not knowing the chain is `unknown-chain`, not this.
    case "missing-chain":
      return `Select a network to check ${gap.symbol}`;
    case "unsupported-chain":
      return /^chain \d+$/.test(gap.label)
        ? `No onchain data for ${gap.symbol ?? "this token"} on this network`
        : `No onchain data for ${gap.symbol ? `${gap.symbol} on ` : ""}${gap.label}`;
    case "native-asset":
      return `${gap.symbol} is the chain's native asset — Tripwire checks tokens`;
    case "symbol":
      return `Tripwire couldn't find ${gap.symbol} on Nansen`;
    case "ambiguous-symbol":
      return `More than one ${gap.symbol} on ${chainName(gap.chain)} — Tripwire can't tell which`;
    case "unknown-chain":
      return `Tripwire can't tell which network ${gap.symbol} is on`;
    case "pending":
      return "Checking what this page is showing…";
  }
}

/** A gap's identity, so the change-detection loop treats two different gaps as two states. */
export function gapKey(gap: TargetGap | null | undefined): string {
  if (!gap) return "";
  if (gap.kind === "symbol") return `symbol:${gap.symbol}:${gap.chainHint ?? ""}`;
  if (gap.kind === "unsupported-chain") return `${gap.kind}:${gap.label}:${gap.symbol ?? ""}`;
  if (gap.kind === "ambiguous-symbol") return `${gap.kind}:${gap.symbol}:${gap.chain}`;
  return `${gap.kind}:${gap.symbol}`;
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
