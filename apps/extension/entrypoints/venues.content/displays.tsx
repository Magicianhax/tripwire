import type { ReactNode } from "react";
import type { Target, Verdict, ViewTimeframe } from "@tripwire/core";
import { installBlocker } from "../../lib/adapters/blocker";
import type { VenueAdapter } from "../../lib/adapters/types";
import { guard, override } from "../../lib/api";
import type { GuardResponse, SpotPanel } from "../../lib/api-types";
import { EVIDENCE_TAB } from "../../lib/ui/BlockScreen";
import { fitToAnchor } from "../../lib/ui/fit";
import { Dock, SHEET_BELOW } from "../../lib/ui/Dock";
import { mountIfCurrent, mountReact } from "../../lib/ui/mount";
import { CardMessage } from "../../lib/ui/panel-parts";
import { Panel } from "../../lib/ui/Panel";
import { Popover } from "../../lib/ui/Popover";
import { Strip } from "../../lib/ui/Strip";
import { BlockOverlay } from "./BlockOverlay";
import { errorHeadline, overrideFailureText, targetTitle } from "./format";
import type { RunnerContext } from "./runner-state";

const UNLOCK_MS = 60_000;
const MODAL_Z_INDEX = 2_147_483_000;
/** The evidence card the user opened sits above the block screen it was opened from (the
 * blocker on the trade button is a listener, so covering the block never unblocks anything). */
const EVIDENCE_Z_INDEX = MODAL_Z_INDEX + 1;

function stripVerdict(verdict: Verdict): "CAUTION" | "UNCHECKED" | "CLEAR" {
  return verdict === "TRIPWIRE" ? "CAUTION" : verdict;
}

/** Refetches the evidence for another view window. The verdict is recomputed server-side on the
 * rule window either way, so only the panel is taken: the card keeps the verdict it opened with. */
async function fetchSpotPanel(adapter: VenueAdapter, target: Target, timeframe: ViewTimeframe): Promise<SpotPanel | null> {
  const result = await guard(target, adapter.id, "panel", timeframe);
  return result.ok ? (result.data.panel as SpotPanel) : null;
}

function closeEvidence(rc: RunnerContext): void {
  rc.evidenceOpening = null; // cancels an open still in flight
  if (rc.evidenceMount) {
    rc.evidenceMount.ui.remove();
    rc.evidenceMount = null;
  }
}

/** Toggles the on-demand evidence card (Strip's "Details" / BlockScreen's evidence button),
 * anchored to the button that opened it (`trigger`) in its own body-level shadow root.
 * Fetches "panel" mode data lazily on open; never blocks the trade on a failed fetch.
 * Idempotent while opening: a repeat click during the fetch is ignored, and a close/teardown
 * during it cancels the open (checked again after the async mount, so no orphaned card). */
export async function toggleEvidence(rc: RunnerContext, adapter: VenueAdapter, target: Target, trigger: HTMLElement | null = null, initialTab?: string): Promise<void> {
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
  const checkedAtIso = new Date().toISOString();
  if (!stillWanted()) return; // closed, or the page moved on, while this was in flight
  // From the block screen the card opens beside the whole block (so it never hides the
  // warning, and clicks inside the block don't dismiss it); from a Strip, beside Details.
  const block = trigger?.closest(".tw-block") ?? null;
  const node = (
    <Popover
      anchor={block ?? trigger}
      prefer={block ? "side" : "vertical"}
      onClose={() => closeEvidence(rc)}
      returnFocus={() => trigger}
      sheetBelow={SHEET_BELOW}
      verdict={result.ok ? result.data.verdict : "UNCHECKED"}
    >
      {result.ok ? (
        <Panel
          data={result.data}
          title={targetTitle(target)}
          onClose={() => closeEvidence(rc)}
          replay={rc.replay}
          initialTab={initialTab}
          checkedAtIso={checkedAtIso}
          onTimeframe={target.kind === "spot" ? (timeframe) => fetchSpotPanel(adapter, target, timeframe) : undefined}
        />
      ) : (
        <CardMessage title={targetTitle(target)} chain={target?.kind === "spot" ? target.chain : null} kind="error" message={errorHeadline(result.status, result.error)} replay={rc.replay} checkedAtIso={checkedAtIso} />
      )}
    </Popover>
  );
  const mount = await mountReact(rc.ctx, { position: "modal", zIndex: EVIDENCE_Z_INDEX }, node);
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
    ? await mountReact(rc.ctx, { position: "inline", anchor, append: "before" }, <Strip verdict="LOADING" text="Checking…" replay={rc.replay} venue={adapter.id} />)
    : await mountReact(
        rc.ctx,
        { position: "inline" },
        <Dock collapsed verdict="LOADING" onToggleCollapsed={() => {}} replay={rc.replay} venue={adapter.id}>
          {null}
        </Dock>,
      );
  if (rc.currentKey !== key || rc.mainMount) {
    mount.ui.remove();
    return;
  }
  if (anchor) fitToAnchor(mount.ui.shadowHost, anchor);
  rc.mainMount = mount;
}

