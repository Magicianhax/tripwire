import type { Target } from "@tripwire/core";
import { solanaTarget } from "./chains";
import { findButtons, hasNearbyInput, isInCard, isNavigation } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const COIN_PATH_RE = /^\/coin\/([^/]+)/;
const PLACE_TRADE_RE = /^place trade$/i;
const BUY_RE = /^buy$/i;

/** Quick-buy buttons on token cards/lists and site nav are never the anchor. */
const notTradeForm = (btn: HTMLButtonElement) => isInCard(btn) || isNavigation(btn);

export const pumpfunAdapter: VenueAdapter = {
  id: "pumpfun",
  tier: 1,
  match(url) {
    return url.hostname === "pump.fun" && COIN_PATH_RE.test(url.pathname);
  },
  readTarget(_doc, url): Target | null {
    const match = COIN_PATH_RE.exec(url.pathname);
    return solanaTarget(match?.[1]);
  },
  anchor(doc) {
    // "Place trade" first; else an exact "Buy" that sits in the trade form next to its amount input.
    const place = findButtons(doc, PLACE_TRADE_RE, notTradeForm);
    if (place.length) return place[place.length - 1]!;
    const buy = findButtons(doc, BUY_RE, (btn) => notTradeForm(btn) || !hasNearbyInput(btn));
    return buy[buy.length - 1] ?? null;
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
