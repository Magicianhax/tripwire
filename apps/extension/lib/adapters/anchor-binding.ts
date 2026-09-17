/**
 * Keeps a "bound" element in sync with whatever `find()` currently returns, so callers never
 * hold a stale reference to a DOM node a venue's SPA has replaced or removed. `sync()` is
 * cheap and idempotent -- call it on every debounced MutationObserver tick / URL poll tick,
 * not just when some higher-level "target" changes, since a venue can swap the trade-button
 * NODE (new element, same button) without the guarded Target changing at all.
 *
 * - Same connected node on every `sync()` call -> no-op (no `onBind`/`onUnbind`).
 * - A different, connected node -> `onUnbind()` (release whatever was bound to the old node),
 *   then `onBind(newNode)`.
 * - `find()` returns null, or the previously-bound node is no longer connected -> `onUnbind()`
 *   only (nothing to bind).
 */
export type AnchorBindingOptions = {
  find: () => HTMLElement | null;
  onBind: (anchor: HTMLElement) => void;
  onUnbind: () => void;
};

export function createAnchorBinding({ find, onBind, onUnbind }: AnchorBindingOptions) {
  let current: HTMLElement | null = null;

  function sync(): void {
    const found = find();

    if (current && (found == null || found !== current || !current.isConnected)) {
      onUnbind();
      current = null;
    }

    if (found && found !== current && found.isConnected) {
      current = found;
      onBind(found);
    }
  }

  /** Force-unbinds regardless of what `find()` would currently return -- used on teardown. */
  function unbind(): void {
    if (current) {
      onUnbind();
      current = null;
    }
  }

  return {
    sync,
    unbind,
    get anchor(): HTMLElement | null {
      return current;
    },
  };
}
