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
