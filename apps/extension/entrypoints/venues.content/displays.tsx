import type { ReactNode } from "react";
import type { DepthSection, Target, Verdict, ViewTimeframe } from "@tripwire/core";
import { createElementSetBinding } from "../../lib/adapters/anchor-binding";
import { installBlocker } from "../../lib/adapters/blocker";
import type { Placement, VenueAdapter } from "../../lib/adapters/types";
import { depth, guard, override } from "../../lib/api";
import type { DepthResponse, GuardResponse, SpotPanel } from "../../lib/api-types";
import { cardSize, setCardSize, type CardSize } from "../../lib/card-size";
import { runContentTask } from "../../lib/content-lifecycle";
import { EVIDENCE_TAB } from "../../lib/ui/BlockScreen";
import { fitToAnchor, hostBox, liftOutOfRow } from "../../lib/ui/fit";
import { Dock, SHEET_BELOW } from "../../lib/ui/Dock";
import { mountIfCurrent, mountReact } from "../../lib/ui/mount";
import { CardMessage } from "../../lib/ui/panel-parts";
import { Panel } from "../../lib/ui/Panel";
import { MarketsOnlyCard } from "../../lib/ui/MarketsView";
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

/** One tab's lazy sections, with the failure turned into the sentence the card prints. */
async function fetchDepth(target: Target, sections: DepthSection[]): Promise<{ ok: true; data: DepthResponse } | { ok: false; error: string }> {
  const result = await depth(target, sections);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: errorHeadline(result.status, result.error) };
}

/**
 * Takes the card off the screen.
 *
 * `keepOpen` is the difference between the two reasons that happens for. A user who pressed
 * Close, Escape or Details again wants no card, and the intent goes with it. A teardown —
 * the page moved to another token, and every mounted surface is dropped before the new check —
 * is not the user closing anything, so the intent survives and `runner.tsx` re-opens the card
 * on the new target.
 */
function dropEvidence(rc: RunnerContext, keepOpen = false): void {
  rc.evidenceOpening = null; // cancels an open still in flight
  if (!keepOpen) rc.evidenceOpen = null;
  if (rc.evidenceMount) {
    rc.evidenceMount.ui.remove();
    rc.evidenceMount = null;
  }
}

function closeEvidence(rc: RunnerContext): void {
  dropEvidence(rc);
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
  await openEvidence(rc, adapter, target, trigger, initialTab);
}

/**
 * Re-points an open evidence card at the page's new target (`runner.tsx` calls this after a
 * target change tore the previous card down).
 *
 * The card comes back in its first frame — skeletons per section, the new identity in the
 * header — and fills in from the new target's own panel call, exactly as it would if it had
 * just been opened. It is anchored to the bound trade button rather than to the Details button
 * that opened it, because the strip carrying that button was just re-mounted for the new
 * target. A card for a page that now has no target is not re-opened at all.
 */
export async function retargetEvidence(rc: RunnerContext, adapter: VenueAdapter, target: Target, initialTab?: string): Promise<void> {
  if (rc.evidenceMount || rc.evidenceOpening) return;
  await openEvidence(rc, adapter, target, rc.anchorBinding?.anchor ?? null, initialTab);
}

async function openEvidence(rc: RunnerContext, adapter: VenueAdapter, target: Target, trigger: HTMLElement | null, initialTab?: string): Promise<void> {
  const opening = {};
  rc.evidenceOpening = opening;
  rc.evidenceOpen = { initialTab };
  const openedForKey = rc.currentKey;
  const stillWanted = () => (rc.evidenceOpening === opening || rc.evidenceMount === mount) && rc.currentKey === openedForKey;

  // From the block screen the card opens beside the whole block (so it never hides the
  // warning, and clicks inside the block don't dismiss it); from a Strip, beside Details.
  const block = trigger?.closest(".tw-block") ?? null;
  const checkedAtIso = new Date().toISOString();
  let size: CardSize = cardSize(target.kind);
  let result: Awaited<ReturnType<typeof guard>> | null = null;
  let mount: Awaited<ReturnType<typeof mountReact>> | null = null;

  function node(): ReactNode {
    const ok = result?.ok ? result.data : null;
    return (
      <Popover
        anchor={block ?? trigger}
        prefer={block ? "side" : "vertical"}
        onClose={() => closeEvidence(rc)}
        returnFocus={() => trigger}
        sheetBelow={SHEET_BELOW}
        verdict={ok?.verdict ?? (result ? "UNCHECKED" : "LOADING")}
        size={size}
        onToggleSize={() => {
          size = size === "expanded" ? "compact" : "expanded";
          setCardSize(target.kind, size);
          mount?.update(node());
        }}
      >
        <Panel
          enableMarkets={target.kind === "spot"}
          data={ok}
          error={result && !result.ok ? errorHeadline(result.status, result.error) : null}
          title={targetTitle(target)}
          onClose={() => closeEvidence(rc)}
          replay={rc.replay}
          initialTab={initialTab}
          checkedAtIso={checkedAtIso}
          chain={target.kind === "spot" ? target.chain : null}
          target={target}
          onDepth={(sections) => fetchDepth(target, sections)}
          onTimeframe={target.kind === "spot" ? (timeframe) => fetchSpotPanel(adapter, target, timeframe) : undefined}
        />
      </Popover>
    );
  }

  // The card is mounted before the guard call, not after it: clicking Details puts something on
  // screen in the same frame, with a skeleton per section, and the evidence fills in.
  mount = await mountReact(rc.ctx, { position: "modal", zIndex: EVIDENCE_Z_INDEX }, node());
  if (!stillWanted()) {
    mount.ui.remove();
    return;
  }
  rc.evidenceOpening = null;
  rc.evidenceMount = mount;

  const answered = await guard(target, adapter.id, "panel");
  if (rc.evidenceMount !== mount) return; // closed, or the page moved on, while this was in flight
  result = answered;
  mount.update(node());
}

