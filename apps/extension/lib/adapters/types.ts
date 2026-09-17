import type { Chain, Target } from "@tripwire/core";

/**
 * A venue adapter maps a URL (and, for tier 1, the live DOM) to a guardable `Target`, and
 * (tier 1 only) to the trade button that Tripwire must be able to block.
 *
 * `readTarget` and `anchor` must only read `textContent`/attributes — never `innerHTML` — per
 * the task's DOM constraint.
 */
/**
 * Why a page has no guardable target, when the reason is worth telling the user.
 *
 * "No target on this page" was the only answer the strip had, and it was wrong three ways: a
 * Bitcoin destination is not a missing selection, a native asset is not a token Tripwire can
 * look up, and a swap form that simply keeps its tokens out of the URL is not empty. Each of
 * these now says what it is.
 */
export type TargetGap =
  /** The venue's destination chain is outside Tripwire's coverage. `label` names it. */
  | { kind: "unsupported-chain"; label: string }
  /** The destination is a chain's own coin, which has no contract to look up on Nansen. */
  | { kind: "native-asset"; symbol: string }
  /** The page names a token by symbol only (no address in the URL): resolve it and check it. */
  | { kind: "symbol"; symbol: string; chainHint?: Chain };

export interface VenueAdapter {
  /** e.g. "jupiter", "pumpfun", "uniswap", "jumper", "hyperliquid", "polymarket", "raydium", … */
  id: string;
  tier: 1 | 2;
  match(url: URL): boolean;
  readTarget(doc: Document, url: URL): Target | null;
  /**
   * Called only when `readTarget` returned null: what the page is pointing at, if anything.
   * `{ kind: "symbol" }` asks the caller to resolve that symbol through the backend and guard
   * the result; the other kinds are final and become the strip's reason.
   */
  readGap?(doc: Document, url: URL): TargetGap | null;
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
