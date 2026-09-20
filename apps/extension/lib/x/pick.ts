import type { Chain, ExtractedAddress } from "@tripwire/core";
import type { TokenOrigin, TokenSource } from "./parse";

export type ChipToken = { kind: "cashtag"; symbol: string } | { kind: "address"; address: ExtractedAddress };

export type PickedToken = {
  token: ChipToken;
  origin: TokenOrigin;
  /** The quoted account's handle when the token came from a quote; null otherwise. */
  handle: string | null;
  /** The words the token was read from, for the bare-0x chain hint. */
  text: string;
};

/**
 * How many chips one post may carry. A rotation post naming five tokens is a whole day's credit
 * cap in one scroll, so the cap is two — and only the first is checked on sight (see the
 * content script: the second spends nothing until it is clicked).
 */
export const MAX_CHIPS = 2;

/** The post's own body first, then a quote, then a link preview, then an image description:
 * least to most removed from what the author actually typed. */
const ORIGIN_RANK: Record<TokenOrigin, number> = { post: 0, quote: 1, card: 2, image: 3 };

/**
 * Whether a post's **first** chip pays for its own check the moment the post scrolls into view —
 * the only thing on X that spends without a click, so this is the whole credit rule (I-3).
 *
 * True only for the author's own words. A quoted post, a link preview and an image description
 * are all tokens the author never typed: the parser strips `https://`, so a post that merely
 * links to a dexscreener or birdeye token page has that contract in its preview, and checking it
 * on sight spends five credits reading somebody else's page. Those chips mount UNCHECKED, say
 * where the token came from, and spend when the reader opens them — the same deal the second
 * chip has always had.
 */
export const checksOnSight = (picked: PickedToken): boolean => picked.origin === "post";

const keyOf = (token: ChipToken): string =>
  token.kind === "address" ? `address:${token.address.address.toLowerCase()}` : `cashtag:${token.symbol.toUpperCase()}`;

/**
 * Every token a post puts on screen, ranked and capped.
 *
 * A contract address wins over a cashtag whenever the post has one, across all sources rather
 * than within one: shill posts pair a namesake ticker ($WIF) with the real CA of a different
 * token, the CA is what buyers paste, and a contract in a quoted post is still the thing being
 * pasted. Within one kind, the post's own words rank ahead of a quote, a link preview and an
 * image description. Duplicates across sources collapse to their first (highest-ranked)
 * appearance, so a post that quotes itself does not pay twice.
 */
export function pickTokens(sources: TokenSource[], limit: number = MAX_CHIPS): PickedToken[] {
  const ordered = [...sources].sort((a, b) => ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin]);
  const picks: PickedToken[] = [];
  const seen = new Set<string>();

  const add = (token: ChipToken, source: TokenSource): void => {
    const key = keyOf(token);
    if (seen.has(key)) return;
    seen.add(key);
    picks.push({ token, origin: source.origin, handle: source.handle, text: source.text });
  };

  for (const source of ordered) for (const address of source.tokens.addresses) add({ kind: "address", address }, source);
  for (const source of ordered) for (const symbol of source.tokens.cashtags) add({ kind: "cashtag", symbol }, source);
  return picks.slice(0, Math.max(0, limit));
}

/** A bare 0x address carries no chain. Default to ethereum; if the tweet mentions "base"
 * anywhere, assume base. Solana addresses are unambiguous (base58 doesn't overlap 0x hex). */
export function chainForAddress(address: ExtractedAddress, tweetText: string): Chain {
  if (address.chain === "solana") return "solana";
  return /base/i.test(tweetText) ? "base" : "ethereum";
}
