// @vitest-environment happy-dom
import type { Target } from "@tripwire/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ApiResult } from "../lib/api-result";
import type { GuardResponse } from "../lib/api-types";
import type { VenueAdapter } from "../lib/adapters/types";
import type { RunnerContext } from "../entrypoints/venues.content/runner-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://tripwiretest${p}` } };
});

const guardMock = vi.fn<() => Promise<ApiResult<GuardResponse>>>();
/** The card's tabs ask for their own sections as soon as one is shown, so the mock has to
 * answer `depth` too — with nothing, which is what an empty depth section looks like. */
const depthMock = vi.fn(async () => ({ ok: true as const, status: 200, data: { credits: 0, skipped: [] } }));
vi.mock("../lib/api", () => ({ guard: () => guardMock(), depth: () => depthMock(), override: vi.fn() }));

const { toggleEvidence, closeEvidenceDock } = await import("../entrypoints/venues.content/displays");

const target: Target = { kind: "perp", coin: "ETH", side: "long" };
const adapter: VenueAdapter = { id: "hyperliquid", tier: 1, match: () => true, readTarget: () => target, overridePhrase: "I AM THE LIQUIDITY" };

function rcFor(): RunnerContext {
  return {
    ctx: { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext,
    mainMount: null,
    evidenceMount: null,
    evidenceOpening: null,
    blocker: null,
    resizeObserver: null,
    repositionCleanup: null,
    anchorBinding: null,
    syncExtras: null,
    activeSession: null,
    currentDisplay: null,
    currentKey: "k1",
    replay: false,
    unlocks: new Map(),
    unlockTimers: new Map(),
    renderResolved: async () => {},
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const failed: ApiResult<GuardResponse> = { ok: false, status: 0, error: "backend_unreachable" };
const docks = () => document.querySelectorAll("tripwire-ui").length;

beforeEach(() => {
  document.body.replaceChildren();
  guardMock.mockReset();
});
afterEach(() => document.body.replaceChildren());

describe("toggleEvidence (D4)", () => {
  it("a repeat click while the evidence is loading is a no-op: one fetch, one dock", async () => {
    const rc = rcFor();
    const pending = deferred<ApiResult<GuardResponse>>();
    guardMock.mockReturnValue(pending.promise);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = toggleEvidence(rc, adapter, target);
      second = toggleEvidence(rc, adapter, target);
    });
    await act(async () => {
      pending.resolve(failed);
      await Promise.all([first, second]);
    });
    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(docks()).toBe(1);
    expect(rc.evidenceMount).not.toBeNull();

    await act(async () => {
      await toggleEvidence(rc, adapter, target); // open -> close
    });
    expect(docks()).toBe(0);
  });

  it("closing (teardown) while the evidence is loading leaves no orphaned dock", async () => {
    const rc = rcFor();
    const pending = deferred<ApiResult<GuardResponse>>();
    guardMock.mockReturnValue(pending.promise);
    let open!: Promise<void>;
    act(() => {
      open = toggleEvidence(rc, adapter, target);
    });
    closeEvidenceDock(rc);
    await act(async () => {
      pending.resolve(failed);
      await open;
    });
    expect(docks()).toBe(0);
    expect(rc.evidenceMount).toBeNull();
  });
});

describe("evidence card popover", () => {
  const ok: ApiResult<GuardResponse> = {
    ok: true,
    data: { target, verdict: "TRIPWIRE", hits: [], unavailable: [], signals: [], panel: { coin: "ETH", mode: "panel", screener: null, positions: null, positionsIsLastPage: null, positionsReturned: null, trades: null, cohorts: null, cohortsAtIso: null, tradesError: null, cohortsError: null, errors: [] }, rulesPreset: "balanced" },
  };

  it("opens as a body-level dialog anchored to its trigger, on the requested tab, and Escape closes it with focus back on the trigger", async () => {
    const rc = rcFor();
    guardMock.mockResolvedValue(ok);
    const trigger = document.createElement("button");
    document.body.append(trigger);
    await act(async () => {
      await toggleEvidence(rc, adapter, target, trigger, "liquidations");
    });
    const host = document.querySelector("tripwire-ui") as HTMLElement;
    expect(host.parentElement).toBe(document.body);
    const dialog = host.shadowRoot!.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Liquidations");
    expect(host.shadowRoot!.activeElement?.id).toBe(dialog.getAttribute("aria-labelledby"));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(rc.evidenceMount).toBeNull();
    expect(docks()).toBe(0);
    expect(document.activeElement).toBe(trigger);
  });

  it("a pointerdown outside the card closes it; one on the trigger leaves it for the trigger's own toggle", async () => {
    const rc = rcFor();
    guardMock.mockResolvedValue(ok);
    const trigger = document.createElement("button");
    document.body.append(trigger);
    await act(async () => {
      await toggleEvidence(rc, adapter, target, trigger);
    });
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    });
    expect(rc.evidenceMount).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    });
    expect(rc.evidenceMount).toBeNull();
    expect(docks()).toBe(0);
  });
});
