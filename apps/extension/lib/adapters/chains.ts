import { isEvmAddress, isSolanaAddress, type Chain, type SpotTarget } from "@tripwire/core";

/** EVM chain-id -> Chain, per task-12-context.md. */
export const EVM_CHAIN_IDS: Record<number, Chain> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  56: "bnb",
  137: "polygon",
  10: "optimism",
  43114: "avalanche",
};

/** Jumper's non-numeric Solana "chain id". */
export const JUMPER_SOLANA_CHAIN_ID = "1151111081099710";

/** Uniswap's `chain` query-param names -> Chain. */
export const UNISWAP_CHAIN_NAMES: Record<string, Chain> = {
  mainnet: "ethereum",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bnb: "bnb",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
};

/** Birdeye's `chain` query-param names -> Chain (accepts both "bnb" and the more common
 * "bsc" spelling some Birdeye links use). */
export const BIRDEYE_CHAIN_NAMES: Record<string, Chain> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bnb: "bnb",
  bsc: "bnb",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
};

/** gmgn.ai's leading path-segment chain hints -> Chain. */
export const GMGN_CHAIN_SEGMENTS: Record<string, Chain> = {
  sol: "solana",
  eth: "ethereum",
  base: "base",
  arb: "arbitrum",
  bsc: "bnb",
  bnb: "bnb",
  polygon: "polygon",
  op: "optimism",
  avax: "avalanche",
};

const NATIVE_EVM_RE = /^(eth|0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)$/i;

/** True for the native-ETH placeholder ("ETH" or the 0xeeee… sentinel address) — we don't
 * guard natives (no ERC-20 to look up on Nansen). Not applied to Solana: the wrapped-SOL mint
 * (`So111…112`) is a real, guardable token address there. */
export function isNativeEvm(value: string): boolean {
  return NATIVE_EVM_RE.test(value);
}

/** Builds an EVM spot target, or null when `address` is missing or the native-ETH sentinel. */
export function evmTarget(chain: Chain, address: string | null | undefined): SpotTarget | null {
  if (!address) return null;
  if (isNativeEvm(address)) return null;
  return { kind: "spot", chain, tokenAddress: address };
}

/** Builds a Solana spot target, or null when `address` is missing. */
export function solanaTarget(address: string | null | undefined): SpotTarget | null {
  if (!address) return null;
  return { kind: "spot", chain: "solana", tokenAddress: address };
}

/** Scans a pathname's segments (in order) for the first base58 (Solana) or 0x (EVM) address —
 * used by the tier-2 terminals (axiom, photon, gmgn, bullx) whose brief rule is just "path
 * contains a base58 or 0x address". EVM addresses here default to `ethereum`: these terminals
 * are Solana-first and give no other chain signal for a bare 0x hit. */
export function scanPathForAddress(pathname: string): SpotTarget | null {
  const segments = pathname.split("/").filter(Boolean);
  for (const seg of segments) {
    if (isSolanaAddress(seg)) return solanaTarget(seg);
    if (isEvmAddress(seg)) return evmTarget("ethereum", seg);
  }
  return null;
}