/** The runner's teardown: the card goes, the user's intent to have one stays. */
export function closeEvidenceDock(rc: RunnerContext): void {
  dropEvidence(rc, true);
}

async function toggleMarkets(rc:RunnerContext,symbol:string,trigger:HTMLElement|null):Promise<void> {
  if(rc.evidenceMount){closeEvidence(rc);return;}
  if(rc.evidenceOpening)return;
  const opening={};const key=rc.currentKey;rc.evidenceOpening=opening;
  let size:CardSize=cardSize("spot");
  let mount:Awaited<ReturnType<typeof mountReact>>|null=null;
  const node=()=> <Popover anchor={trigger} returnFocus={()=>trigger} onClose={()=>closeEvidence(rc)} size={size}
    onToggleSize={()=>{size=size==="compact"?"expanded":"compact";setCardSize("spot",size);mount?.update(node());}}>
    <MarketsOnlyCard symbol={symbol} onClose={()=>closeEvidence(rc)}/>
  </Popover>;
  mount=await mountReact(rc.ctx,{position:"modal",zIndex:EVIDENCE_Z_INDEX},node());
  if(rc.currentKey!==key||rc.evidenceOpening!==opening){mount.ui.remove();return;}
  rc.evidenceOpening=null;rc.evidenceMount=mount;
}

/** The neutral "Checking…" state shown between a target change and its new verdict: a LOADING
 * Strip above the anchor when one is present (tier 1), else a collapsed Dock chip. Never
 * installs a blocker. Dropped (not stored) if the page moved on, or something else already
 * mounted, while the shadow root was being created. */
