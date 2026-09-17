import type { ReactNode } from "react";
import type { Target, Verdict } from "@tripwire/core";
import { computeBlockRect } from "../../lib/adapters/overlay";
import { installBlocker } from "../../lib/adapters/blocker";
import type { VenueAdapter } from "../../lib/adapters/types";
import { guard, override } from "../../lib/api";
import type { GuardResponse } from "../../lib/api-types";
import { Dock } from "../../lib/ui/Dock";
import { mountReact } from "../../lib/ui/mount";
import { Panel } from "../../lib/ui/Panel";
import { Strip } from "../../lib/ui/Strip";
import { BlockOverlay } from "./BlockOverlay";
import { errorHeadline, overrideFailureText, targetTitle } from "./format";
import type { RunnerContext } from "./runner-state";

const UNLOCK_MS = 60_000;
const MODAL_Z_INDEX = 2_147_483_000;

function stripVerdict(verdict: Verdict): "CAUTION" | "UNCHECKED" | "CLEAR" {
  return verdict === "TRIPWIRE" ? "CAUTION" : verdict;
}

function closeEvidence(rc: RunnerContext): void {
  rc.evidenceOpening = null; // cancels an open still in flight
  if (rc.evidenceMount) {
    rc.evidenceMount.ui.remove();
    rc.evidenceMount = null;
  }
}

/** Toggles the on-demand evidence Dock (Strip's "Details" / BlockScreen's "Evidence").
 * Fetches "panel" mode data lazily on open; never blocks the trade on a failed fetch.
 * Idempotent while opening: a repeat click during the fetch is ignored, and a close/teardown
 * during it cancels the open (checked again after the async mount, so no orphaned Dock). */
export async function toggleEvidence(rc: RunnerContext, adapter: VenueAdapter, target: Target): Promise<void> {
  if (rc.evidenceMount) {
    closeEvidence(rc);
    return;
  }
  if (rc.evidenceOpening) return; // already opening
  const opening = {};
  rc.evidenceOpening = opening;
  const openedForKey = rc.currentKey;
  const stillWanted = () => rc.evidenceOpening === opening && rc.currentKey === openedForKey;
  const result = await guard(target, adapter.id, "panel");
  if (!stillWanted()) return; // closed, or the page moved on, while this was in flight
  const node = result.ok ? (
    <Dock collapsed={false} onToggleCollapsed={() => void toggleEvidence(rc, adapter, target)} collapsedLabel="" replay={rc.replay}>
      <Panel data={result.data} title={targetTitle(target)} onClose={() => void toggleEvidence(rc, adapter, target)} />
    </Dock>
  ) : (
    <Dock collapsed={false} onToggleCollapsed={() => void toggleEvidence(rc, adapter, target)} collapsedLabel="" replay={rc.replay}>
      <p className="tw-dock-error">{errorHeadline(result.status, result.error)}</p>
    </Dock>
  );
  const mount = await mountReact(rc.ctx, { position: "inline" }, node);
  if (!stillWanted()) {
    mount.ui.remove();
    return;
  }
  rc.evidenceOpening = null;
  rc.evidenceMount = mount;
}

export function closeEvidenceDock(rc: RunnerContext): void {
  closeEvidence(rc);
}

/** The neutral "Checking…" state shown between a target change and its new verdict: a LOADING
 * Strip above the anchor when one is present (tier 1), else a collapsed Dock chip. Never
 * installs a blocker. Dropped (not stored) if the page moved on, or something else already
 * mounted, while the shadow root was being created. */
export async function showChecking(rc: RunnerContext, adapter: VenueAdapter, key: string): Promise<void> {
  const anchor = adapter.tier === 1 ? (adapter.anchor?.(document) ?? null) : null;
  const mount = anchor
    ? await mountReact(rc.ctx, { position: "inline", anchor, append: "before" }, <Strip verdict="LOADING" text="Checking…" replay={rc.replay} />)
    : await mountReact(
        rc.ctx,
        { position: "inline" },
        <Dock collapsed onToggleCollapsed={() => {}} collapsedLabel="Checking…" replay={rc.replay}>
          {null}
        </Dock>,
      );
  if (rc.currentKey !== key || rc.mainMount) {
    mount.ui.remove();
    return;
  }
  rc.mainMount = mount;
}

/** Primary Dock for tier 2 (or tier 1 with no anchor found): starts as a collapsed chip,
 * fetches "panel" mode data lazily on first expand. */
