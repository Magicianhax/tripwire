import type { Target, Verdict } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createAnchorBinding } from "../../lib/adapters/anchor-binding";
import type { VenueAdapter } from "../../lib/adapters/types";
import { guard, type ApiResult } from "../../lib/api";
import type { GuardResponse } from "../../lib/api-types";
import { createBlockBinding, createStripBinding, closeEvidenceDock, showPrimaryDock } from "./displays";
import { errorHeadline, verdictHeadline } from "./format";
import { isUnlocked, type RunnerContext } from "./runner-state";

export { keyFor } from "./format";

/**
 * Owns every mounted UI element and blocking listener for the current venue page: at most one
 * "primary" display (BlockScreen overlay, inline Strip, or a primary Dock) plus an optional
 * on-demand evidence Dock opened from the Strip's "Details" or BlockScreen's "Evidence"
 * button (both display factories live in `./displays.tsx`, over a shared `RunnerContext` --
 * see `./runner-state.ts`). `render(adapter, target, key)` is the full-refresh entry point (a
 * target change); `resyncAnchor()` is the cheap per-tick entry point for an UNCHANGED target,
 * so a venue's SPA replacing the trade-button node (same Target, new DOM element) doesn't
 * leave the blocker bound to a detached node or the overlay rendering at a stale/zero rect.
 * The caller (index.tsx's change-detection loop) owns WHEN each is called.
 */
export function createGuardRunner(ctx: ContentScriptContext) {
  const rc: RunnerContext = {
    ctx,
    mainMount: null,
    evidenceMount: null,
    blocker: null,
    resizeObserver: null,
    repositionCleanup: null,
    anchorBinding: null,
    activeSession: null,
    currentKey: null,
    unlocks: new Map(),
    unlockTimers: new Map(),
    renderResolved: (adapter, target, key, verdict, headline, chipData) => render_(adapter, target, key, verdict, headline, chipData),
  };

  async function teardownMain(): Promise<void> {
    // Unbinds via the mode-specific onUnbind (releases the blocker/listeners for a block
    // screen, removes the mount for a strip) before the generic cleanup below.
    rc.anchorBinding?.unbind();
    rc.anchorBinding = null;
    // Defensive/idempotent: a block session's onUnbind already clears these; dock/strip modes
    // never set them. Never leaves a stale blocker or observer behind either way.
    rc.blocker?.release();
    rc.blocker = null;
    rc.repositionCleanup?.();
    rc.repositionCleanup = null;
    rc.resizeObserver?.disconnect();
    rc.resizeObserver = null;
    if (rc.mainMount) {
      rc.mainMount.ui.remove();
      rc.mainMount = null;
    }
    closeEvidenceDock(rc);
    rc.activeSession = null;
  }

  /** Routes an already-resolved verdict/headline (no network call) to the right display. Used
   * by `render()` below, by a successful override's immediate re-render (via
   * `rc.renderResolved`), and by `resyncAnchor()` when an anchor is lost entirely (re-queries
   * `adapter.anchor(document)` itself, which will come back null again and naturally fall
   * through to the Dock branch). */
  async function render_(
    adapter: VenueAdapter,
    target: Target | null,
    key: string,
    verdict: Verdict,
    headline: string,
    chipData: GuardResponse | null,
  ): Promise<void> {
    await teardownMain();
    if (rc.currentKey !== key) return; // superseded while tearing down

    const anchorEl = adapter.tier === 1 ? (adapter.anchor?.(document) ?? null) : null;
    const unlocked = target ? isUnlocked(rc, key) : false;

    if (adapter.tier === 1 && anchorEl) {
      rc.activeSession = { adapter, target, key, verdict, headline, chipData };
      const find = () => adapter.anchor?.(document) ?? null;
      const { onBind, onUnbind } =
        verdict === "TRIPWIRE" && target && chipData && !unlocked
          ? createBlockBinding(rc, adapter, target, chipData, headline, key)
          : createStripBinding(rc, adapter, target, verdict, headline, unlocked);
      rc.anchorBinding = createAnchorBinding({ find, onBind, onUnbind });
      rc.anchorBinding.sync();
    } else {
      rc.activeSession = null;
      await showPrimaryDock(rc, adapter, target, verdict, headline);
    }
  }

  /**
   * The runner's full-refresh entry point, for a NEW target (a changed `keyFor(adapter.id,
   * target)`). `key` must be that value -- the caller owns change detection and must not call
   * this for an unchanged target (use `resyncAnchor()` instead).
   */
  async function render(adapter: VenueAdapter, target: Target | null, key: string): Promise<void> {
    rc.currentKey = key;

    let verdict: Verdict = "UNCHECKED";
    let headline = "Tripwire couldn't check this: no target on this page";
    let chipData: GuardResponse | null = null;

    if (target) {
      const result: ApiResult<GuardResponse> = await guard(target, adapter.id, "chip");
      if (rc.currentKey !== key) return; // the page moved on while this was in flight
      if (result.ok) {
        chipData = result.data;
        verdict = result.data.verdict;
        headline = result.data.hits[0]?.text ?? verdictHeadline(verdict);
      } else {
        headline = errorHeadline(result.status, result.error);
      }
    }

    await render_(adapter, target, key, verdict, headline, chipData);
  }

  /**
   * The runner's cheap per-tick entry point for an UNCHANGED target: re-queries
   * `adapter.anchor(document)` and, if it differs from the currently-bound node (or that node
   * is no longer connected), rebinds -- releases the old blocker/listeners, installs on the
   * new node, re-points the overlay (or re-mounts the Strip at its new DOM position). No-ops
   * when nothing is currently shown as a block screen or strip (`rc.anchorBinding`/
   * `rc.activeSession` are only set by that branch of `render_()`). If no anchor is found at
   * all, falls back to the Dock (verdict stays visible; nothing left to block).
   */
  async function resyncAnchor(): Promise<void> {
    if (!rc.anchorBinding || !rc.activeSession) return;
    rc.anchorBinding.sync();
    if (rc.anchorBinding.anchor) return; // unchanged, or successfully rebound to a new node

    const { adapter, target, key, verdict, headline, chipData } = rc.activeSession;
    rc.anchorBinding = null;
    await render_(adapter, target, key, verdict, headline, chipData);
  }

  /** Tears down whatever is currently mounted without touching the unlock map/timers --
   * used when navigating (within the SPA) to a page no adapter matches, so nothing is left
   * mounted over content that no longer has a trade button, while a later navigation back
   * within the 60s unlock window still remembers the override. */
  async function clear(): Promise<void> {
    rc.currentKey = null;
    await teardownMain();
  }

  function dispose(): void {
    void teardownMain();
    for (const timer of rc.unlockTimers.values()) clearTimeout(timer);
    rc.unlockTimers.clear();
  }

  return { render, resyncAnchor, clear, dispose };
}
