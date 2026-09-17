/**
 * Shared DOM helpers for tier-1 anchor detection. Reads only `textContent`/attributes, never
 * `innerHTML`.
 */

/** True when `el` is actually rendered (not `display:none`, not detached). happy-dom and real
 * browsers both populate `offsetParent`/`getClientRects` correctly for this check; it does
 * NOT catch `visibility:hidden` (out of scope — venue pages don't hide trade buttons that
 * way). */
export function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

/** Finds a `<button>` under `root` whose trimmed textContent matches `regex`, is visible, and
 * is not disabled. When multiple buttons match, returns the LAST one in DOM order — order
 * forms consistently put the actual submit button last (after any preset/quick-amount
 * buttons that might share matching text). */
export function findButton(root: ParentNode, regex: RegExp): HTMLButtonElement | null {
  const buttons = root.querySelectorAll("button");
  let found: HTMLButtonElement | null = null;
  for (const btn of buttons) {
    if (btn.disabled) continue;
    const text = (btn.textContent ?? "").trim();
    if (!regex.test(text)) continue;
    if (!isVisible(btn)) continue;
    found = btn;
  }
  return found;
}

/** True when an element is the "selected" member of a toggle group, by the common ARIA/state
 * conventions venue UIs use for Buy/Sell, Long/Short, Yes/No toggles. */
export function isSelected(el: Element): boolean {
  return (
    el.getAttribute("aria-pressed") === "true" ||
    el.getAttribute("aria-selected") === "true" ||
    el.getAttribute("aria-checked") === "true" ||
    el.getAttribute("data-state") === "active"
  );
}

/** Every visible, enabled `<button>` under `root` whose trimmed text matches `regex`, in DOM
 * order, minus any `exclude` rejects. */
export function findButtons(root: ParentNode, regex: RegExp, exclude?: (btn: HTMLButtonElement) => boolean): HTMLButtonElement[] {
  const out: HTMLButtonElement[] = [];
  for (const btn of root.querySelectorAll("button")) {
    if (btn.disabled) continue;
    if (!regex.test((btn.textContent ?? "").trim())) continue;
    if (!isVisible(btn)) continue;
    if (exclude?.(btn)) continue;
    out.push(btn);
  }
  return out;
}

const TOGGLE_ROLES = new Set(["tab", "radio", "switch", "checkbox", "option", "menuitemradio"]);

/** A segmented-control / tab member (Buy|Sell, Long|Short), not a form's primary action:
 * carries toggle ARIA state or role, or sits in a tablist/radiogroup. */
export function isToggleLike(el: Element): boolean {
  if (el.hasAttribute("aria-pressed") || el.hasAttribute("aria-selected") || el.hasAttribute("aria-checked")) return true;
  if (TOGGLE_ROLES.has(el.getAttribute("role") ?? "")) return true;
  return el.closest('[role="tablist"], [role="radiogroup"]') !== null;
}

/** Site chrome, not a trade form: inside a nav, a link, or a tab. */
export function isNavigation(el: Element): boolean {
  return el.closest('nav, [role="navigation"], a, [role="tab"], [role="tablist"], header') !== null;
}

/** Inside a list item / card (a token list's quick-buy), not the page's trade form. */
export function isInCard(el: Element): boolean {
  return el.closest('a, li, article, [role="listitem"], [role="row"]') !== null;
}

/** The nearest ancestor of `el` (at most `maxDepth` levels up, never `<body>` or above) for which
 * `test` holds, or null. */
export function closestWithin(el: Element, maxDepth: number, test: (ancestor: Element) => boolean): Element | null {
  let node: Element | null = el.parentElement;
  const body = el.ownerDocument.body;
  for (let depth = 0; node && node !== body && depth < maxDepth; depth++, node = node.parentElement) {
    if (test(node)) return node;
  }
  return null;
}

/** Elements under `root` with no element children whose trimmed text matches `regex` (for
 * controls built from plain divs, e.g. Hyperliquid's side toggle). */
export function leavesWithText(root: ParentNode, regex: RegExp): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll("div, span, label")) {
    if (el.childElementCount === 0 && regex.test((el.textContent ?? "").trim())) out.push(el);
  }
  return out;
}

/** True when a nearby ancestor (the form, or up to `depth` levels) holds an amount input. */
export function hasNearbyInput(el: Element, depth = 3): boolean {
  const form = el.closest("form");
  if (form) return form.querySelector("input") !== null;
  let node: Element | null = el.parentElement;
  for (let i = 0; node && i < depth; i++, node = node.parentElement) {
    if (node.querySelector("input")) return true;
  }
  return false;
}
