import type { Target } from "@tripwire/core";
import { chainLabel, evmTarget, EVM_CHAIN_IDS, isNativeEvm, isNativeSymbol, JUMPER_SOLANA_CHAIN_ID, readTokenSymbol, solanaTarget } from "./chains";
import { findButtons, isNavigation, isVisible } from "./dom";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

// Whole-label match on the widget's primary action; nav/tab/link items with the same words are skipped.
const ANCHOR_RE = /^(exchange|swap|bridge|review( swap| bridge)?|start (swap|bridging))$/i;
// The LI.FI widget's primary action, whatever its label ("Connect wallet" logged out, live check 2026-09-17).
const TRANSACTION_BUTTON = '[data-testid="widget-transaction-button"]';
// jumper.exchange redirects to jumper.xyz.
const HOSTS = new Set(["jumper.exchange", "jumper.xyz"]);
/** The widget's Receive-side token selector; the From side is `widget-from-token-button`. */
const TO_TOKEN_SELECTOR = '[data-testid="widget-to-token-button"]';

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
  /**
   * Why there is no target. Jumper routes to 60-odd chains, most of which Tripwire does not
   * cover; a Bitcoin destination is a coverage answer, not a failure.
   */
  readGap(doc, url): TargetGap | null {
    const toChain = url.searchParams.get("toChain");
    const toToken = url.searchParams.get("toToken");

    if (toChain) {
      const evm = EVM_CHAIN_IDS[Number(toChain)];
      if (toChain !== JUMPER_SOLANA_CHAIN_ID && !evm) return { kind: "unsupported-chain", label: chainLabel(toChain) };
      if (toToken && evm && isNativeEvm(toToken)) return { kind: "native-asset", symbol: "ETH" };
      if (toToken && isNativeSymbol(toToken, evm ?? "solana")) return { kind: "native-asset", symbol: toToken.toUpperCase() };
      if (toToken) return null; // a real token on a covered chain already became a target
    }

    const symbol = readTokenSymbol(doc.querySelector(TO_TOKEN_SELECTOR));
    if (!symbol) return null;
    const chain = toChain ? EVM_CHAIN_IDS[Number(toChain)] : undefined;
    if (isNativeSymbol(symbol, chain ?? null)) return { kind: "native-asset", symbol };
    return chain ? { kind: "symbol", symbol, chainHint: chain } : { kind: "symbol", symbol };
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
