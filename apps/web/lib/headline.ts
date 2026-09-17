import type { Verdict } from "@tripwire/core";
import { BudgetExceeded } from "./nansen/client";

export const BUDGET_HEADLINE = "Nansen credit cap reached";
const BUDGET_MESSAGE = new BudgetExceeded().message;

/**
 * The short reason shown on the chip/strip for an UNCHECKED verdict (null otherwise). Hitting
 * the daily credit cap is reported as such -- it never blocks and never reads as CLEAR -- ahead
 * of any builder-specific reason ("Pick a market").
 */
export function uncheckedHeadline(verdict: Verdict, errors: string[], builderHeadline: string | null = null): string | null {
  if (verdict !== "UNCHECKED") return null;
  if (errors.includes(BUDGET_MESSAGE)) return BUDGET_HEADLINE;
  return builderHeadline;
}
