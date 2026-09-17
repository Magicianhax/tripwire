import type { Target } from "@tripwire/core";
import { findButton, isSelected } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const EVENT_PATH_RE = /^\/event\/([^/]+)(?:\/([^/]+))?/;
const ANCHOR_RE = /^(buy|trade)/i;

const YES_RE = /^yes\b/i;
const NO_RE = /^no\b/i;
const MAX_SCOPE_DEPTH = 4;

/** The trade form around the anchor: its `<form>`, else the nearest ancestor (a few levels up
 * at most) that also holds a Yes/No control. Never the whole page. */
function tradeScope(anchor: HTMLElement): Element | null {
  const form = anchor.closest("form");
  if (form) return form;
  let el: Element | null = anchor.parentElement;
  for (let depth = 0; el && el !== anchor.ownerDocument.body && depth < MAX_SCOPE_DEPTH; depth++, el = el.parentElement) {
    for (const btn of el.querySelectorAll("button")) {
      const text = (btn.textContent ?? "").trim();
      if (btn !== anchor && (YES_RE.test(text) || NO_RE.test(text))) return el;
    }
  }
  return null;
}

/**
 * The outcome being bought, read ONLY from controls scoped to the trade form that owns the
 * trade button: a selected Yes/No toggle there, else the button's own text ("Buy Yes"). On an
 * event page other markets' Yes/No buttons are ignored. Not found -> undefined, which the
 * backend reports as UNCHECKED ("Pick Yes or No") -- never a guess.
 */
function detectOutcome(doc: Document): "yes" | "no" | undefined {
  const anchor = findButton(doc, ANCHOR_RE);
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
    const marketSlug = match?.[2];
    const slug = marketSlug ?? eventSlug;
    const outcome = detectOutcome(doc);
    return outcome ? { kind: "prediction", slug, outcome } : { kind: "prediction", slug };
  },
  anchor(doc) {
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.prediction,
};
