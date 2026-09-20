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

export type ElementSetBindingOptions = {
  find: () => HTMLElement[];
  onBind: (element: HTMLElement) => void;
  onUnbind: (element: HTMLElement) => void;
};

/**
 * The same contract as `createAnchorBinding`, for a SET of elements rather than one: pump.fun's
 * quick-buy chips, which are three separate one-click trades beside the primary button.
 *
 * Each element is bound individually — never a shared container, which would swallow clicks on
 * anything else inside it and break the blocker's own "friction on the button itself" rule —
 * and each gets the same `isConnected` re-sync the anchor gets, because pump.fun's SPA
 * re-renders the chips without changing the traded token.
 *
 * - An element already bound and still connected -> untouched.
 * - A newly returned, connected element -> `onBind`.
 * - An element no longer returned, or no longer connected -> `onUnbind`.
 */
export function createElementSetBinding({ find, onBind, onUnbind }: ElementSetBindingOptions) {
  let current = new Set<HTMLElement>();

  function sync(): boolean {
    const found = new Set(find().filter((el) => el.isConnected));
    let changed = false;

    for (const el of current) {
      if (found.has(el) && el.isConnected) continue;
      onUnbind(el);
      current.delete(el);
      changed = true;
    }
    for (const el of found) {
      if (current.has(el)) continue;
      current.add(el);
      onBind(el);
      changed = true;
    }
    return changed;
  }

  /** Force-unbinds everything regardless of what `find()` would now return (teardown). */
  function unbindAll(): void {
    for (const el of current) onUnbind(el);
    current = new Set();
  }

  return {
    sync,
    unbindAll,
    get elements(): HTMLElement[] {
      return [...current];
    },
  };
}
