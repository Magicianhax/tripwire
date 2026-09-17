import type { Target } from "@tripwire/core";
import { evmTarget, EVM_CHAIN_IDS, JUMPER_SOLANA_CHAIN_ID, solanaTarget } from "./chains";
import { findButtons, isNavigation, isVisible } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

// Whole-label match on the widget's primary action; nav/tab/link items with the same words are skipped.
const ANCHOR_RE = /^(exchange|swap|bridge|review( swap| bridge)?|start (swap|bridging))$/i;
// The LI.FI widget's primary action, whatever its label ("Connect wallet" logged out, live check 2026-09-17).
const TRANSACTION_BUTTON = '[data-testid="widget-transaction-button"]';
// jumper.exchange redirects to jumper.xyz.
const HOSTS = new Set(["jumper.exchange", "jumper.xyz"]);

export const jumperAdapter: VenueAdapter = {
  id: "jumper",
  tier: 1,
  match(url) {
    return HOSTS.has(url.hostname);
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
    for (const btn of doc.querySelectorAll(TRANSACTION_BUTTON)) {
      if (btn instanceof HTMLButtonElement && !btn.disabled && isVisible(btn)) return btn;
    }
    const candidates = findButtons(doc, ANCHOR_RE, isNavigation);
    return candidates[candidates.length - 1] ?? null;
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
