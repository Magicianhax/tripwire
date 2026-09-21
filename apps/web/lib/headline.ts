import type { Verdict } from "@tripwire/core";
import { BUDGET_MESSAGE_GLOBAL, BUDGET_MESSAGE_INSTALL } from "./nansen/client";

export const BUDGET_HEADLINE = "Nansen credit cap reached";
/** Short enough for a chip; the popup and the strip carry the "use your own key" action. */
export const INSTALL_BUDGET_HEADLINE = "Daily limit reached";

/**
 * The short reason shown on the chip/strip for an UNCHECKED verdict (null otherwise). Hitting
 * the daily credit cap is reported as such -- it never blocks and never reads as CLEAR -- ahead
 * of any builder-specific reason ("Pick a market").
 */
export function uncheckedHeadline(verdict: Verdict, errors: string[], builderHeadline: string | null = null): string | null {
  if (verdict !== "UNCHECKED") return null;
  if (errors.includes(BUDGET_MESSAGE_GLOBAL)) return BUDGET_HEADLINE;
  if (errors.includes(BUDGET_MESSAGE_INSTALL)) return INSTALL_BUDGET_HEADLINE;
  return builderHeadline;
}
