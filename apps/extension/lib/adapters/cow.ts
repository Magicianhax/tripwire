import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** `#/<chainId>/swap/<sell>/<buy>`. */
function parseHashSwap(hash: string): { chainId: string; buy: string } | null {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [chainId, kind, , buy] = parts;
  if (!chainId || kind !== "swap" || !buy) return null;
  return { chainId, buy };
}

/** Tier 2, URL-only spot, dock only: `swap.cow.fi/#/<chainId>/swap/<sell>/<buy>` -> spot, the
 * BUY token. */
export const cowAdapter: VenueAdapter = {
  id: "cow",
  tier: 2,
  match(url) {
    return url.hostname === "swap.cow.fi";
  },
  readTarget(_doc, url): Target | null {
    const parsed = parseHashSwap(url.hash);
    if (!parsed) return null;
    const chain = EVM_CHAIN_IDS[Number(parsed.chainId)];
    if (!chain) return null;
    return evmTarget(chain, parsed.buy);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
