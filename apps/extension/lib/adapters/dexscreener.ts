import { isEvmAddress, type Chain, type Target } from "@tripwire/core";
import { closestWithin } from "./dom";
import { uncoveredChainGap } from "./gap";
import { isInVolatileContainer } from "./placement";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/** Dexscreener routes are provider-specific, not Birdeye's supported-chain list. */
const DEXSCREENER_CHAIN_NAMES: Record<string, Chain> = {
  solana: "solana", ethereum: "ethereum", base: "base", arbitrum: "arbitrum",
  bnb: "bnb", bsc: "bnb", polygon: "polygon", optimism: "optimism",
  avalanche: "avalanche", robinhood: "robinhood",
} satisfies Record<Chain | "bsc", Chain>;

/** Pair identity only: the runner resolves it through the backend before guarding a token.
 * Dexscreener lowercases even Solana pair URLs; these are provider IDs, not mint addresses. */
export function readDexscreenerPair(url: URL): { chain: Chain; pairAddress: string } | null {
  if (url.hostname !== "dexscreener.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const chain = DEXSCREENER_CHAIN_NAMES[segments[0]!];
  const pairAddress = segments[1]!;
  // Uniswap v4 uses a bytes32 pool ID rather than a contract address.
  if (!chain || !(chain === "solana" ? /^[a-zA-Z0-9]{32,44}$/.test(pairAddress)
    : isEvmAddress(pairAddress) || /^0x[0-9a-fA-F]{64}$/.test(pairAddress))) return null;
  return { chain, pairAddress };
}

/** The pair identity heading: `$WIF … /SOL`. Dexscreener writes the traded symbol with the
 * dollar sign; the token *name* ("dogwifhat") is a separate heading above it. */
const PAIR_HEADING_RE = /^\$[A-Za-z0-9]/;
/** How far above the heading the identity block can be. */
const MAX_HEADER_DEPTH = 4;

/**
 * The pair header at the top of Dexscreener's data panel — the symbol row plus the chain and
 * DEX badges under it. Read off the live page (`dexscreener.com/solana/<WIF mint>`) at
 * 1440x900 on 2026-09-20: it sits at x1118 y54, 295px wide, directly above the price readouts,
 * which is where a trader reading this page is already looking.
 *
 * Selected structurally, never by class: every class on that page is an emotion hash
 * (`custom-16ghqzx`) that changes with each deploy. The anchor is "the nearest block around the
 * `$SYMBOL` heading that also carries the chain and DEX links" — two internal links, which is
 * exactly the badge row and nothing above or below it.
 *
 * A heading inside the Virtuoso transactions pane is skipped rather than taken: those rows are
 * recycled, and mounting there is the "needs a good eye" failure this whole round is about.
 */
function pairHeader(doc: Document): HTMLElement | null {
  const main = doc.querySelector("main");
  if (!main) return null;
  for (const heading of main.querySelectorAll("h1, h2")) {
    if (!PAIR_HEADING_RE.test((heading.textContent ?? "").trim())) continue;
    if (isInVolatileContainer(heading)) continue;
    const block = closestWithin(heading, MAX_HEADER_DEPTH, (el) => el.querySelectorAll('a[href^="/"]').length >= 2);
    const chosen = block ?? heading;
    return chosen instanceof HTMLElement ? chosen : null;
  }
  return null;
}

/** Tier 2: the URL is a pool, never a token. Async pair resolution lives in the runner. */
export const dexscreenerAdapter: VenueAdapter = {
  id: "dexscreener",
  tier: 2,
  match(url) {
    return url.hostname === "dexscreener.com";
  },
  readTarget(_doc, _url): Target | null {
    return null;
  },
  /**
   * Dexscreener's chain rail is 60-odd chains wide and most of them are outside Tripwire's
   * coverage, so "Sui" is the answer to a Sui pool — not the shrug the dock printed before.
   * A covered chain returns null here and resolves through the pair lookup in the runner.
   */
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(url.pathname.split("/").filter(Boolean)[0]);
  },
  /** The venue in the report. One placement, under the pair header, full width of that panel —
   * not the pairs table, not the trending rail, not a corner of the transactions grid. */
  anchorPriority: [{ role: "token-identity", find: pairHeader }],
  overridePhrase: OVERRIDE_PHRASES.spot,
};
