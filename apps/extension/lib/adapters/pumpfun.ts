import type { Target } from "@tripwire/core";
import { solanaTarget } from "./chains";
import { closestWithin, findButtons, hasNearbyInput, isInCard, isNavigation, isVisible } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const COIN_PATH_RE = /^\/coin\/([^/]+)/;
const PLACE_TRADE_RE = /^place trade$/i;
const BUY_RE = /^buy$/i;
// The trade panel's primary action. Logged out it reads "Connect wallet to trade" (live check
// 2026-09-17); connected labels are inferred ("Buy", "Sell", "Buy <TICKER>", "Place trade").
const PANEL_PRIMARY_RE = /^(connect wallet to trade|place trade|(buy|sell)( [^\s\d$][^\s]*)?)$/i;
const PANEL_MAX_DEPTH = 5;

/** Quick-buy buttons on token cards/lists and site nav are never the anchor. */
const notTradeForm = (btn: HTMLButtonElement) => isInCard(btn) || isNavigation(btn);

/** A Buy|Sell tab or other segmented control. pump.fun's plain buttons carry aria-pressed="false",
 * so aria-pressed alone does not make a toggle here. */
function isTabOrToggle(btn: HTMLButtonElement): boolean {
  const role = btn.getAttribute("role");
  return role === "tab" || role === "radio" || btn.hasAttribute("aria-selected") || btn.hasAttribute("aria-checked");
}

const isQuickAmount = (btn: HTMLButtonElement) => /^quick (buy|sell)\b/i.test(btn.getAttribute("aria-label") ?? "");

/** The live trade panel: a rendered Buy|Sell tablist, up to a few levels below the section that
 * also holds the amount input; its primary is the last matching non-tab, non-quick-amount button. */
function panelAnchor(doc: Document): HTMLButtonElement | null {
  for (const tablist of doc.querySelectorAll('[role="tablist"]')) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].map((tab) => (tab.textContent ?? "").trim().toLowerCase());
    if (!tabs.includes("buy") || !tabs.includes("sell")) continue;
    if (!(tablist instanceof HTMLElement) || !isVisible(tablist)) continue;
    const panel = closestWithin(tablist, PANEL_MAX_DEPTH, (el) => el.querySelector("input") !== null);
    if (!panel) continue;
    const buttons = findButtons(panel, PANEL_PRIMARY_RE, (btn) => isTabOrToggle(btn) || isQuickAmount(btn));
    if (buttons.length) return buttons[buttons.length - 1]!;
  }
  return null;
}

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
    const panel = panelAnchor(doc);
    if (panel) return panel;
    // Fallback: "Place trade"; else an exact "Buy" that sits in a trade form next to its amount input.
    const place = findButtons(doc, PLACE_TRADE_RE, notTradeForm);
    if (place.length) return place[place.length - 1]!;
    const buy = findButtons(doc, BUY_RE, (btn) => notTradeForm(btn) || isTabOrToggle(btn) || !hasNearbyInput(btn));
    return buy[buy.length - 1] ?? null;
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
