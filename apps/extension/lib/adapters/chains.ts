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
  4663: "robinhood",
};

/** Jumper's non-numeric Solana "chain id". */
export const JUMPER_SOLANA_CHAIN_ID = "1151111081099710";

/** Uniswap's `chain` query-param names -> Chain. */
export const UNISWAP_CHAIN_NAMES: Record<string, Chain> = {
  mainnet: "ethereum",
  robinhood: "robinhood",
  "robinhood-chain": "robinhood",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bnb: "bnb",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
};

/** PancakeSwap's `chain` param. Its own spelling is `bsc`, which `UNISWAP_CHAIN_NAMES` has no
 * reason to carry — so pancakeswap gets its own map rather than aliasing bsc into Uniswap's,
 * the way birdeye and dexscreener already do. Case is normalised at the call site. */
export const PANCAKESWAP_CHAIN_NAMES: Record<string, Chain> = {
  ...UNISWAP_CHAIN_NAMES,
  bsc: "bnb",
};

/** Birdeye's `chain` names -> Chain. Since Birdeye's 308 to `/<chain>/token/<addr>` these are
 * path segments rather than a query param (accepts both "bnb" and the more common "bsc"
 * spelling some Birdeye links use). */
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

const NATIVE_EVM_RE = /^(eth|native|0x0{40}|0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)$/i;

/** True for native-coin placeholders (ETH, NATIVE, zero or 0xeeee… sentinel addresses).
 * Normalize verified native identities before requesting Nansen data. Not applied to Solana: the wrapped-SOL mint
 * (`So111…112`) is a real, guardable token address there. */
export function isNativeEvm(value: string): boolean {
  return NATIVE_EVM_RE.test(value);
}

/** Nansen indexes native ETH under this identifier, rather than a venue's zero marker. */
export const NANSEN_NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NATIVE_ETH_CHAINS = new Set<Chain>(["ethereum", "arbitrum", "base", "optimism"]);

/** Preserve the selected chain and normalize verified native ETH identities for Nansen. */
export function evmTarget(chain: Chain, address: string | null | undefined): SpotTarget | null {
  if (!address) return null;
  if (isNativeEvm(address)) return NATIVE_ETH_CHAINS.has(chain) ? { kind: "spot", chain, tokenAddress: NANSEN_NATIVE_ETH, symbol: "ETH" } : null;
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
  "9270000000000000": "Sui",
  "1201081091099710": "Stellar",
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

/**
 * The same answer as `OTHER_CHAIN_NAMES`, for the venues that write a chain's NAME in the URL
 * rather than its EVM id: Dexscreener and Birdeye path segments, gmgn's short segments,
 * PancakeSwap's `chain` param. Checked against Dexscreener's live chain rail (2026-09-20) so a
 * routine "this pool is on Sui" reads as coverage rather than as the generic shrug.
 *
 * Only chains Tripwire does NOT cover belong here; a slug for a covered chain lives in that
 * venue's own name map and resolves to a target.
 */
export const OTHER_CHAIN_SLUGS: Record<string, string> = {
  // Non-EVM
  sui: "Sui",
  aptos: "Aptos",
  ton: "TON",
  tron: "Tron",
  bitcoin: "Bitcoin",
  near: "NEAR",
  cardano: "Cardano",
  osmosis: "Osmosis",
  injective: "Injective",
  starknet: "Starknet",
  stellar: "Stellar",
  algorand: "Algorand",
  hedera: "Hedera",
  icp: "Internet Computer",
  // EVM and EVM-adjacent chains Nansen's token endpoints do not cover
  hyperliquid: "Hyperliquid",
  hyperevm: "HyperEVM",
  berachain: "Berachain",
  sonic: "Sonic",
  monad: "Monad",
  linea: "Linea",
  scroll: "Scroll",
  blast: "Blast",
  mantle: "Mantle",
  zksync: "zkSync Era",
  zksyncera: "zkSync Era",
  gnosis: "Gnosis",
  celo: "Celo",
  fantom: "Fantom",
  sonicbeta: "Sonic",
  metis: "Metis",
  mode: "Mode",
  opbnb: "opBNB",
  unichain: "Unichain",
  worldchain: "World Chain",
  sei: "Sei",
  seiv2: "Sei",
  taiko: "Taiko",
  zora: "Zora",
  lisk: "Lisk",
  soneium: "Soneium",
  ink: "Ink",
  abstract: "Abstract",
  cronos: "Cronos",
  cronoszkevm: "Cronos zkEVM",
  moonbeam: "Moonbeam",
  moonriver: "Moonriver",
  kava: "Kava",
  kaia: "Kaia",
  klaytn: "Kaia",
  pulsechain: "PulseChain",
  arbitrumnova: "Arbitrum Nova",
  polygonzkevm: "Polygon zkEVM",
  bob: "BOB",
  corn: "Corn",
  plume: "Plume",
  story: "Story",
  katana: "Katana",
  flow: "Flow EVM",
  flowevm: "Flow EVM",
  filecoin: "Filecoin EVM",
  rootstock: "Rootstock",
  velas: "Velas",
  telos: "Telos",
  energi: "Energi",
  oasissapphire: "Oasis Sapphire",
  core: "Core",
  zetachain: "ZetaChain",
  apechain: "ApeChain",
  degenchain: "Degen Chain",
  shape: "Shape",
  swellchain: "Swellchain",
  fraxtal: "Fraxtal",
  bitlayer: "Bitlayer",
  merlinchain: "Merlin",
  xlayer: "X Layer",
  bounce: "Bounce",
  etherlink: "Etherlink",
  gravity: "Gravity",
  sanko: "Sanko",
  wemix: "WEMIX",
  iotex: "IoTeX",
  neonevm: "Neon EVM",
  eclipse: "Eclipse",
  solanadevnet: "Solana devnet",
  // The remainder of Dexscreener's live rail, read from dexscreener.com on 2026-09-20.
  arc: "Arc",
  beam: "Beam",
  conflux: "Conflux",
  flare: "Flare",
  fuse: "Fuse",
  manta: "Manta",
  megaeth: "MegaETH",
  movement: "Movement",
  multiversx: "MultiversX",
  plasma: "Plasma",
  polkadot: "Polkadot",
  stable: "Stable",
  stacks: "Stacks",
  stepnetwork: "Step Network",
  xrpl: "XRPL",
};

/** Every chain-name spelling that resolves to a chain Tripwire DOES cover, across the venue
 * maps. Used only to stop a coverage line being printed about a chain we in fact cover. */
const COVERED_CHAIN_SLUGS = new Set<string>([
  ...Object.keys(UNISWAP_CHAIN_NAMES),
  ...Object.keys(PANCAKESWAP_CHAIN_NAMES),
  ...Object.keys(BIRDEYE_CHAIN_NAMES),
  ...Object.keys(GMGN_CHAIN_SEGMENTS),
  "solana",
  "sol",
]);

/** True when a venue's own chain spelling names a chain Tripwire covers. */
export function isCoveredChainSlug(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return COVERED_CHAIN_SLUGS.has(key) || EVM_CHAIN_IDS[Number(key)] !== undefined;
}

/** A chain Tripwire covers, spelled the way a sentence should spell it. */
const CHAIN_DISPLAY_NAMES: Record<Chain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  bnb: "BNB Chain",
  polygon: "Polygon",
  avalanche: "Avalanche",
  robinhood: "Robinhood Chain",
};

