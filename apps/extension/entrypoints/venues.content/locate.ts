/**
 * "Where is it?" — the affordance of last resort.
 *
 * Placement (`lib/adapters/placement.ts`) puts the verdict where the eye already is, and the
 * Dock's entrance makes the fallback arrive rather than appear. Neither is a guarantee on a
 * page nobody has captured yet, so the popup keeps a button that points at whatever is actually
 * mounted: scroll it into view, outline it for a moment and stop. No permanent flashing, no
 * second surface to find — the answer to "I can't see it" is the thing itself, lit.
 */

/** Message the popup sends to the venue content script. */
export const LOCATE_MESSAGE = "tripwire:locate";

/** How long the outline holds. Long enough to catch the eye after the click, short enough that
 * it is over before it becomes decoration. */
export const LOCATE_MS = 1500;

/** The attribute theme.css hangs the outline on. Set inside the shadow root, never on the host:
 * WXT resets every host with `:host { all: initial !important }`, which outranks anything the
 * theme can say about `:host` (same reason `fit.ts` travels as a custom property). */
const LOCATE_ATTR = "data-tw-locate";

/** The component roots a primary display can be: a strip, a block screen, or a dock chip. */
const DISPLAY_ROOTS = ".tw-strip, .tw-block, .tw-dock-chip, .tw-chip";

type MountLike = { ui: { shadowHost?: Element | null; shadow?: ShadowRoot | null } } | null;

function displayRoot(mount: MountLike): HTMLElement | null {
  const host = mount?.ui?.shadowHost ?? null;
  const shadow = mount?.ui?.shadow ?? (host instanceof Element ? host.shadowRoot : null);
  return shadow?.querySelector<HTMLElement>(DISPLAY_ROOTS) ?? null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Outlines the mounted display for `LOCATE_MS`, scrolling it into view first when it is not
 * already there. Returns whether anything was found: the popup reports that answer instead of
 * claiming it highlighted something.
 *
 * Repeat clicks restart the outline rather than stacking timers, and the attribute is removed
 * on the way in so the animation replays on an element that is already lit.
 */
export function locateMounted(mount: MountLike): boolean {
  const root = displayRoot(mount);
  if (!root) return false;

  const existing = timers.get(root);
  if (existing) clearTimeout(existing);
  root.removeAttribute(LOCATE_ATTR);
  // Read back a layout value so removing and re-adding the attribute in one frame still
  // restarts the animation rather than being collapsed into no change at all.
  void root.offsetWidth;

  const host = mount?.ui?.shadowHost;
  const scrollTarget = host instanceof HTMLElement && host.isConnected ? host : root;
  if (typeof scrollTarget.scrollIntoView === "function") {
    scrollTarget.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  root.setAttribute(LOCATE_ATTR, "");
  timers.set(
    root,
    setTimeout(() => {
      root.removeAttribute(LOCATE_ATTR);
      timers.delete(root);
    }, LOCATE_MS),
  );
  return true;
}
