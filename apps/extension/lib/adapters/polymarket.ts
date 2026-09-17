import type { Target } from "@tripwire/core";
import { findButton, isSelected } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const EVENT_PATH_RE = /^\/event\/([^/]+)(?:\/([^/]+))?/;
const ANCHOR_RE = /^(buy|trade)/i;

/** The selected Yes/No toggle, by aria-pressed/aria-checked/data-state, else the buy button's
 * own text ("Buy Yes" / "Buy No"). */
function detectOutcome(doc: Document): "yes" | "no" | undefined {
  let yesBtn: HTMLButtonElement | null = null;
  let noBtn: HTMLButtonElement | null = null;
  for (const btn of doc.querySelectorAll("button")) {
    const text = (btn.textContent ?? "").trim();
    if (!yesBtn && /^yes$/i.test(text)) yesBtn = btn;
    if (!noBtn && /^no$/i.test(text)) noBtn = btn;
  }
  if (yesBtn && isSelected(yesBtn)) return "yes";
  if (noBtn && isSelected(noBtn)) return "no";

  const buy = findButton(doc, ANCHOR_RE);
  if (buy) {
    const text = (buy.textContent ?? "").trim();
    if (/\byes\b/i.test(text)) return "yes";
    if (/\bno\b/i.test(text)) return "no";
  }
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