/** Primary Dock for tier 2 (or tier 1 with no anchor found): a verdict chip that opens the
 * evidence card beside it, fetching "panel" mode data lazily on first open. */
export async function showPrimaryDock(rc: RunnerContext, adapter: VenueAdapter, target: Target | null, verdict: Verdict, headline: string): Promise<void> {
  let collapsed = true;
  let panelData: GuardResponse | null = null;
  let panelError: string | null = null;
  let checkedAtIso: string | undefined;
  const openedForKey = rc.currentKey;

  function node(): ReactNode {
    return (
      <Dock collapsed={collapsed} verdict={verdict} headline={headline} onToggleCollapsed={() => void toggle()} replay={rc.replay} venue={adapter.id}>
        {panelData ? (
          <Panel
            data={panelData}
            title={targetTitle(target)}
            checkedAtIso={checkedAtIso}
            onTimeframe={target?.kind === "spot" ? (timeframe) => fetchSpotPanel(adapter, target, timeframe) : undefined}
            onClose={() => {
              collapsed = true;
              rc.mainMount?.update(node());
            }}
          />
        ) : panelError ? (
          <CardMessage title={targetTitle(target)} chain={target?.kind === "spot" ? target.chain : null} kind="error" message={panelError} checkedAtIso={checkedAtIso} />
        ) : (
          <CardMessage title={targetTitle(target)} chain={target?.kind === "spot" ? target.chain : null} message="Loading evidence…" />
        )}
      </Dock>
    );
  }

  async function toggle(): Promise<void> {
    collapsed = !collapsed;
    rc.mainMount?.update(node());
    if (collapsed || panelData || panelError || !target) return;
    const result = await guard(target, adapter.id, "panel");
    checkedAtIso = new Date().toISOString();
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
  rule: string | null = null,
) {
  let unfit: (() => void) | null = null;

  async function onBind(anchor: HTMLElement): Promise<void> {
    const text = unlocked ? `${headline}, unlocked for this session` : headline;
    const node = (
      <Strip verdict={stripVerdict(verdict)} text={text} rule={rule} replay={rc.replay} venue={adapter.id} onDetails={target ? (trigger) => void toggleEvidence(rc, adapter, target, trigger) : undefined} />
    );
    if (rc.mainMount) rc.mainMount.ui.remove();
    // Guards the residual A2 race: `sync()` (runner.tsx) calls this without awaiting it, so a
    // target change can land in `rc.currentKey` before `mountReact()` below resolves. Capture
    // the key now; if it no longer matches once the mount is ready, the mount is for a
    // superseded target -- drop it instead of overwriting whatever the newer render set.
    const key = rc.currentKey;
    if (key === null) return;
    const mount = await mountIfCurrent(() => rc.currentKey, key, () => mountReact(rc.ctx, { position: "inline", anchor, append: "before" }, node));
    if (!mount) return;
    rc.mainMount = mount;
    // The strip describes this anchor, so it is never allowed to be wider than it.
    unfit?.();
    unfit = fitToAnchor(mount.ui.shadowHost, anchor);
  }

  function onUnbind(): void {
    unfit?.();
    unfit = null;
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
        anchorRect={boundAnchor.getBoundingClientRect()}
        kind={target.kind}
        hits={data.hits}
        phrase={phrase}
        pending={overridePending}
        error={overrideError}
        replay={rc.replay}
        venue={adapter.id}
        onEvidence={(trigger) => void toggleEvidence(rc, adapter, target, trigger, EVIDENCE_TAB[target.kind])}
        onOverride={() => void doOverride()}
      />
    );
    if (rc.mainMount) {
      rc.mainMount.update(node);
      return;
    }
    // Same A2 guard as Strip's onBind above: capture the render key before the await, drop the
    // mount if a target change superseded it while `mountReact()` was resolving. (Named
    // `renderKey` to avoid shadowing the outer `key` param, the session key this binding was
    // created for.)
    const renderKey = rc.currentKey;
    if (renderKey === null) return;
    const mount = await mountIfCurrent(() => rc.currentKey, renderKey, () => mountReact(rc.ctx, { position: "modal", zIndex: MODAL_Z_INDEX }, node));
    if (mount) rc.mainMount = mount;
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
