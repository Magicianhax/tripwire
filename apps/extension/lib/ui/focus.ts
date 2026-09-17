/**
 * Walks into shadow roots to find the true focused element.
 *
 * `document.activeElement` only reports the shadow HOST when focus is inside an open shadow
 * root — third-party widgets (RainbowKit/Web3Modal/WalletConnect-style connect modals) commonly
 * render their inputs inside one. Recursing through `el.shadowRoot.activeElement` finds the
 * actual focused element wherever it's nested.
 */
export function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const active = root.activeElement;
  if (active?.shadowRoot?.activeElement) {
    return deepActiveElement(active.shadowRoot);
  }
  return active;
}

/**
 * True for form controls, contenteditable elements (attribute-based check — not just the
 * computed `isContentEditable`, which some test/embedding environments don't fully resolve),
 * and `role="textbox"` elements. Used to decide whether BlockScreen should avoid stealing
 * focus from something the user is actively typing into.
 */
export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable === true) return true;
  const contentEditable = el.getAttribute("contenteditable");
  if (contentEditable !== null && contentEditable.toLowerCase() !== "false") return true;
  if (el.getAttribute("role") === "textbox") return true;
  return false;
}

/** Focusable elements inside `root`, in DOM/tab order, skipping disabled ones. */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("input, button")).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}
