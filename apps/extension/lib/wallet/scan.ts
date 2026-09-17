import { detectInHref, detectInText, walletKey, type WalletRef } from "@tripwire/core";

/**
 * Finding the wallets on a page, without rearranging it.
 *
 * Every marker gets its own empty `<span>` slot, which Tripwire creates and owns, so the host's
 * own elements are never wrapped or restyled:
 * - **In a link:** the slot goes right after the `<a>`, the way the author badge row mounts
 *   after the username.
 * - **In text:** the text node is *split* at the end of the match (`Node.splitText`) and the
 *   slot goes between the two halves. Splitting is not wrapping — no element is introduced
 *   around the host's words, the rendered text is byte-identical, and the halves re-merge on
 *   `normalize()` once the slot is removed. A framework that later rewrites that node's text
 *   is still writing to a node it owns.
 *
 * What is never scanned: form fields and `contenteditable` (the user is typing, not sharing),
 * `script`/`style`/`noscript`/`code`/`pre`, the text inside an `<a>` (the link rule already
 * covers it), and Tripwire's own shadow hosts and slots.
 */

export type WalletHit = {
  ref: WalletRef;
  /** The empty inline element Tripwire created for this marker. */
  slot: HTMLElement;
  key: string;
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);
/** WXT names every Tripwire shadow host this; the lens must never mark its own output. */
const OWN_HOST = "tripwire-ui";
export const SLOT_ATTR = "data-tripwire-wallet";

function inSkippedSubtree(node: Node): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.tagName.toLowerCase() === OWN_HOST || el.hasAttribute(SLOT_ATTR)) return true;
    if (el.isContentEditable) return true;
  }
  return false;
}

export type ScanState = {
  /** Text nodes already split for a marker, so a rescan never splits the same match twice. */
  markedText: WeakSet<Text>;
  /** Link hrefs already marked. */
  markedHrefs: WeakSet<Element>;
};

export const createScanState = (): ScanState => ({ markedText: new WeakSet(), markedHrefs: new WeakSet() });

export type ScanOptions = {
  state: ScanState;
  /** Wallets the page already handles as something else (a venue's own target token). */
  skip?: (ref: WalletRef) => boolean;
  /** Stop after this many new hits in one pass, so a huge page cannot stall a frame. */
  limit?: number;
};

let counter = 0;

function makeSlot(doc: Document): HTMLElement {
  const slot = doc.createElement("span");
  slot.setAttribute(SLOT_ATTR, "");
  // The slot carries the inline layout, not the shadow host inside it: WXT resets every host
  // with `:host { all: initial !important }`, which beats an inline style, and the container
  // WXT puts inside the host is a block — enough to break the host page's line. A slot that is
  // itself an inline flex box keeps the marker on the line the address ends on.
  slot.style.display = "inline-flex";
  slot.style.alignItems = "center";
  slot.style.verticalAlign = "text-bottom";
  slot.style.whiteSpace = "nowrap";
  return slot;
}

/** One pass over a subtree. Returns the slots a caller should mount markers into. */
export function scanForWallets(root: ParentNode, opts: ScanOptions): WalletHit[] {
  const { state, skip, limit = 200 } = opts;
  const hits: WalletHit[] = [];
  const node = root as unknown as Node;
  const doc = (node.ownerDocument ?? (root as unknown as Document)) as Document | null;
  if (!doc) return hits;

  const accept = (ref: WalletRef) => !skip?.(ref);
  const nextKey = (ref: WalletRef) => `${walletKey(ref)}#${++counter}`;

  // Links first: an address inside an anchor is marked as the link, never again as its text.
  for (const a of (root.querySelectorAll?.("a[href]") ?? []) as Iterable<Element>) {
    if (hits.length >= limit) return hits;
    if (state.markedHrefs.has(a) || inSkippedSubtree(a)) continue;
    const href = (a as HTMLAnchorElement).href;
    const ref = href ? detectInHref(href) : null;
    if (!ref || !accept(ref)) continue;
    state.markedHrefs.add(a);
    const slot = makeSlot(doc);
    a.after(slot);
    hits.push({ ref, slot, key: nextKey(ref) });
  }

  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      const text = candidate.nodeValue ?? "";
      if (text.length < 4 || !/[.0-9A-Za-z]/.test(text)) return NodeFilter.FILTER_REJECT;
      if (state.markedText.has(candidate as Text)) return NodeFilter.FILTER_REJECT;
      if (candidate.parentElement?.closest("a")) return NodeFilter.FILTER_REJECT;
      return inSkippedSubtree(candidate) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  const texts: Text[] = [];
  for (let found = walker.nextNode(); found; found = walker.nextNode()) texts.push(found as Text);

  for (const text of texts) {
    if (hits.length >= limit) break;
    const found = detectInText(text.nodeValue ?? "").filter(accept);
    if (found.length === 0) continue;
    state.markedText.add(text);
    // Right to left: splitting for a later match must not move the offsets of the earlier ones.
    for (let i = found.length - 1; i >= 0; i--) {
      if (hits.length >= limit) break;
      const hit = found[i]!;
      const ref: WalletRef = { kind: hit.kind, query: hit.query };
      const tail = text.splitText(hit.end);
      const slot = makeSlot(doc);
      state.markedText.add(tail);
      tail.parentNode?.insertBefore(slot, tail);
      hits.push({ ref, slot, key: nextKey(ref) });
    }
  }

  // Links are found before text, and a text node is split right to left, so the raw hit order is
  // neither. Document order is the contract the caller needs: it is what "oldest" means when the
  // marker budget recycles, and what a keyboard user walks through.
  hits.sort((a, b) => (a.slot.compareDocumentPosition(b.slot) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return hits;
}

/** Remove a slot and let the two halves of a split text node become one node again. */
export function removeSlot(slot: HTMLElement): void {
  const parent = slot.parentNode;
  slot.remove();
  parent?.normalize();
}