export function chainName(chain: Chain): string {
  return CHAIN_DISPLAY_NAMES[chain];
}

/** A chain's name for the strip: the one Tripwire knows, else "chain <id>". */
export function chainLabel(id: string): string {
  const named = OTHER_CHAIN_NAMES[id] ?? OTHER_CHAIN_SLUGS[id.trim().toLowerCase()];
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
  robinhood: "ETH",
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

/** The first word of one piece of text, as a symbol, or null when it is a placeholder or not
 * symbol-shaped. */
function symbolFrom(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || PLACEHOLDER_RE.test(trimmed)) return null;
  const first = trimmed.split(/\s+/)[0]!;
  return SYMBOL_RE.test(first) ? first.toUpperCase() : null;
}

/**
 * The text of every deepest element under `el` — the leaves, in document order. `textContent`
 * on the selector itself concatenates them with no separator, which is how an MUI avatar's
 * one-letter monogram in front of a label turned DEGEN into `DDEGEN` and sent Tripwire looking
 * for a token that does not exist. Reading the leaves keeps them apart.
 *
 * Deliberately not `innerText`: it forces layout on every tick of the venue loop, and
 * happy-dom does not implement it, so the tests could not see what shipped.
 */
function leafTexts(el: Element): string[] {
  if (typeof el.querySelectorAll !== "function") return [];
  const out: string[] = [];
  for (const node of el.querySelectorAll("*")) {
    if (node.childElementCount > 0) continue;
    const text = (node.textContent ?? "").trim();
    if (text) out.push(text);
  }
  return out;
}

export function readTokenSymbol(el: Element | null | undefined): string | null {
  if (!el) return null;
  const leaves = leafTexts(el);
  const whole = (el.textContent ?? "").trim();
  const candidates = leaves.length > 0 ? leaves : whole ? [whole] : [];
  if (candidates.length === 0) return null;
  // A monogram avatar is exactly one character, and a one-letter leaf beside a longer one is
  // never the ticker. A genuinely one-character symbol standing alone is still read.
  const named = candidates.filter((text) => text.split(/\s+/)[0]!.length > 1);
  for (const text of named.length > 0 ? named : candidates) {
    const symbol = symbolFrom(text);
    if (symbol) return symbol;
  }
  return null;
}
