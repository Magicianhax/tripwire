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
  | { kind: "missing-chain"; symbol: string }
  /** The venue's destination chain is outside Tripwire's coverage. `label` names it. */
  | { kind: "unsupported-chain"; label: string; symbol?: string }
  /** The destination is a chain's own coin, which has no contract to look up on Nansen. */
  | { kind: "native-asset"; symbol: string }
  /** The page names a token by symbol only (no address in the URL): resolve it and check it. */
  | { kind: "symbol"; symbol: string; chainHint?: Chain };

/**
 * Where on a venue page the eye already is, best first. The runner mounts the verdict to the
 * first candidate that qualifies (`./placement.ts`), so the order is the product decision:
 * the control the user is about to press, then the panel holding it, then the token's own
 * identity, then the page's header.
 */
export type AnchorRole = "trade-button" | "trade-panel-header" | "token-identity" | "page-header";

export type AnchorCandidate = {
  role: AnchorRole;
  /**
   * Which side of the found element the strip goes on. Omitted, it follows the role: above a
   * trade button (never covering it), below a header (the strip describes what the header
   * names).
   */
  place?: "before" | "after";
  /** Reads `textContent`/attributes only, like every other adapter method. */
  find(doc: Document, url?: URL): HTMLElement | null;
};

export type Placement = { role: AnchorRole; place: "before" | "after"; element: HTMLElement };

export interface VenueAdapter {
  /** e.g. "jupiter", "pumpfun", "uniswap", "jumper", "hyperliquid", "polymarket", "raydium", … */
  id: string;
  tier: 1 | 2;
  match(url: URL): boolean;
  readTarget(doc: Document, url: URL): Target | null;
  /** Hide injected trading UI while the venue is choosing an asset or has no selection. */
  shouldHide?(doc: Document, url: URL): boolean;
  /**
   * Called only when `readTarget` returned null: what the page is pointing at, if anything.
   * `{ kind: "symbol" }` asks the caller to resolve that symbol through the backend and guard
   * the result; the other kinds are final and become the strip's reason.
   */
  readGap?(doc: Document, url: URL): TargetGap | null;
  /** Tier 1 only: the trade/swap/buy button to block. Tier 2 adapters omit this — they're
   * dock-only (URL-derived target, no DOM interaction, nothing to block). `url` lets an
   * adapter withhold an anchor on a page of its own host whose trade form is uncaptured. */
  anchor?(doc: Document, url?: URL): HTMLElement | null;
  /**
   * Fallback anchors, best first, for when the trade button is absent or out of the first
   * viewport — and, for a tier-2 adapter, the whole list. `anchor()` is always tried first for
   * tier 1 (`placement.ts`'s `anchorCandidates`), so this can only ever ADD places to mount,
   * never move the trade button the blocker binds to. Declared only where the page shape has
   * actually been read; an unverified selector is a guess, and the Dock is the honest fallback.
   */
  anchorPriority?: AnchorCandidate[];
  /**
   * Extra one-click trade controls on the same page that must be blocked alongside `anchor`
   * — pump.fun's quick-buy chips, which place a trade with a single click and are correctly
   * excluded from anchor selection. Each is bound individually (never a shared container,
   * which would swallow unrelated clicks) and re-synced like the anchor, and the block screen
   * is sized to cover them.
   */
  blockedExtras?(doc: Document): HTMLElement[];
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
