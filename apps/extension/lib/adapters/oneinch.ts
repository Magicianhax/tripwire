import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS } from "./chains";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

/** `#/<chainId>/simple/swap/<from>/<to>`, each token spec optionally prefixed `<chainId>:`. */
function parseHashSwap(hash: string): { chainId: string; to: string } | null {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const chainId = parts[0];
  const to = parts[parts.length - 1];
  if (!chainId || !to || parts.length < 4) return null;
  const stripped = to.includes(":") ? to.split(":")[1]! : to;
  return { chainId, to: stripped };
}

/** Tier 2, URL-only spot, dock only: `app.1inch.io/#/<chainId>/simple/swap/<from>/<to>` ->
 * spot, the TO token. */
export const oneinchAdapter: VenueAdapter = {
  id: "1inch",
  tier: 2,
  match(url) {
    return url.hostname === "app.1inch.io";
  },
  readTarget(_doc, url): Target | null {
    const parsed = parseHashSwap(url.hash);
    if (!parsed) return null;
    const chain = EVM_CHAIN_IDS[Number(parsed.chainId)];
    if (!chain) return null;
    return evmTarget(chain, parsed.to);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
