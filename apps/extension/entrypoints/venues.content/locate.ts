/**
 * "Where is it?" — the affordance of last resort.
 *
 * Placement (`lib/adapters/placement.ts`) puts the verdict where the eye already is, and the
 * Dock's entrance makes the fallback arrive rather than appear. Neither is a guarantee on a
 * page nobody has captured yet, so the popup keeps a button that points at whatever is actually
 * mounted: scroll it into view, outline it for a moment and stop. No permanent flashing, no
 * second surface to find — the answer to "I can't see it" is the thing itself, lit.
 *
 * Every content script that mounts a primary display answers this message — the venue strip, the
 * X chips and the wallet lens's markers (finding I-1). Only the venue script used to, so on
 * x.com the popup's message reached nobody, and the user reading a timeline full of chips was
 * told "Tripwire isn't showing anything on this tab".
 *
 * **A listener that found nothing stays silent** rather than replying `false`. A tab runs more
 * than one of these scripts, and a `false` from the first would win the race against a `true`
 * from the one that actually has a chip on screen. Silence from all of them closes the port,
 * `tabs.sendMessage` rejects, and the popup's existing catch says the same honest thing.
 */

/** Message the popup sends to the content scripts. */
export const LOCATE_MESSAGE = "tripwire:locate";

/** How long the outline holds. Long enough to catch the eye after the click, short enough that
 * it is over before it becomes decoration. */
export const LOCATE_MS = 1500;

/** The attribute theme.css hangs the outline on. Set inside the shadow root, never on the host:
 * WXT resets every host with `:host { all: initial !important }`, which outranks anything the
 * theme can say about `:host` (same reason `fit.ts` travels as a custom property). */
const LOCATE_ATTR = "data-tw-locate";

/** The component roots a primary display can be: a venue strip, a block screen, a dock chip, an
 * X post chip, or a wallet-lens marker. A card or a badge is not one: it is reached through the
 * thing that is lit, and lighting it would point at a surface that is already in front of the
 * reader. */
const DISPLAY_ROOTS = ".tw-strip, .tw-block, .tw-dock-chip, .tw-chip, .tw-wallet-marker";

export type MountLike = { ui: { shadowHost?: Element | null; shadow?: ShadowRoot | null } } | null;

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

/** Whether an element is at least partly in the viewport right now. */
function onScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  return rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
}

/**
 * Lights one of many mounted displays — X mounts a chip per post, the wallet lens up to forty
 * markers. The one already on screen wins, so the answer to "where is it?" is the one the
 * reader is looking at rather than a scroll to the top of a timeline; otherwise the first
 * mounted one is lit and scrolled to.
 *
 * Returns whether anything was found, which is all the caller ever claims.
 */
export function locateAnyMounted(mounts: Iterable<MountLike>): boolean {
  const candidates = [...mounts].filter((m) => displayRoot(m) !== null);
  const visible = candidates.find((m) => onScreen(displayRoot(m)!));
  return locateMounted(visible ?? candidates[0] ?? null);
}
