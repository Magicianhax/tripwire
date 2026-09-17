import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS, JUMPER_SOLANA_CHAIN_ID, solanaTarget } from "./chains";
import { findButton } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const ANCHOR_RE = /exchange|swap|bridge|review/i;

export const jumperAdapter: VenueAdapter = {
  id: "jumper",
  tier: 1,
  match(url) {
    return url.hostname === "jumper.exchange";
  },
  readTarget(_doc, url): Target | null {
    const toToken = url.searchParams.get("toToken");
    const toChain = url.searchParams.get("toChain");
    if (!toToken || !toChain) return null;
    if (toChain === JUMPER_SOLANA_CHAIN_ID) return solanaTarget(toToken);
    const chain = EVM_CHAIN_IDS[Number(toChain)];
    if (!chain) return null; // unknown chain -> UNCHECKED dock is fine
    return evmTarget(chain, toToken);
  },
  anchor(doc) {
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
