import type { Target } from "@tripwire/core";
import { closestWithin, findButtons, isSelected, isToggleLike } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const EVENT_PATH_RE = /^\/event\/([^/]+)(?:\/([^/]+))?/;
const ANCHOR_RE = /^(buy|trade)/i;

// "Yes"/"No" as a whole leading word; live labels run the price straight on ("Yes21¢", "No80¢").
const YES_RE = /^yes(?![a-z])/i;
const NO_RE = /^no(?![a-z])/i;
// Live (2026-09-17): the Trade button sits 8 levels below the ancestor it shares with the Yes/No group.
const MAX_SCOPE_DEPTH = 10;
// From the live Yes/No radiogroup up to the trade form that holds the action button (3 levels live);
// kept short so the event page's per-market "Buy Yes"/"Buy No" rows stay out of reach.
const MAX_FORM_DEPTH = 5;

const isOutcomeText = (el: Element) => {
  const text = (el.textContent ?? "").trim();
  return YES_RE.test(text) || NO_RE.test(text);
};

/** The live trade form's Yes/No outcome radiogroup (`#outcome-buttons` on polymarket.com). */
function outcomeGroup(doc: Document): Element | null {
  for (const group of doc.querySelectorAll('[role="radiogroup"]')) {
    const radios = [...group.querySelectorAll('[role="radio"]')];
    if (radios.some((r) => YES_RE.test((r.textContent ?? "").trim())) && radios.some((r) => NO_RE.test((r.textContent ?? "").trim()))) return group;
  }
  return null;
}

/** The trade button. When the live Yes/No radiogroup is present, only a non-toggle Buy/Trade button
 * in the form around it counts (never the Buy|Sell radios or other markets' "Buy Yes" rows).
 * Otherwise the last visible non-toggle Buy/Trade button on the page. */
function findAnchor(doc: Document): HTMLButtonElement | null {
  const group = outcomeGroup(doc);
  if (group) {
    let found: HTMLButtonElement[] = [];
    closestWithin(group, MAX_FORM_DEPTH, (el) => {
      found = findButtons(el, ANCHOR_RE, isToggleLike);
      return found.length > 0;
    });
    return found[found.length - 1] ?? null;
  }
  const candidates = findButtons(doc, ANCHOR_RE, isToggleLike);
  return candidates[candidates.length - 1] ?? null;
}

/** The trade form around the anchor: its `<form>`, else the nearest ancestor (a few levels up
 * at most) that also holds a Yes/No control. Never the whole page. */
function tradeScope(anchor: HTMLElement): Element | null {
  const form = anchor.closest("form");
  if (form) return form;
  return closestWithin(anchor, MAX_SCOPE_DEPTH, (el) => [...el.querySelectorAll("button")].some((btn) => btn !== anchor && isOutcomeText(btn)));
}

/**
 * The outcome being bought, read ONLY from controls scoped to the trade form that owns the
 * trade button: a selected Yes/No toggle there, else the button's own text ("Buy Yes"). On an
 * event page other markets' Yes/No buttons are ignored. Not found -> undefined, which the
 * backend reports as UNCHECKED ("Pick Yes or No") -- never a guess.
 */
function detectOutcome(doc: Document): "yes" | "no" | undefined {
  const anchor = findAnchor(doc);
  if (!anchor) return undefined;
  const scope = tradeScope(anchor);
  if (scope) {
    for (const btn of scope.querySelectorAll("button")) {
      if (btn === anchor || !isSelected(btn)) continue;
      const text = (btn.textContent ?? "").trim();
      if (YES_RE.test(text)) return "yes";
      if (NO_RE.test(text)) return "no";
    }
  }
  const text = (anchor.textContent ?? "").trim();
  if (/\byes\b/i.test(text)) return "yes";
  if (/\bno\b/i.test(text)) return "no";
  return undefined;
}

export const polymarketAdapter: VenueAdapter = {
  id: "polymarket",
  tier: 1,
  match(url) {
    return url.hostname === "polymarket.com" && EVENT_PATH_RE.test(url.pathname);
  },
  readTarget(doc, url): Target | null {
    const match = EVENT_PATH_RE.exec(url.pathname);
    const eventSlug = match?.[1];
    if (!eventSlug) return null;
    // Market slug: `/event/<event>/<market>`, or `/event/<event>?marketSlug=<market>` (the form
    // polymarket.com's own links use, live check 2026-09-17).
    const marketSlug = match?.[2] ?? url.searchParams.get("marketSlug") ?? undefined;
    const slug = marketSlug ?? eventSlug;
    const outcome = detectOutcome(doc);
    return outcome ? { kind: "prediction", slug, outcome } : { kind: "prediction", slug };
  },
  anchor(doc) {
    return findAnchor(doc);
  },
  overridePhrase: OVERRIDE_PHRASES.prediction,
};
