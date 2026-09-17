import type { Target, Verdict } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createAnchorBinding } from "../../lib/adapters/anchor-binding";
import type { VenueAdapter } from "../../lib/adapters/types";
import { guard, type ApiResult } from "../../lib/api";
import type { GuardResponse } from "../../lib/api-types";
import { decideDisplay, nextAction } from "./display-state";
import { hitRuleClause } from "../../lib/ui/panel-parts";
import { createBlockBinding, createStripBinding, closeEvidenceDock, showChecking, showPrimaryDock } from "./displays";
import { errorHeadline, guardHeadline } from "./format";
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
export function createGuardRunner(ctx: ContentScriptContext, getReplay: () => Promise<boolean> = async () => false) {
  const rc: RunnerContext = {
    ctx,
    mainMount: null,
    evidenceMount: null,
    evidenceOpening: null,
    blocker: null,
    resizeObserver: null,
    repositionCleanup: null,
    anchorBinding: null,
    activeSession: null,
    currentDisplay: null,
    currentKey: null,
    replay: false,
    unlocks: new Map(),
    unlockTimers: new Map(),
    renderResolved: (adapter, target, key, verdict, headline, chipData) => render_(adapter, target, key, verdict, headline, chipData),
  };

  /** Synchronous on purpose: `render()` calls it before its first `await`, so a stale block
   * screen or blocker can never outlive a target change by even one tick. */
  function teardownMain(): void {
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
    rc.currentDisplay = null;
  }

  /** Routes an already-resolved verdict/headline (no network call) to the right display, via
   * `decideDisplay` (`./display-state.ts`) -- the single source of truth `resyncAnchor()`
   * below also uses, so the two can never disagree about what should be showing. Used by
   * `render()` below, by a successful override's immediate re-render (via
   * `rc.renderResolved`), and by `resyncAnchor()` on a "switch" action -- including the anchor
   * appearing for a tier-1 session that fell back to the Dock (re-queries
   * `adapter.anchor(document)` itself, which will find it and route to block/strip). */
  async function render_(
    adapter: VenueAdapter,
    target: Target | null,
    key: string,
    verdict: Verdict,
    headline: string,
    chipData: GuardResponse | null,
  ): Promise<void> {
    teardownMain();
    if (rc.currentKey !== key) return; // superseded

    const unlocked = target ? isUnlocked(rc, key) : false;
    const anchorPresent = adapter.tier === 1 && (adapter.anchor?.(document) ?? null) != null;
    const decision = decideDisplay({ tier: adapter.tier, verdict, anchorPresent, unlocked });

    if (adapter.tier !== 1) {
      // Tier 2 has no anchor concept at all -- decideDisplay always returns "dock" for it, and
      // there's nothing for resyncAnchor to ever re-route, so it's left untracked.
      rc.activeSession = null;
      rc.currentDisplay = null;
      await showPrimaryDock(rc, adapter, target, verdict, headline);
      return;
    }

    rc.activeSession = { adapter, target, key, verdict, headline, chipData };
    rc.currentDisplay = decision;

    if (decision === "dock") {
      rc.anchorBinding = null; // nothing found (yet) -- resyncAnchor re-probes on later ticks
      await showPrimaryDock(rc, adapter, target, verdict, headline);
      return;
    }

    const find = () => adapter.anchor?.(document) ?? null;
    const { onBind, onUnbind } =
      decision === "block" && target && chipData
        ? createBlockBinding(rc, adapter, target, chipData, headline, key)
        : createStripBinding(rc, adapter, target, verdict, headline, unlocked, chipData?.hits[0] ? hitRuleClause(chipData.hits[0]) : null);
    rc.anchorBinding = createAnchorBinding({ find, onBind, onUnbind });
    rc.anchorBinding.sync();
  }

  /**
   * The runner's full-refresh entry point, for a NEW target (a changed `keyFor(adapter.id,
   * target)`). `key` must be that value -- the caller owns change detection and must not call
   * this for an unchanged target (use `resyncAnchor()` instead).
   */
  async function render(adapter: VenueAdapter, target: Target | null, key: string): Promise<void> {
    rc.currentKey = key;
    // Tear the previous target's display and blocker down BEFORE any await: the old verdict
    // (a stale block, or a CLEAR for a token that's no longer selected) must never stay visible
    // while the new check is in flight.
    teardownMain();

    let verdict: Verdict = "UNCHECKED";
    let headline = "Tripwire couldn't check this: no target on this page";
    let chipData: GuardResponse | null = null;

    if (target) {
      const pending: Promise<ApiResult<GuardResponse>> = guard(target, adapter.id, "chip");
      const replay = getReplay();
      // Neutral "Checking…" (verdict LOADING, never a blocker) until the new result lands.
      await showChecking(rc, adapter, key);
      const result = await pending;
      rc.replay = await replay;
      if (rc.currentKey !== key) return; // the page moved on while this was in flight
      if (result.ok) {
        chipData = result.data;
        verdict = result.data.verdict;
        headline = guardHeadline(result.data);
      } else {
        headline = errorHeadline(result.status, result.error);
      }
    }

    await render_(adapter, target, key, verdict, headline, chipData);
  }

  /**
   * The runner's cheap per-tick entry point for an UNCHANGED target -- the single place that
   * handles BOTH the "already bound" state (a block screen or strip whose anchor node the SPA
   * might have replaced) and the "Dock fallback" state (a tier-1 session with no anchor found
   * yet, or not anymore). No-ops entirely for tier 2 or when nothing has rendered yet
   * (`rc.activeSession` is only set by `render_()`'s tier-1 branch).
   *
   * - Already bound (`rc.anchorBinding` set): `sync()`s it first, which handles a same-node or
   *   a same-mode node-swap in place (releases the old blocker/listeners, installs on the new
   *   node, re-points the overlay / re-mounts the Strip) without any further work here.
   * - Dock fallback (`rc.anchorBinding` null): re-probes `adapter.anchor(document)` directly.
   *
   * Either way, the resulting `anchorPresent` feeds `decideDisplay` (`./display-state.ts`) --
   * the same function `render_()` used -- and `nextAction` against what was last shown.
   * "none"/"rebind" -> already handled (or nothing to do). "switch" -> the display MODE itself
   * needs to change (anchor appeared: dock -> block/strip; anchor lost entirely: block/strip
   * -> dock; or the verdict/unlock state flipped which anchored mode applies) -- re-routed
   * through `render_()` with the session's already-known verdict/headline/chipData, no
   * `guard()` refetch.
   */
  async function resyncAnchor(): Promise<void> {
    if (!rc.activeSession) return;
    const { adapter, target, key, verdict, headline, chipData } = rc.activeSession;
    const unlocked = target ? isUnlocked(rc, key) : false;

    let anchorPresent: boolean;
    if (rc.anchorBinding) {
      rc.anchorBinding.sync();
      anchorPresent = rc.anchorBinding.anchor != null;
    } else {
      anchorPresent = (adapter.anchor?.(document) ?? null) != null;
    }

    const decision = decideDisplay({ tier: adapter.tier, verdict, anchorPresent, unlocked });
    const action = nextAction(rc.currentDisplay, decision);
    if (action === "none" || action === "rebind") return; // "rebind" already applied by sync() above

    rc.anchorBinding = null;
    await render_(adapter, target, key, verdict, headline, chipData);
  }

  /** Tears down whatever is currently mounted without touching the unlock map/timers --
   * used when navigating (within the SPA) to a page no adapter matches, so nothing is left
   * mounted over content that no longer has a trade button, while a later navigation back
   * within the 60s unlock window still remembers the override. */
  async function clear(): Promise<void> {
    rc.currentKey = null;
    teardownMain();
  }

  function dispose(): void {
    rc.currentKey = null;
    teardownMain();
    for (const timer of rc.unlockTimers.values()) clearTimeout(timer);
    rc.unlockTimers.clear();
  }

  return { render, resyncAnchor, clear, dispose };
}
