import type { Target } from "@tripwire/core";
import { closestWithin, findButtons, isSelected, isToggleLike } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const EVENT_PATH_RE = /^\/event\/([^/]+)(?:\/([^/]+))?/;
const ANCHOR_RE = /^(buy|trade)/i;

// "Yes"/"No" as a whole leading word; live labels run the price straight on ("Yes21¢", "No80¢").
const YES_RE = /^yes(?![a-z])/i;
const NO_RE = /^no(?![a-z])/i;
// The live outcome radiogroup's id (polymarket.com, capture 2026-09-17). It is the only control
// that names this market's outcomes, and on 44 of the top 100 markets those are not Yes and No.
const OUTCOME_GROUP_ID = "outcome-buttons";
// The price Polymarket runs onto the end of an outcome label ("Yes21¢", "BAL62¢").
const TRAILING_PRICE_RE = /[\s\u00a0]*\d+(?:\.\d+)?\s*(?:¢|%)$/;
// An outcome name is a name, not prose: the target field is capped at 80 characters.
const OUTCOME_LABEL_MAX = 80;
// Live (2026-09-17): the Trade button sits 8 levels below the ancestor it shares with the Yes/No group.
const MAX_SCOPE_DEPTH = 10;
// From the live Yes/No radiogroup up to the trade form that holds the action button (3 levels live);
// kept short so the event page's per-market "Buy Yes"/"Buy No" rows stay out of reach.
const MAX_FORM_DEPTH = 5;

const isOutcomeText = (el: Element) => {
  const text = (el.textContent ?? "").trim();
  return YES_RE.test(text) || NO_RE.test(text);
};

/** A control that switches between Buy and Sell, not between this market's outcomes. */
function isBuySellGroup(group: Element): boolean {
  const radios = [...group.querySelectorAll('[role="radio"]')].map((r) => (r.textContent ?? "").trim().toLowerCase());
  return radios.includes("buy") && radios.includes("sell");
}

/**
 * The trade form's outcome radiogroup.
 *
 * `#outcome-buttons` is what the live page calls it and is tried first, because it is the only
 * identifier that does not depend on what this market's outcomes happen to be named. The Yes/No
 * shape stays as the second rule so a page that renames the group still resolves; the third rule
 * is the live `.trading-button` outcome pair, which is how an ["BAL", "NO"] or
 * ["Ravens", "Saints"] market's group is found at all (Round 2.2).
 */
function outcomeGroup(doc: Document): Element | null {
  const byId = doc.querySelector(`[role="radiogroup"]#${OUTCOME_GROUP_ID}`);
  if (byId) return byId;
  const groups = [...doc.querySelectorAll('[role="radiogroup"]')];
  for (const group of groups) {
    const radios = [...group.querySelectorAll('[role="radio"]')];
    if (radios.some((r) => YES_RE.test((r.textContent ?? "").trim())) && radios.some((r) => NO_RE.test((r.textContent ?? "").trim()))) return group;
  }
  for (const group of groups) {
    if (isBuySellGroup(group)) continue;
    const radios = [...group.querySelectorAll('[role="radio"].trading-button')];
    if (radios.length >= 2) return group;
  }
  return null;
}

/**
 * One outcome control's name, as the page spells it - read, never interpreted.
 *
 * The live button renders the name and the price as two sibling spans ("Yes" + "21¢"), so the
 * first element child is the name; a flat button has the price run onto the end of the text and
 * it is stripped. Returns null rather than a guess when nothing is left, because the backend
 * matches this string against the market's own outcome set and a wrong match picks a wrong
 * trade.
 */
export function outcomeLabelOf(el: Element | null | undefined): string | null {
  if (!el) return null;
  const whole = (el.textContent ?? "").trim();
  const first = (el.firstElementChild?.textContent ?? "").trim();
  const candidate = first !== "" && first !== whole ? first : whole;
  const label = candidate.replace(TRAILING_PRICE_RE, "").trim();
  if (label === "" || label.length > OUTCOME_LABEL_MAX) return null;
  return label;
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
 * The outcome being bought, read ONLY from controls scoped to the trade form that owns the trade
 * button: the selected radio of that form's outcome group, else the button's own text ("Buy
 * Yes"). On an event page other markets' rows are ignored. Not found -> nothing, which the
 * backend reports as UNCHECKED - never a guess.
 *
 * The label is the page's own word for the outcome and is never interpreted here. `outcome` is
 * the legacy Yes/No flag and is set only when the word really is yes or no; the backend still
 * ignores it unless the resolved market's outcomes are Yes and No, which is what keeps "NO" on
 * an ["BAL", "NO"] market meaning New Orleans (Round 2.2).
 */
function detectOutcome(doc: Document): { label?: string; outcome?: "yes" | "no" } {
  const anchor = findAnchor(doc);
  if (!anchor) return {};
  const scope = tradeScope(anchor);
  const group = outcomeGroup(doc);
  // The form's own outcome group first: on an event page it is the only control that belongs to
  // the market the trade button will trade.
  const controls = group && (!scope || scope.contains(group) || group.contains(anchor)) ? [...group.querySelectorAll('[role="radio"]')] : [];
  const labels = controls.map(outcomeLabelOf);
  const yesNo = isYesNoPair(labels);
  for (const [i, radio] of controls.entries()) {
    if (radio === anchor || !isSelected(radio)) continue;
    const label = labels[i];
    if (label) return withFlag(label, yesNo);
  }
  if (scope) {
    for (const btn of scope.querySelectorAll("button")) {
      if (btn === anchor || !isSelected(btn)) continue;
      const label = outcomeLabelOf(btn);
      if (label && (YES_RE.test(label) || NO_RE.test(label))) return withFlag(label, true);
    }
  }
  const text = (anchor.textContent ?? "").trim();
  if (/\byes\b/i.test(text)) return { label: "Yes", outcome: "yes" };
  if (/\bno\b/i.test(text)) return { label: "No", outcome: "no" };
  return {};
}

/** The whole control reads Yes and No, so a selected "No" there means the no side. */
function isYesNoPair(labels: (string | null)[]): boolean {
  const named = labels.filter((l): l is string => l !== null).map((l) => l.toLowerCase());
  return named.length === 2 && named.includes("yes") && named.includes("no");
}

/**
 * The legacy Yes/No flag, set only when **the whole control** reads Yes and No.
 *
 * A control reading "BAL" and "NO" is a football game, and its "NO" is New Orleans. The backend
 * already refuses to read the flag off a market whose outcomes are not Yes and No, but the
 * adapter knows the same thing from the page and should not put a misleading word on the wire
 * for anything else to read (Round 2.2).
 */
function withFlag(label: string, yesNoPair: boolean): { label: string; outcome?: "yes" | "no" } {
  if (!yesNoPair) return { label };
  const lower = label.toLowerCase();
  return lower === "yes" ? { label, outcome: "yes" } : lower === "no" ? { label, outcome: "no" } : { label };
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
    // The page's own market selector is the round trip: picking a row on an event page sets
    // `?marketSlug=`, so the guard follows what the page is about to trade. Nothing inside the
    // card ever changes which market this is.
    const { label, outcome } = detectOutcome(doc);
    const target: Target = { kind: "prediction", slug };
    if (label) target.outcomeLabel = label;
    if (outcome) target.outcome = outcome;
    return target;
  },
  anchor(doc) {
    return findAnchor(doc);
  },
  overridePhrase: OVERRIDE_PHRASES.prediction,
};
