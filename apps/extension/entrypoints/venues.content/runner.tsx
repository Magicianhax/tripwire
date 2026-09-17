import type { ReactNode } from "react";
import type { Target, Verdict } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { computeBlockRect } from "../../lib/adapters/overlay";
import { installBlocker } from "../../lib/adapters/blocker";
import type { VenueAdapter } from "../../lib/adapters/types";
import { guard, override, type ApiResult } from "../../lib/api";
import type { GuardResponse } from "../../lib/api-types";
import { Dock } from "../../lib/ui/Dock";
import { mountReact } from "../../lib/ui/mount";
import { Panel } from "../../lib/ui/Panel";
import { Strip } from "../../lib/ui/Strip";
import { BlockOverlay } from "./BlockOverlay";
import { errorHeadline, targetTitle, verdictHeadline } from "./format";

export { keyFor } from "./format";

const UNLOCK_MS = 60_000;
const MODAL_Z_INDEX = 2_147_483_000;

type Mount = Awaited<ReturnType<typeof mountReact>>;

/**
 * Owns every mounted UI element and blocking listener for the current venue page: at most one
 * "primary" display (BlockScreen overlay, inline Strip, or a primary Dock) plus an optional
 * on-demand evidence Dock opened from the Strip's "Details" or BlockScreen's "Evidence"
 * button. `render(adapter, target, key)` is the sole entry point; the caller (index.tsx's
 * change-detection loop) is responsible for deciding WHEN to call it.
 */
