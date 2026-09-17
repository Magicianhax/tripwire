/** Below this the strip stacks instead of sitting on one row. */
export const NARROW_WIDTH = 320;

/** The measured box a mounted surface must fit inside. */
export type Box = { width: number };

const px = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** An element's content box width: what a child of it is allowed to occupy. */
function contentWidth(el: Element): number {
  const style = getComputedStyle(el);
  return el.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
}

/**
 * How wide a surface inserted beside `anchor` may be.
 *
 * Not simply the anchor's own width. When the anchor sits in a shrink-to-fit container — an
 * inline-flex row, a `width: max-content` action group, a grid cell sized to its content — that
 * container has already grown to our own max-content width and stretched the anchor to match,
 * so reading the anchor back returns the width we caused. Taking the narrowest content box on
 * the way up to the document is immune to that: whatever intermediate container we inflated,
 * some ancestor above it still carries the venue's real bound.
 */
export function availableWidth(anchor: Element): number {
  let width = anchor.getBoundingClientRect().width;
  for (let el = anchor.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const w = contentWidth(el);
    if (w > 0) width = Math.min(width, w);
  }
  return width;
}

/** How far `liftOutOfRow` will walk before giving up and staying near the anchor. */
const MAX_LIFT = 3;

function laysChildrenInARow(style: CSSStyleDeclaration): boolean {
  if (style.display === "flex" || style.display === "inline-flex") return !style.flexDirection.startsWith("column");
  if (style.display === "grid" || style.display === "inline-grid") {
    if (style.gridAutoFlow.startsWith("column")) return true;
    return style.gridTemplateColumns.split(/\s+/).filter(Boolean).length > 1;
  }
  return false;
}

/**
 * The element a strip should be inserted before, given the trade button it describes.
 *
 * A strip sits *above* the trade button. Inserting it before the button works only when the
 * button's container stacks its children; when the venue lays that row out horizontally — a
 * "Review Bridge" button beside a wallet icon, which is what jumper.xyz does — the strip becomes
 * another item in that row and is squeezed into a column next to the button, pill clipped and
 * the sentence broken over four lines.
 *
 * So walk up out of any row-laying container and mount before the whole row instead. When the
 * button's parent already stacks (a column flex, a plain block), this returns the button itself
 * and nothing changes.
 */
export function liftOutOfRow(anchor: HTMLElement): HTMLElement {
  let el = anchor;
  for (let i = 0; i < MAX_LIFT; i++) {
    const parent = el.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    if (!laysChildrenInARow(getComputedStyle(parent))) break;
    el = parent;
  }
  return el;
}

/**
 * Bounds a mounted surface to `box`, by publishing the width on its shadow host.
 *
 * It travels as a custom property rather than as `max-width`, because WXT resets every shadow
 * host with `:host { all: initial !important }` — which outranks both an ordinary inline style
 * and anything theme.css can say about `:host`. Custom properties are the one thing `all` does
 * not touch, so the surfaces inside the shadow root read it back
 * (`.tw-strip { max-width: var(--tw-fit-width, 100%) }`). Capping them also caps the host's own
 * intrinsic width, which is what stops a shrink-to-fit venue container from growing to fit our
 * sentence and dragging the venue's own button wider with it.
 */
export function applyAnchorBox(host: HTMLElement, box: Box | null): void {
  const bounded = box !== null && box.width > 0;
  const width = bounded ? `${Math.round(box.width)}px` : "100%";
  host.style.setProperty("--tw-fit-width", width);
  // Read back through the host attribute (:host([data-narrow]) in theme.css), since the shadow
  // root cannot query its own host's box.
  if (bounded && box.width < NARROW_WIDTH) host.dataset.narrow = "";
  else delete host.dataset.narrow;
}

/**
 * Keeps `host` inside the box available beside `anchor`, now and whenever that anchor or its
 * container resizes. Returns the teardown; falls back to "no wider than the parent" where
 * ResizeObserver is unavailable.
 */
export function fitToAnchor(host: HTMLElement, anchor: Element): () => void {
  const measure = () => applyAnchorBox(host, { width: availableWidth(anchor) });
  measure();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(measure);
  // The anchor alone is not enough: in a shrink-to-fit container the anchor's own width can
  // stay pinned while the card around it collapses, so the ancestors are watched too.
  observer.observe(anchor);
  for (let el = anchor.parentElement; el && el !== document.documentElement; el = el.parentElement) observer.observe(el);
  return () => observer.disconnect();
}
