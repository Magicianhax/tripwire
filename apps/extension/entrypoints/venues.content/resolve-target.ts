import type { Chain, Target } from "@tripwire/core";
import type { TargetGap } from "../../lib/adapters/types";
import type { ApiResult } from "../../lib/api";
import type { ResolveResponse } from "../../lib/api-types";

/**
 * The two decisions between "the page names a token by symbol" and "Tripwire has a verdict".
 * Pure, and out of the content script's `main()`, because each of them used to print a
 * sentence the page itself contradicted (Round 1.4.9).
 */

/**
 * A symbol gap the adapter could not put on a chain. Not knowing which network a token is on
 * is a fact about Tripwire; "Select a network" is an instruction about the user, and on a page
 * that is already showing a network it is simply false. State the limit.
 */
export function chainlessGap(gap: TargetGap): TargetGap {
  return gap.kind === "symbol" && !gap.chainHint ? { kind: "unknown-chain", symbol: gap.symbol } : gap;
}

/**
 * What `/api/resolve` came back with, as the thing the strip should show:
 *
 * - the token, when the backend named exactly one on the chain the page named;
 * - an `ambiguous-symbol` gap, when the backend found the symbol on that chain more than once
 *   and withheld a pick (volume does not establish which contract the user selected) — saying
 *   "couldn't find it" there would be a falsehood about data we are holding;
 * - null, when Nansen genuinely had nothing, or the call failed, or the backend answered about
 *   a different chain. A chain is never inferred from the fact that a symbol resolves on one.
 */
export function resolvedFrom(symbol: string, chainHint: Chain, result: ApiResult<ResolveResponse>): Target | TargetGap | null {
  if (!result.ok) return null;
  const best = result.data.best;
  if (!best) return result.data.candidates.length > 1 ? { kind: "ambiguous-symbol", symbol, chain: chainHint } : null;
  if (best.chain !== chainHint) return null;
  return { kind: "spot", chain: best.chain, tokenAddress: best.tokenAddress, symbol: best.symbol };
}

/** Narrows `resolvedFrom`'s union for the caller. */
export function isTarget(value: Target | TargetGap | null): value is Target {
  return value !== null && (value.kind === "spot" || value.kind === "perp" || value.kind === "prediction");
}
