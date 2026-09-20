import type { Chain } from "./types";

/** A bundled brand mark: its owner's name (the image's alt text) and its path inside the
 * extension package and the web app's public dir. Provenance: apps/extension/public/logos/SOURCES.md. */
export type BrandLogo = { name: string; file: string };

/** Adapter ids of every supported venue (apps/extension/lib/adapters). */
export const VENUE_IDS = [
  "jupiter",
  "pumpfun",
  "uniswap",
  "jumper",
  "hyperliquid",
  "polymarket",
  "raydium",
  "aerodrome",
  "pancakeswap",
  "1inch",
  "matcha",
  "cow",
  "axiom",
  "photon",
  "gmgn",
  "bullx",
  "dexscreener",
  "birdeye",
] as const;
export type VenueId = (typeof VENUE_IDS)[number];

export const VENUE_LOGOS: Record<VenueId, BrandLogo> = {
  jupiter: { name: "Jupiter", file: "logos/jupiter.svg" },
  pumpfun: { name: "pump.fun", file: "logos/pumpfun.png" },
  uniswap: { name: "Uniswap", file: "logos/uniswap.svg" },
  jumper: { name: "Jumper", file: "logos/jumper.svg" },
  hyperliquid: { name: "Hyperliquid", file: "logos/hyperliquid.png" },
  polymarket: { name: "Polymarket", file: "logos/polymarket.svg" },
  raydium: { name: "Raydium", file: "logos/raydium.png" },
  aerodrome: { name: "Aerodrome", file: "logos/aerodrome.svg" },
  pancakeswap: { name: "PancakeSwap", file: "logos/pancakeswap.png" },
  "1inch": { name: "1inch", file: "logos/1inch.svg" },
  matcha: { name: "Matcha", file: "logos/matcha.svg" },
  cow: { name: "CoW Swap", file: "logos/cow.svg" },
  axiom: { name: "Axiom", file: "logos/axiom.png" },
  photon: { name: "Photon", file: "logos/photon.png" },
  gmgn: { name: "GMGN", file: "logos/gmgn.png" },
  bullx: { name: "BullX", file: "logos/bullx.png" },
  dexscreener: { name: "DEX Screener", file: "logos/dexscreener.png" },
  birdeye: { name: "Birdeye", file: "logos/birdeye.png" },
};

export const CHAIN_LOGOS: Partial<Record<Chain, BrandLogo>> = {
  solana: { name: "Solana", file: "logos/chain-solana.svg" },
  ethereum: { name: "Ethereum", file: "logos/chain-ethereum.svg" },
  base: { name: "Base", file: "logos/chain-base.svg" },
  arbitrum: { name: "Arbitrum", file: "logos/chain-arbitrum.svg" },
  bnb: { name: "BNB Chain", file: "logos/chain-bnb.svg" },
  polygon: { name: "Polygon", file: "logos/chain-polygon.svg" },
  optimism: { name: "Optimism", file: "logos/chain-optimism.svg" },
  avalanche: { name: "Avalanche", file: "logos/chain-avalanche.svg" },
};

/** Only for the "Powered by Nansen" credit, never as Tripwire's own logo. */
export const NANSEN_LOGO: BrandLogo = { name: "Nansen", file: "logos/nansen.svg" };

/** Tripwire's own product identity, distinct from its intelligence provider and venues. */
export const TRIPWIRE_LOGO: BrandLogo = { name: "Tripwire", file: "logos/tripwire.png" };

/**
 * The perp venues quoted in the cross-venue funding table. Hyperliquid already has a venue mark
 * above; the others are marks of exchanges Tripwire only *reads*, so they are kept in their own
 * registry rather than in VENUE_LOGOS, which means "a page Tripwire runs on".
 */
export const PERP_VENUE_LOGOS: Record<string, BrandLogo> = {
  hyperliquid: { name: "Hyperliquid", file: "logos/hyperliquid.png" },
  binance: { name: "Binance", file: "logos/perp-binance.svg" },
  bybit: { name: "Bybit", file: "logos/perp-bybit.png" },
  okx: { name: "OKX", file: "logos/perp-okx.svg" },
  dydx: { name: "dYdX", file: "logos/perp-dydx.svg" },
};

export function perpVenueLogo(id: string): BrandLogo | null {
  return Object.hasOwn(PERP_VENUE_LOGOS, id) ? PERP_VENUE_LOGOS[id]! : null;
}

export function venueLogo(id: string): BrandLogo | null {
  return Object.hasOwn(VENUE_LOGOS, id) ? VENUE_LOGOS[id as VenueId] : null;
}

export function chainLogo(chain: string): BrandLogo | null {
  return CHAIN_LOGOS[chain as Chain] ?? null;
}
