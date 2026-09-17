import type { Chain, ExtractedAddress } from "@tripwire/core";
import type { ParsedTweet } from "./parse";

export type ChipToken = { kind: "cashtag"; symbol: string } | { kind: "address"; address: ExtractedAddress };

/**
 * The one token a tweet's chip checks. A contract address wins over a cashtag whenever the post
 * has one: shill posts pair a namesake ticker ($WIF) with the real CA of a different token, and
 * the CA is what buyers paste. Otherwise the first cashtag.
 */
export function pickToken(tokens: ParsedTweet["tokens"]): ChipToken | null {
  const address = tokens.addresses[0];
  if (address) return { kind: "address", address };
  const cashtag = tokens.cashtags[0];
  if (cashtag) return { kind: "cashtag", symbol: cashtag };
  return null;
}

/** A bare 0x address carries no chain. Default to ethereum; if the tweet mentions "base"
 * anywhere, assume base. Solana addresses are unambiguous (base58 doesn't overlap 0x hex). */
export function chainForAddress(address: ExtractedAddress, tweetText: string): Chain {
  if (address.chain === "solana") return "solana";
  return /base/i.test(tweetText) ? "base" : "ethereum";
}
