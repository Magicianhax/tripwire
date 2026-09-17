import type { Removable } from "./mounts";

export type PanelToggleOptions<M extends Removable> = {
  /** Loads the panel data and mounts it. `isCurrent()` turns false once a later toggle has
   * superseded this open (check it before mounting). Returns the mount, or null on failure
   * (the caller has already shown the error, e.g. on the chip). */
  open: (isCurrent: () => boolean) => Promise<M | null>;
  /** Called whenever the expanded state changes (re-render the chip's aria-expanded). */
  onExpandedChange: (expanded: boolean) => void;
  onMounted?: (mount: M) => void;
  onRemoved?: (mount: M) => void;
};

/**
 * The X chip's panel open/close state machine. Every toggle bumps a sequence number, so an open
 * that resolves after a later close/reopen is discarded (and its late mount removed): rapid
 * clicks can never leave two panels, or an orphaned one, under a tweet.
 */
export function createPanelToggle<M extends Removable>(options: PanelToggleOptions<M>) {
  let expanded = false;
  let mount: M | null = null;
  let seq = 0;

  function unmount(): void {
    if (!mount) return;
    const m = mount;
    mount = null;
    m.ui.remove();
    options.onRemoved?.(m);
  }

  async function toggle(): Promise<void> {
    expanded = !expanded;
    const mine = ++seq;
    options.onExpandedChange(expanded);
    if (!expanded) {
      unmount();
      return;
    }
    if (mount) return;

    const result = await options.open(() => mine === seq);
    if (mine !== seq) {
      result?.ui.remove(); // superseded while loading/mounting
      return;
    }
    if (!result) {
      expanded = false;
      options.onExpandedChange(false);
      return;
    }
    unmount(); // defensive: never two
    mount = result;
    options.onMounted?.(result);
  }

  return {
    toggle,
    get expanded(): boolean {
      return expanded;
    },
  };
}