export async function showPrimaryDock(rc: RunnerContext, adapter: VenueAdapter, target: Target | null, verdict: Verdict, headline: string): Promise<void> {
  let collapsed = true;
  let panelData: GuardResponse | null = null;
  let panelError: string | null = null;
  const openedForKey = rc.currentKey;

  function node(): ReactNode {
    return (
      <Dock collapsed={collapsed} onToggleCollapsed={() => void toggle()} collapsedLabel={`${verdict} · ${headline}`} replay={rc.replay}>
        {panelData ? (
          <Panel
            data={panelData}
            title={targetTitle(target)}
            onClose={() => {
              collapsed = true;
              rc.mainMount?.update(node());
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
    rc.mainMount?.update(node());
    if (collapsed || panelData || panelError || !target) return;
    const result = await guard(target, adapter.id, "panel");
    if (rc.currentKey !== openedForKey) return;
    if (result.ok) panelData = result.data;
    else panelError = errorHeadline(result.status, result.error);
    rc.mainMount?.update(node());
  }

  rc.mainMount = await mountReact(rc.ctx, { position: "inline" }, node());
}

/** Strip mode's bind/unbind pair for `createAnchorBinding`. A Strip is DOM-anchored (mounted
 * "before" the button, not rect-positioned), so a rebind must actually move it -- remove the
 * old inline mount, insert a fresh one before the new node -- rather than just re-render. */
export function createStripBinding(
  rc: RunnerContext,
  adapter: VenueAdapter,
  target: Target | null,
  verdict: Verdict,
  headline: string,
  unlocked: boolean,
) {
  async function onBind(anchor: HTMLElement): Promise<void> {
    const text = unlocked ? `${headline} · unlocked for this session` : headline;
    const node = (
      <Strip verdict={stripVerdict(verdict)} text={text} replay={rc.replay} onDetails={target ? () => void toggleEvidence(rc, adapter, target) : undefined} />
    );
    if (rc.mainMount) rc.mainMount.ui.remove();
    rc.mainMount = await mountReact(rc.ctx, { position: "inline", anchor, append: "before" }, node);
  }

  function onUnbind(): void {
    if (rc.mainMount) {
      rc.mainMount.ui.remove();
      rc.mainMount = null;
    }
  }

  return { onBind, onUnbind };
}

/** Block-screen mode's bind/unbind pair. Unlike Strip, the overlay itself stays mounted across
 * a rebind -- only the blocker + reposition listeners move to the new anchor, and the
 * overlay's rect is recomputed against it ("re-point the overlay", not remount it). Owns the
 * override-in-flight/error state for this session (persists across rebinds, since it's tied to
 * the session/key, not to a specific anchor node). */
export function createBlockBinding(rc: RunnerContext, adapter: VenueAdapter, target: Target, data: GuardResponse, headline: string, key: string) {
  const phrase = adapter.overridePhrase;
  let boundAnchor: HTMLElement | null = null;
  let overridePending = false;
  let overrideError: string | null = null;

  async function renderFrame(): Promise<void> {
    if (!boundAnchor) return;
    const node = (
      <BlockOverlay
        rect={computeBlockRect(boundAnchor.getBoundingClientRect())}
        hits={data.hits}
        phrase={phrase}
        pending={overridePending}
        error={overrideError}
        replay={rc.replay}
        onEvidence={() => void toggleEvidence(rc, adapter, target)}
        onOverride={() => void doOverride()}
      />
    );
    if (rc.mainMount) rc.mainMount.update(node);
    else rc.mainMount = await mountReact(rc.ctx, { position: "modal", zIndex: MODAL_Z_INDEX }, node);
  }

  async function doOverride(): Promise<void> {
    if (overridePending) return; // ignore rapid repeat clicks while a call is already in flight
    overridePending = true;
    overrideError = null;
    await renderFrame();

    const result = await override(target, data.verdict, data.hits.map((hit) => hit.ruleId), adapter.id);
    overridePending = false;

    if (!result.ok) {
      // A failed override call must never unlock -- stays blocked, tells the user why.
      overrideError = overrideFailureText(result.status, result.error);
      await renderFrame();
      return;
    }

    rc.unlocks.set(key, Date.now() + UNLOCK_MS);
    const existingTimer = rc.unlockTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    rc.unlockTimers.set(
      key,
      setTimeout(() => {
        if (rc.currentKey === key) void rc.renderResolved(adapter, target, key, data.verdict, headline, data);
      }, UNLOCK_MS),
    );
    // Re-render immediately as unlocked -- swaps the overlay for a Strip without a refetch.
    await rc.renderResolved(adapter, target, key, data.verdict, headline, data);
  }

  function reposition(): void {
    void renderFrame();
  }

  async function onBind(anchor: HTMLElement): Promise<void> {
    boundAnchor = anchor;
    rc.blocker = installBlocker(anchor);
    await renderFrame();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    rc.resizeObserver = new ResizeObserver(reposition);
    rc.resizeObserver.observe(anchor);
    rc.repositionCleanup = () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }

  function onUnbind(): void {
    boundAnchor = null;
    rc.blocker?.release();
    rc.blocker = null;
    rc.repositionCleanup?.();
    rc.repositionCleanup = null;
    rc.resizeObserver?.disconnect();
    rc.resizeObserver = null;
  }

  return { onBind, onUnbind };
}
