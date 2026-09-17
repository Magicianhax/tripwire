import { createContext, useContext } from "react";
import type { CardSize } from "../card-size";

/**
 * How much room the card has. Tab bodies read this rather than being told twice: there is one
 * layout, and `size` decides how much of the same data it shows — 5 rows or 20, a 132px chart or
 * a 320px one, "+12 more" or the twelve.
 *
 * There is deliberately no separate expanded *content*: a second code path would be a second
 * thing to keep correct, and the complaint this answers ("it does not tell much") is about how
 * much is on screen, not about which numbers exist.
 */
export const CardSizeContext = createContext<CardSize>("compact");

export function useCardSize(): CardSize {
  return useContext(CardSizeContext);
}

/** `compact` when the card is anchored, `expanded` when it is the centred overlay. */
export function useIsExpanded(): boolean {
  return useCardSize() === "expanded";
}

/** "Show 5 rows compact, 20 expanded" as one call. */
export function rowLimit(size: CardSize, compact: number, expanded: number): number {
  return size === "expanded" ? expanded : compact;
}
