import { chainLabel, isCoveredChainSlug, OTHER_CHAIN_NAMES, OTHER_CHAIN_SLUGS } from "./chains";
import type { TargetGap } from "./types";

/**
 * The shared tier-2 `readGap`: "this page is pointing at a chain Tripwire does not cover",
 * built from whatever the venue writes in its own URL — a path segment (dexscreener, gmgn,
 * birdeye), a `chain` param (pancakeswap) or a numeric EVM id (matcha, cow).
 *
 * Only `jumper`, `jupiter` and `uniswap` had a `readGap` at all; every other tier-2 adapter
 * returned bare null, so a Sui pool and an empty swap form printed the same shrug.
 *
 * Two rules keep the line honest:
 *
 * - A slug that names a chain Tripwire DOES cover is never a coverage answer. Saying "no
 *   onchain data on Solana" because one adapter cannot build a Solana target would be a
 *   confident falsehood about the product's own coverage.
 * - A chain we cannot name is silence, not a claim. `numericIdsAreEvm` opts an EVM-only venue
 *   (matcha, cow) into the "chain <id>" fallback, because there an unrecognised numeric id is
 *   certainly an EVM chain outside coverage. A multi-VM venue does not get it: 1inch writes
 *   `501` for Solana, and "no onchain data on this network" about Solana is exactly the class
 *   of confident wrongness this round exists to remove.
 */
export function uncoveredChainGap(
  raw: string | null | undefined,
  { symbol, numericIdsAreEvm = false }: { symbol?: string | null; numericIdsAreEvm?: boolean } = {},
): TargetGap | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key || isCoveredChainSlug(key)) return null;

  const named = OTHER_CHAIN_NAMES[key] ?? OTHER_CHAIN_SLUGS[key];
  if (!named && !(numericIdsAreEvm && /^\d+$/.test(key))) return null;

  return { kind: "unsupported-chain", label: named ?? chainLabel(key), ...(symbol ? { symbol } : {}) };
}
