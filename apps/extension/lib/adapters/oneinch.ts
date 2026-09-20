import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS } from "./chains";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/**
 * 1inch moved. `https://app.1inch.io/` answers **301** to `https://1inch.com/`, and the swap
 * page there is `1inch.com/swap?src=<chainId>:<address>&dst=<chainId>:<address>`.
 *
 * `app.1inch.io` stays in the match list and stays parsed: the 301 means that host's content
 * script sees a redirect, not a page, so removing it would buy nothing and would break any
 * still-live deep link. The new host is what the user actually lands on.
 */
const HOSTS = new Set(["app.1inch.io", "1inch.com"]);

/** Legacy hash route: `#/<chainId>/simple/swap/<from>/<to>`, each token spec optionally
 * prefixed `<chainId>:`. */
function parseHashSwap(hash: string): { chainId: string; to: string } | null {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const chainId = parts[0];
  const to = parts[parts.length - 1];
  if (!chainId || !to || parts.length < 4) return null;
  const stripped = to.includes(":") ? to.split(":")[1]! : to;
  return { chainId, to: stripped };
}

/** Current route: `?dst=<chainId>:<address>` (the token being bought). `src` is what the user
 * is spending, which Tripwire has no verdict about. */
function parseDst(url: URL): { chainId: string; to: string } | null {
  const dst = url.searchParams.get("dst");
  if (!dst) return null;
  const [chainId, to] = dst.includes(":") ? dst.split(":") : [null, null];
  return chainId && to ? { chainId, to } : null;
}

/** Tier 2, URL-only spot, dock only: the TO/dst token. */
export const oneinchAdapter: VenueAdapter = {
  id: "1inch",
  tier: 2,
  match(url) {
    return HOSTS.has(url.hostname);
  },
  readTarget(_doc, url): Target | null {
    const parsed = parseDst(url) ?? parseHashSwap(url.hash);
    if (!parsed) return null;
    const chain = EVM_CHAIN_IDS[Number(parsed.chainId)];
    if (!chain) return null;
    return evmTarget(chain, parsed.to);
  },
  /**
   * 1inch is not EVM-only — it writes `dst=501:<base58>` for Solana — so an unrecognised
   * numeric id here gets no "chain <id>" fallback. 501 is not in `EVM_CHAIN_IDS` and is
   * **unverified**; claiming Tripwire has no data for that network would be false if it is
   * Solana, which Tripwire covers. Silence until the id is confirmed.
   */
  readGap(_doc, url): TargetGap | null {
    const parsed = parseDst(url) ?? parseHashSwap(url.hash);
    return uncoveredChainGap(parsed?.chainId);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
