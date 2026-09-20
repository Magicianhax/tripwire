import { createContext, useContext } from "react";
import type { CardSize } from "../card-size";
import { PopoverContext } from "./Popover";

/**
 * How much room the card has. Tab bodies read this rather than being told twice: there is one
 * layout, and `size` decides how much of the same data it shows — 5 rows or 20, a 132px chart or
 * a 320px one, "+12 more" or the twelve.
 *
 * There is deliberately no separate expanded *content*: a second code path would be a second
 * thing to keep correct, and the complaint this answers ("it does not tell much") is about how
 * much is on screen, not about which numbers exist.
 */
export const CardSizeContext = createContext<CardSize | null>(null);

/**
 * `null` means "nobody said", not "compact": the evidence card provides this context from
 * `Panel`, but the wallet card and the author-badge card do not — they set `data-size` from the
 * Popover and render their bodies straight. Those bodies still have to know how much room they
 * have, so the Popover's own size is the fallback, and only a card mounted outside a Popover
 * with no provider above it is compact by default.
 *
 * Before this fallback existed, every `useCardSize()` under the wallet or badge card answered
 * "compact" for ever, so their expanded-only columns and tiles could never render (found while
 * shipping Round 1.3.8, whose Hyperliquid columns are expanded-only).
 */
export function useCardSize(): CardSize {
  const explicit = useContext(CardSizeContext);
  const popover = useContext(PopoverContext);
  return explicit ?? popover?.size ?? "compact";
}

/** `compact` when the card is anchored, `expanded` when it is the centred overlay. */
export function useIsExpanded(): boolean {
  return useCardSize() === "expanded";
}

/** "Show 5 rows compact, 20 expanded" as one call. */
export function rowLimit(size: CardSize, compact: number, expanded: number): number {
  return size === "expanded" ? expanded : compact;
}
