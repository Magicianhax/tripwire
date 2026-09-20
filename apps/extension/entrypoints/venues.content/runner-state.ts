import type { Target, Verdict } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { createAnchorBinding } from "../../lib/adapters/anchor-binding";
import type { GuardResponse } from "../../lib/api-types";
import type { VenueAdapter } from "../../lib/adapters/types";
import type { mountReact } from "../../lib/ui/mount";
import type { DisplayMode } from "./display-state";

export type Mount = Awaited<ReturnType<typeof mountReact>>;
export type AnchorBinding = ReturnType<typeof createAnchorBinding>;

/** Everything needed to re-route a still-visible tier-1 session -- a block screen, a strip, OR
 * the Dock fallback (no anchor found yet/anymore) -- on a later tick. See `resyncAnchor()` in
 * `runner.tsx`. */
export type ActiveSession = {
  adapter: VenueAdapter;
  target: Target | null;
  key: string;
  verdict: Verdict;
  headline: string;
  chipData: GuardResponse | null;
};

/**
 * One venue-page session's shared mutable state, plus the couple of cross-cutting
 * dependencies the display factories in `displays.tsx` need (`ctx`, the unlock maps, and a
 * callback into `runner.tsx`'s `render_` for the doOverride -> re-render path). A single plain
 * object (mutated in place), not individually closured `let`s, so `runner.tsx` and
 * `displays.tsx` can share ownership of "at most one primary display is ever mounted at once"
 * without a getter/setter per field.
 */
export type RunnerContext = {
  ctx: ContentScriptContext;
  mainMount: Mount | null;
  evidenceMount: Mount | null;
  /** Identity token of an evidence-Dock open still in flight (null when none); closing clears
   * it, which cancels that open. See `toggleEvidence` in `displays.tsx`. */
  evidenceOpening: object | null;
  blocker: { release(): void } | null;
  resizeObserver: ResizeObserver | null;
  repositionCleanup: (() => void) | null;
  anchorBinding: AnchorBinding | null;
  /** Block-screen mode only: re-syncs the extra one-click controls blocked alongside the
   * anchor (pump.fun's quick-buy chips), which the venue's SPA re-renders independently of
   * the trade button. Set by `createBlockBinding`, called every tick by `resyncAnchor()`. */
  syncExtras: (() => void) | null;
  activeSession: ActiveSession | null;
  /** What `activeSession` is currently showing ("dock" includes the tier-1 no-anchor
   * fallback). `null` when there's no active tier-1 session (tier 2, or nothing rendered
   * yet). Read by `resyncAnchor()` via `nextAction(currentDisplay, decideDisplay(...))`. */
  currentDisplay: DisplayMode | null;
  currentKey: string | null;
  marketSymbol?: string | null;
  /** Backend replay mode (recorded fixtures): every display renders the REPLAY watermark. */
  replay: boolean;
  unlocks: Map<string, number>;
  unlockTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** `runner.tsx`'s `render_`: routes an already-resolved verdict/headline (no network call)
   * to the right display. A field (not an import) to avoid a circular module dependency
   * between `runner.tsx` and `displays.tsx`. */
  renderResolved: (
    adapter: VenueAdapter,
    target: Target | null,
    key: string,
    verdict: Verdict,
    headline: string,
    chipData: GuardResponse | null,
  ) => Promise<void>;
};

export function isUnlocked(rc: RunnerContext, key: string): boolean {
  const expiry = rc.unlocks.get(key);
  return expiry !== undefined && expiry > Date.now();
}
