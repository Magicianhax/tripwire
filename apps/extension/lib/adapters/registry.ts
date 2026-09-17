import { aerodromeAdapter } from "./aerodrome";
import { axiomAdapter } from "./axiom";
import { birdeyeAdapter } from "./birdeye";
import { bullxAdapter } from "./bullx";
import { cowAdapter } from "./cow";
import { dexscreenerAdapter } from "./dexscreener";
import { gmgnAdapter } from "./gmgn";
import { hyperliquidAdapter } from "./hyperliquid";
import { jumperAdapter } from "./jumper";
import { jupiterAdapter } from "./jupiter";
import { matchaAdapter } from "./matcha";
import { oneinchAdapter } from "./oneinch";
import { pancakeswapAdapter } from "./pancakeswap";
import { photonAdapter } from "./photon";
import { polymarketAdapter } from "./polymarket";
import { pumpfunAdapter } from "./pumpfun";
import { raydiumAdapter } from "./raydium";
import type { VenueAdapter } from "./types";
import { uniswapAdapter } from "./uniswap";

export const ADAPTERS: VenueAdapter[] = [
  // Tier 1
  jupiterAdapter,
  pumpfunAdapter,
  uniswapAdapter,
  jumperAdapter,
  hyperliquidAdapter,
  polymarketAdapter,
  // Tier 2
  raydiumAdapter,
  aerodromeAdapter,
  pancakeswapAdapter,
  oneinchAdapter,
  matchaAdapter,
  cowAdapter,
  axiomAdapter,
  photonAdapter,
  gmgnAdapter,
  bullxAdapter,
  dexscreenerAdapter,
  birdeyeAdapter,
];

export function findAdapter(url: URL): VenueAdapter | null {
  return ADAPTERS.find((adapter) => adapter.match(url)) ?? null;
}
