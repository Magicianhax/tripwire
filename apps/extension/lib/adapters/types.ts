import type { Target } from "@tripwire/core";

/**
 * A venue adapter maps a URL (and, for tier 1, the live DOM) to a guardable `Target`, and
 * (tier 1 only) to the trade button that Tripwire must be able to block.
 *
 * `readTarget` and `anchor` must only read `textContent`/attributes — never `innerHTML` — per
 * the task's DOM constraint.
 */
export interface VenueAdapter {
  /** e.g. "jupiter", "pumpfun", "uniswap", "jumper", "hyperliquid", "polymarket", "raydium", … */
  id: string;
  tier: 1 | 2;
  match(url: URL): boolean;
  readTarget(doc: Document, url: URL): Target | null;
  /** Tier 1 only: the trade/swap/buy button to block. Tier 2 adapters omit this — they're
   * dock-only (URL-derived target, no DOM interaction, nothing to block). */
  anchor?(doc: Document): HTMLElement | null;
  /** The exact phrase the user must type into BlockScreen's override input, keyed by the
   * target kind this adapter produces: spot -> "I AM EXIT LIQUIDITY", perp -> "I AM THE
   * LIQUIDITY", prediction -> "I KNOW BETTER". */
  overridePhrase: string;
}

export const OVERRIDE_PHRASES = {
  spot: "I AM EXIT LIQUIDITY",
  perp: "I AM THE LIQUIDITY",
  prediction: "I KNOW BETTER",
} as const;
