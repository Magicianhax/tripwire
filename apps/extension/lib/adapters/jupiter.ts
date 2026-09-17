import type { Target } from "@tripwire/core";
import { solanaTarget } from "./chains";
import { findButton } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const PATH_PAIR_RE = /^\/swap\/([^/]+)-([^/]+)$/;
const ANCHOR_RE = /^(swap|place order)$/i;

/** `jup.ag/swap/<in>-<out>`, or `?sell=&buy=` / `?inputMint=&outputMint=` on `/swap` or the root
 * page -> spot solana (the OUT/buy mint). */
function outMint(url: URL): string | null {
  const pathMatch = PATH_PAIR_RE.exec(url.pathname);
  if (pathMatch) return pathMatch[2] ?? null;
  return url.searchParams.get("buy") ?? url.searchParams.get("outputMint");
}

/** The root page is the swap widget too, but only guard it when the URL names a pair. */
function isRootSwap(url: URL): boolean {
  if (url.pathname !== "/" && url.pathname !== "") return false;
  return url.searchParams.has("buy") || url.searchParams.has("outputMint");
}

export const jupiterAdapter: VenueAdapter = {
  id: "jupiter",
  tier: 1,
  match(url) {
    return url.hostname === "jup.ag" && (url.pathname.startsWith("/swap") || isRootSwap(url));
  },
  readTarget(_doc, url): Target | null {
    return solanaTarget(outMint(url));
  },
  anchor(doc) {
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