export function createGuardRunner(ctx: ContentScriptContext) {
  let mainMount: Mount | null = null;
  let evidenceMount: Mount | null = null;
  let blocker: { release(): void } | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let repositionCleanup: (() => void) | null = null;

  let currentKey: string | null = null;

  // In-memory unlocks from a successful override, keyed by `keyFor(adapter.id, target)`.
  const unlocks = new Map<string, number>();
  const unlockTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function isUnlocked(key: string): boolean {
    const expiry = unlocks.get(key);
    return expiry !== undefined && expiry > Date.now();
  }

  async function teardownMain(): Promise<void> {
    blocker?.release();
    blocker = null;
    repositionCleanup?.();
    repositionCleanup = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (mainMount) {
      mainMount.ui.remove();
      mainMount = null;
    }
    closeEvidence();
  }

  function closeEvidence(): void {
    if (evidenceMount) {
      evidenceMount.ui.remove();
      evidenceMount = null;
    }
  }

  /** Toggles the on-demand evidence Dock (Strip's "Details" / BlockScreen's "Evidence").
   * Fetches "panel" mode data lazily on open; never blocks the trade on a failed fetch. */
  async function toggleEvidence(adapter: VenueAdapter, target: Target): Promise<void> {
    if (evidenceMount) {
      closeEvidence();
      return;
    }
    const openedForKey = currentKey;
    const result = await guard(target, adapter.id, "panel");
    if (currentKey !== openedForKey) return; // the page moved on while this was in flight
    const node = result.ok ? (
      <Dock collapsed={false} onToggleCollapsed={() => void toggleEvidence(adapter, target)} collapsedLabel="">
        <Panel data={result.data} title={targetTitle(target)} onClose={() => void toggleEvidence(adapter, target)} />
      </Dock>
    ) : (
      <Dock collapsed={false} onToggleCollapsed={() => void toggleEvidence(adapter, target)} collapsedLabel="">
        <p className="tw-dock-error">{errorHeadline(result.status, result.error)}</p>
      </Dock>
    );
    evidenceMount = await mountReact(ctx, { position: "inline" }, node);
  }

  function stripVerdict(verdict: Verdict): "CAUTION" | "UNCHECKED" | "CLEAR" {
    return verdict === "TRIPWIRE" ? "CAUTION" : verdict;
  }

  async function showStrip(
    adapter: VenueAdapter,
    target: Target | null,
    anchorEl: HTMLElement,
    verdict: Verdict,
    headline: string,
    unlocked: boolean,
  ): Promise<void> {
    const text = unlocked ? `${headline} · unlocked for this session` : headline;
    const node = (
      <Strip verdict={stripVerdict(verdict)} text={text} onDetails={target ? () => void toggleEvidence(adapter, target) : undefined} />
    );
    mainMount = await mountReact(ctx, { position: "inline", anchor: anchorEl, append: "before" }, node);
  }

  /** Primary Dock for tier 2 (or tier 1 with no anchor found): starts as a collapsed chip,
   * fetches "panel" mode data lazily on first expand. */
  async function showPrimaryDock(adapter: VenueAdapter, target: Target | null, verdict: Verdict, headline: string): Promise<void> {
    let collapsed = true;
    let panelData: GuardResponse | null = null;
    let panelError: string | null = null;
    const openedForKey = currentKey;

    function node(): ReactNode {
      return (
        <Dock collapsed={collapsed} onToggleCollapsed={() => void toggle()} collapsedLabel={`${verdict} · ${headline}`}>
          {panelData ? (
            <Panel
              data={panelData}
              title={targetTitle(target)}
              onClose={() => {
                collapsed = true;
                mainMount?.update(node());
              }}
            />
          ) : panelError ? (
            <p className="tw-dock-error">{panelError}</p>
          ) : (
            <p className="tw-dock-loading">Loading…</p>
          )}
        </Dock>
      );
    }

    async function toggle(): Promise<void> {
      collapsed = !collapsed;
      mainMount?.update(node());
      if (collapsed || panelData || panelError || !target) return;
      const result = await guard(target, adapter.id, "panel");
      if (currentKey !== openedForKey) return;
      if (result.ok) panelData = result.data;
      else panelError = errorHeadline(result.status, result.error);
      mainMount?.update(node());
    }

    mainMount = await mountReact(ctx, { position: "inline" }, node());
  }

  async function showBlockScreen(
    adapter: VenueAdapter,
    target: Target,
    data: GuardResponse,
    headline: string,
    anchorEl: HTMLElement,
    key: string,
  ): Promise<void> {
    const phrase = adapter.overridePhrase;

    async function render(): Promise<void> {
      const node = (
        <BlockOverlay
          rect={computeBlockRect(anchorEl.getBoundingClientRect())}
          hits={data.hits}
          phrase={phrase}
          onEvidence={() => void toggleEvidence(adapter, target)}
          onOverride={() => void doOverride()}
        />
      );
      if (mainMount) mainMount.update(node);
      else mainMount = await mountReact(ctx, { position: "modal", zIndex: MODAL_Z_INDEX }, node);
    }

    async function doOverride(): Promise<void> {
      const result = await override(target, data.verdict, data.hits.map((hit) => hit.ruleId), adapter.id);
      if (!result.ok) return; // a failed override call must never unlock
      unlocks.set(key, Date.now() + UNLOCK_MS);
      const existingTimer = unlockTimers.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      unlockTimers.set(
        key,
        setTimeout(() => {
          if (currentKey === key) void render_(adapter, target, key, data.verdict, headline, data);
        }, UNLOCK_MS),
      );
      // Re-render immediately as unlocked -- swaps the overlay for a Strip without a refetch.
      await render_(adapter, target, key, data.verdict, headline, data);
    }

    await render();

    function reposition(): void {
      void render();
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    resizeObserver = new ResizeObserver(reposition);
    resizeObserver.observe(anchorEl);
    repositionCleanup = () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };

    blocker = installBlocker(anchorEl);
  }

  /** Routes an already-resolved verdict/headline (no network call) to the right display. Used
   * both by `render()` below and by a successful override's immediate re-render. */
  async function render_(
    adapter: VenueAdapter,
    target: Target | null,
    key: string,
    verdict: Verdict,
    headline: string,
    chipData: GuardResponse | null,
  ): Promise<void> {
    await teardownMain();
    if (currentKey !== key) return; // superseded while tearing down

    const anchorEl = adapter.tier === 1 ? (adapter.anchor?.(document) ?? null) : null;
    const unlocked = target ? isUnlocked(key) : false;

    if (adapter.tier === 1 && anchorEl) {
      if (verdict === "TRIPWIRE" && target && chipData && !unlocked) {
        await showBlockScreen(adapter, target, chipData, headline, anchorEl, key);
      } else {
        await showStrip(adapter, target, anchorEl, verdict, headline, unlocked);
      }
    } else {
      await showPrimaryDock(adapter, target, verdict, headline);
    }
  }

  /**
   * The runner's sole entry point. `key` must be `keyFor(adapter.id, target)` -- the caller
   * owns change detection (comparing against the previous key) and must not call this for an
   * unchanged target.
   */
  async function render(adapter: VenueAdapter, target: Target | null, key: string): Promise<void> {
    currentKey = key;

    let verdict: Verdict = "UNCHECKED";
    let headline = "Tripwire couldn't check this: no target on this page";
    let chipData: GuardResponse | null = null;

    if (target) {
      const result: ApiResult<GuardResponse> = await guard(target, adapter.id, "chip");
      if (currentKey !== key) return; // the page moved on while this was in flight
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

  // Note: repositioning the block overlay while the target is UNCHANGED needs no help from
  // the caller's change-detection loop -- `showBlockScreen` already wires its own
  // ResizeObserver (on the anchor) plus capture-phase scroll/resize listeners that keep it in
  // sync continuously, independent of the 400ms DOM-mutation debounce / 1s URL poll.

  /** Tears down whatever is currently mounted without touching the unlock map/timers --
   * used when navigating (within the SPA) to a page no adapter matches, so nothing is left
   * mounted over content that no longer has a trade button, while a later navigation back
   * within the 60s unlock window still remembers the override. */
  async function clear(): Promise<void> {
    currentKey = null;
    await teardownMain();
  }

  function dispose(): void {
    void teardownMain();
    for (const timer of unlockTimers.values()) clearTimeout(timer);
    unlockTimers.clear();
  }

  return { render, clear, dispose };
}
