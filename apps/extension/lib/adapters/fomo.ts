import type { Target } from "@tripwire/core";
import { evmTarget, FOMO_CHAIN_NAMES, solanaTarget } from "./chains";
import { closestWithin, isVisible } from "./dom";
import { uncoveredChainGap } from "./gap";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

/**
 * fomo's token page: `fomo.family/tokens/<chain>/<address>`. Read from the route table in its own
 * bundle (`routes/token` -> `tokens/:chain/:tokenAddress`) rather than guessed, so a rename shows
 * up as no match instead of a wrong target.
 */
const TOKEN_PATH_RE = /^\/tokens\/([^/?#]+)\/([^/?#]+)/;

/**
 * The trade card's primary action, which fomo labels with the token: "Buy swordcat", "Sell
 * swordcat" (live check 2026-09-28, logged in). The card carries no role, test id or stable class
 * — only Tailwind utilities — so the label plus the card's own shape is all there is to match on.
 */
const SUBMIT_RE = /^(buy|sell)\s+\S/i;
/** The Buy|Sell segmented control above the amount. Never the anchor: it switches side, it does
 * not place a trade, and covering it would block the user from reaching Sell. */
const SIDE_TAB_RE = /^(buy|sell)$/i;
const CARD_MAX_DEPTH = 4;

/**
 * The trade card: the box holding the Buy|Sell tabs, the amount input and the submit button. Found
 * from the amount input upwards, because the input is the one element on the page whose purpose is
 * unambiguous — the page has another text input (the global search), and it is nowhere near a
 * Buy|Sell pair.
 */
function tradeCard(doc: Document): Element | null {
  for (const input of doc.querySelectorAll("input")) {
    if (!isVisible(input)) continue;
    const card = closestWithin(input, CARD_MAX_DEPTH, (el) => {
      const labels = [...el.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim().toLowerCase());
      return labels.includes("buy") && labels.includes("sell");
    });
    if (card) return card;
  }
  return null;
}

/**
 * Tier 1: the verdict goes over the button that places the trade.
 *
 * Logged out there is no trade form at all — fomo puts the whole app behind a login — so `anchor`
 * answers null and the runner falls back to the docked verdict. Tripwire never blocks blind.
 *
 * fomo also lists chains Tripwire has no coverage for (monad, arc). Those read as a stated
 * coverage gap, never a defaulted chain: resolving a Monad address as Ethereum would produce a
 * confident verdict about a token that is not there (the `pancakeswap.ts` ruling).
 */
export const fomoAdapter: VenueAdapter = {
  id: "fomo",
  tier: 1,
  match(url) {
    return url.hostname === "fomo.family";
  },
  readTarget(_doc, url): Target | null {
    const [, chainSlug, address] = TOKEN_PATH_RE.exec(url.pathname) ?? [];
    if (!chainSlug || !address) return null;
    const chain = FOMO_CHAIN_NAMES[chainSlug.toLowerCase()];
    if (!chain) return null;
    return chain === "solana" ? solanaTarget(address) : evmTarget(chain, address);
  },
  anchor(doc) {
    const card = tradeCard(doc);
    if (!card) return null;
    // Deliberately not `findButtons`, which skips disabled buttons: fomo disables the submit until
    // an amount is typed, and a block that only appears once the user has filled the form in is a
    // block that arrives after the decision. The dangerous moment is before the amount, not after.
    const buttons = [...card.querySelectorAll("button")].filter(
      (btn) => SUBMIT_RE.test((btn.textContent ?? "").trim()) && !SIDE_TAB_RE.test((btn.textContent ?? "").trim()) && isVisible(btn),
    );
    return (buttons[buttons.length - 1] as HTMLButtonElement | undefined) ?? null;
  },
  readGap(_doc, url): TargetGap | null {
    return uncoveredChainGap(TOKEN_PATH_RE.exec(url.pathname)?.[1]);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
