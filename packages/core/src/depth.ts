/**
 * The card's lazy sections: the things a tab (or the expanded view) asks for *after* the card is
 * already on screen, never as part of opening it.
 *
 * The names and the prices live in core because three places have to agree about them: the route
 * that validates the request, the backend that builds each section, and the card that both asks
 * for one and prints what it costs before the user opens the tab.
 */

export const DEPTH_SECTIONS = ["perpMarket", "perpVenues", "perpTraders", "perpChart", "spotHolders", "predictionBook"] as const;
export type DepthSection = (typeof DEPTH_SECTIONS)[number];

/**
 * The Nansen cost of a section, per target per cache window, **measured** in the recording run
 * (`scripts/record-depth-fixtures.mjs`) rather than read off a price list:
 *
 * | Section          | Calls                                                   | Credits |
 * |------------------|---------------------------------------------------------|---------|
 * | `perpMarket`     | Hyperliquid public info (meta, funding history, book)     | 0       |
 * | `perpVenues`     | Hyperliquid + Binance + Bybit + OKX + dYdX public APIs    | 0       |
 * | `perpChart`      | Hyperliquid `candleSnapshot`                             | 0       |
 * | `perpTraders`    | `tgm/perp-pnl-leaderboard` 5 + `perp-leaderboard` 5 + `tgm/perp-trades` 1 | 11 |
 * | `spotHolders`    | `tgm/holders`                                            | 5       |
 * | `predictionBook` | `prediction-market/orderbook`                            | 1       |
 *
 * Zero means the section is built entirely from free public exchange APIs, which are
 * rate-limited rather than metered.
 */
export const DEPTH_SECTION_CREDITS: Record<DepthSection, number> = {
  perpMarket: 0,
  perpVenues: 0,
  perpTraders: 11,
  perpChart: 0,
  spotHolders: 5,
  predictionBook: 1,
};

/** What a tab costs to open: the sum of the sections it has not already loaded. */
export function depthCost(sections: readonly DepthSection[]): number {
  return sections.reduce((sum, s) => sum + (DEPTH_SECTION_CREDITS[s] ?? 0), 0);
}

/** "5 credits" / "free" -- the footer line a tab prints before it is opened. */
export function depthCostLabel(sections: readonly DepthSection[]): string {
  const credits = depthCost(sections);
  return credits === 0 ? "free" : `${credits} credit${credits === 1 ? "" : "s"}`;
}
