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

/**
 * Chains a venue can route to that Tripwire does not cover, by the id that venue writes in its
 * URL. Naming them is the whole point: "Tripwire doesn't cover Bitcoin" is an answer, where
 * "couldn't check this: no data" is a shrug. Numeric keys are EVM chain ids; the long ones are
 * LI.FI's own ids for its non-EVM chains.
 */
export const OTHER_CHAIN_NAMES: Record<string, string> = {
  // LI.FI non-EVM ids (docs.li.fi Bitcoin tx example uses 20000000000001).
  "20000000000001": "Bitcoin",
  "1151111081099710": "Solana",
  "1001": "Sui",
  // EVM chains Nansen's token endpoints do not cover.
  "324": "zkSync Era",
  "59144": "Linea",
  "534352": "Scroll",
  "81457": "Blast",
  "5000": "Mantle",
  "100": "Gnosis",
  "42220": "Celo",
  "250": "Fantom",
  "1088": "Metis",
  "34443": "Mode",
  "204": "opBNB",
  "146": "Sonic",
  "130": "Unichain",
  "80094": "Berachain",
  "480": "World Chain",
  "1329": "Sei",
  "999": "HyperEVM",
  "167000": "Taiko",
  "7777777": "Zora",
  "1135": "Lisk",
  "1868": "Soneium",
  "57073": "Ink",
  "2741": "Abstract",
  "728126428": "Tron",
};

/** A chain's name for the strip: the one Tripwire knows, else "chain <id>". */
export function chainLabel(id: string): string {
  const named = OTHER_CHAIN_NAMES[id];
  if (named) return named;
  const supported = EVM_CHAIN_IDS[Number(id)];
  if (supported) return supported.charAt(0).toUpperCase() + supported.slice(1);
  return /^\d+$/.test(id) ? `chain ${id}` : id;
}

/** The coin a chain runs on. Not a token: there is no contract for Nansen to look up. */
export const NATIVE_SYMBOLS: Record<Chain, string> = {
  solana: "SOL",
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  bnb: "BNB",
  polygon: "POL",
  avalanche: "AVAX",
};

/** POL was MATIC until 2024 and both spellings are still in the wild. */
const NATIVE_ALIASES: Record<string, string[]> = { POL: ["POL", "MATIC"] };

/** Is `symbol` the native coin of `chain` (or of any chain, when none is known)? */
export function isNativeSymbol(symbol: string, chain?: Chain | null): boolean {
  const upper = symbol.trim().toUpperCase();
  const natives = chain ? [NATIVE_SYMBOLS[chain]] : Object.values(NATIVE_SYMBOLS);
  return natives.some((native) => (NATIVE_ALIASES[native] ?? [native]).includes(upper));
}

/** A symbol read out of a venue's token selector, or null when nothing is selected there. */
const PLACEHOLDER_RE = /^(select(\s+(a\s+)?token)?|choose(\s+(a\s+)?token)?|token|\.\.\.|—|-)?$/i;
const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9._$-]{0,19}$/;

export function readTokenSymbol(el: Element | null | undefined): string | null {
  const text = (el?.textContent ?? "").trim();
  if (!text || PLACEHOLDER_RE.test(text)) return null;
  const first = text.split(/\s+/)[0]!;
  return SYMBOL_RE.test(first) ? first.toUpperCase() : null;
}