export async function showChecking(rc: RunnerContext, adapter: VenueAdapter, key: string, placement: Placement | null): Promise<void> {
  // The strip goes above the whole action row, not beside the button inside it.
  const anchor = placement ? liftOutOfRow(placement.element) : null;
  const mount = anchor
    ? await mountReact(
        rc.ctx,
        { position: "inline", anchor, append: placement!.place },
        <Strip verdict="LOADING" text="Checking…" replay={rc.replay} venue={adapter.id} />,
      )
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
  let size: CardSize = cardSize(target?.kind ?? "spot");
  const openedForKey = rc.currentKey;

  function node(): ReactNode {
    return (
      <Dock
        collapsed={collapsed}
        verdict={verdict}
        headline={headline}
        // This dock is the fallback: no anchor on the page qualified, so nothing on screen
        // points at it. It gets the one-time entrance and the verdict edge that earn a glance.
        entrance
        onToggleCollapsed={() => void runContentTask(rc.ctx, toggle)}
        replay={rc.replay}
        venue={adapter.id}
        size={size}
        onToggleSize={() => {
          size = size === "expanded" ? "compact" : "expanded";
          setCardSize(target?.kind ?? "spot", size);
          rc.mainMount?.update(node());
        }}
      >
        {/* The card is the same one every surface uses, so it opens with skeletons here too:
            the dock chip expands into a card immediately, not after the guard call. */}
        {!target && rc.marketSymbol ? <MarketsOnlyCard symbol={rc.marketSymbol} onClose={()=>{collapsed=true;rc.mainMount?.update(node());}}/> : <Panel
          enableMarkets={target?.kind === "spot"}
          data={panelData}
          error={panelError}
          title={targetTitle(target)}
          checkedAtIso={checkedAtIso}
          chain={target?.kind === "spot" ? target.chain : null}
          target={target}
          onDepth={target ? (sections) => fetchDepth(target, sections) : undefined}
          onTimeframe={target?.kind === "spot" ? (timeframe) => fetchSpotPanel(adapter, target, timeframe) : undefined}
          onClose={() => {
            collapsed = true;
            rc.mainMount?.update(node());
          }}
        />}
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
  /** The placement the bound element came from: which side of it the strip sits on. A trade
   * button is mounted above (never covering the venue's own action); a header is mounted below,
   * because the strip describes what that header names. */
  getPlacement: () => Placement | null = () => null,
) {
  let unfit: (() => void) | null = null;

  async function onBind(button: HTMLElement): Promise<void> {
    // The blocker binds to the trade button; the strip is inserted above the row that holds it,
    // so a venue that lays that row out horizontally does not squeeze the strip beside it.
    const anchor = liftOutOfRow(button);
    const append = getPlacement()?.element === button ? getPlacement()!.place : "before";
    const text = unlocked ? `${headline}, unlocked for this session` : headline;
    const node = (
      <Strip verdict={stripVerdict(verdict)} text={text} rule={rule} replay={rc.replay} venue={adapter.id}
        detailsLabel={target ? "Details" : "Markets"}
        onDetails={target ? (trigger) => void runContentTask(rc.ctx, () => toggleEvidence(rc, adapter, target, trigger)) : rc.marketSymbol ? (trigger)=>void runContentTask(rc.ctx,()=>toggleMarkets(rc,rc.marketSymbol!,trigger)) : undefined} />
    );
    if (rc.mainMount) rc.mainMount.ui.remove();
    // Guards the residual A2 race: `sync()` (runner.tsx) calls this without awaiting it, so a
    // target change can land in `rc.currentKey` before `mountReact()` below resolves. Capture
    // the key now; if it no longer matches once the mount is ready, the mount is for a
    // superseded target -- drop it instead of overwriting whatever the newer render set.
    const key = rc.currentKey;
    if (key === null) return;
    const mount = await mountIfCurrent(() => rc.currentKey, key, () => mountReact(rc.ctx, { position: "inline", anchor, append }, node));
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

  return { onBind: (anchor: HTMLElement) => runContentTask(rc.ctx, () => onBind(anchor)), onUnbind };
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

  // Other one-click trade controls on the page (pump.fun's quick-buy chips): each gets its own
  // blocker and the same isConnected re-sync the anchor gets, and the block screen is sized to
  // cover them. Bound only while the anchor is bound -- a block session, not the page.
  const extraBlockers = new Map<HTMLElement, { release(): void }>();
  const extras = createElementSetBinding({
    find: () => (boundAnchor ? (adapter.blockedExtras?.(document) ?? []) : []),
    onBind: (el) => extraBlockers.set(el, installBlocker(el)),
    onUnbind: (el) => {
      extraBlockers.get(el)?.release();
      extraBlockers.delete(el);
    },
  });

  /** Re-syncs the extra blocked controls, re-drawing the block only when the set changed. */
  function syncExtras(): void {
    if (extras.sync()) void runContentTask(rc.ctx, renderFrame);
  }

  async function renderFrame(): Promise<void> {
    if (!boundAnchor) return;
    const node = (
      <BlockOverlay
        anchorRect={boundAnchor.getBoundingClientRect()}
        extraRects={extras.elements.map((el) => el.getBoundingClientRect())}
        containerRect={hostBox(boundAnchor)}
        kind={target.kind}
        hits={data.hits}
        phrase={phrase}
        pending={overridePending}
        error={overrideError}
        replay={rc.replay}
        venue={adapter.id}
        onEvidence={(trigger) => void runContentTask(rc.ctx, () => toggleEvidence(rc, adapter, target, trigger, EVIDENCE_TAB[target.kind]))}
        onOverride={() => void runContentTask(rc.ctx, doOverride)}
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
        if (rc.currentKey === key) void runContentTask(rc.ctx, () => rc.renderResolved(adapter, target, key, data.verdict, headline, data));
      }, UNLOCK_MS),
    );
    // Re-render immediately as unlocked -- swaps the overlay for a Strip without a refetch.
    await rc.renderResolved(adapter, target, key, data.verdict, headline, data);
  }

  function reposition(): void {
    void runContentTask(rc.ctx, renderFrame);
  }

  async function onBind(anchor: HTMLElement): Promise<void> {
    boundAnchor = anchor;
    rc.blocker = installBlocker(anchor);
    extras.sync();
    await renderFrame();
    if (rc.ctx.isInvalid || boundAnchor !== anchor) return;
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
    // The extras belong to this block session: when the trade button goes, so do they.
    extras.unbindAll();
    rc.blocker?.release();
    rc.blocker = null;
    rc.repositionCleanup?.();
    rc.repositionCleanup = null;
    rc.resizeObserver?.disconnect();
    rc.resizeObserver = null;
  }

  return { onBind: (anchor: HTMLElement) => runContentTask(rc.ctx, () => onBind(anchor)), onUnbind, syncExtras };
}
