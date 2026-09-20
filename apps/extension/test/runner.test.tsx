// @vitest-environment happy-dom
import type { Target } from "@tripwire/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ApiResult } from "../lib/api";
import type { GuardResponse } from "../lib/api-types";
import type { VenueAdapter } from "../lib/adapters/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// mountReact registers packaged fonts via browser.runtime.getURL; @wxt-dev/browser reads
// globalThis.chrome at import time.
vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://tripwiretest${p}` } };
});

const guardMock = vi.fn<(target: Target, venue: string, mode?: string) => Promise<ApiResult<GuardResponse>>>();

vi.mock("../lib/api", () => ({
  guard: (target: Target, venue: string, mode?: string) => guardMock(target, venue, mode),
  override: vi.fn(),
}));

const { createGuardRunner, keyFor } = await import("../entrypoints/venues.content/runner");

function fakeCtx(): ContentScriptContext {
  return { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

const MINT_A = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const MINT_B = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function spot(mint: string): Target {
  return { kind: "spot", chain: "solana", tokenAddress: mint };
}

function response(target: Target, verdict: GuardResponse["verdict"]): ApiResult<GuardResponse> {
  const hits =
    verdict === "TRIPWIRE"
      ? [{ ruleId: "spot-exit", action: "block" as const, text: "Dumping", signalId: "labeled_exit_pct" as const, label: "x", value: -1, evidence: [] }]
      : [];
  return {
    ok: true,
    data: {
      target,
      verdict,
      hits,
      unavailable: [],
      signals: [],
      panel: { market: null, holders: null, sides: null, recordsChecked: null, recordsCap: 10, trades: null, historical: false, outcomeIndex: null, targetOutcome: null, unknownOutcome: null, options: null, optionsTotal: null, eventSlug: null, errors: [] },
      rulesPreset: "balanced",
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const adapter: VenueAdapter = {
  id: "jupiter",
  tier: 1,
  match: () => true,
  readTarget: () => null,
  anchor: (doc) => doc.querySelector<HTMLButtonElement>("#swap"),
  overridePhrase: "I AM EXIT LIQUIDITY",
};

/** Every Tripwire shadow host's rendered text, concatenated. */
function tripwireText(): string {
  return [...document.querySelectorAll("tripwire-ui")]
    .map((host) => [...(host.shadowRoot?.children ?? [])].filter((el) => el.tagName !== "STYLE").map((el) => el.textContent).join(""))
    .join(" | ");
}

let swap: HTMLButtonElement;
let swapClicks = 0;

beforeEach(() => {
  document.body.replaceChildren();
  swap = document.createElement("button");
  swap.id = "swap";
  swap.textContent = "Swap";
  swapClicks = 0;
  swap.addEventListener("click", () => swapClicks++);
  const wrapper = document.createElement("div");
  wrapper.append(swap);
  document.body.append(wrapper);
  guardMock.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("guard runner target change", () => {
  it("drops the old block synchronously and shows Checking… until the new verdict arrives", async () => {
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValueOnce(response(spot(MINT_A), "TRIPWIRE"));
    await act(async () => {
      await runner.render(adapter, spot(MINT_A), keyFor(adapter.id, spot(MINT_A)));
    });
    swap.click();
    expect(swapClicks).toBe(0); // blocked
    expect(tripwireText()).toContain("TRIPWIRE");

    const pending = deferred<ApiResult<GuardResponse>>();
    guardMock.mockReturnValueOnce(pending.promise);
    let renderB!: Promise<void>;
    act(() => {
      renderB = runner.render(adapter, spot(MINT_B), keyFor(adapter.id, spot(MINT_B)));
    });

    // Synchronously: blocker released and the old block screen gone.
    swap.click();
    expect(swapClicks).toBe(1);
    expect(tripwireText()).not.toContain("TRIPWIRE");

    // Neutral loading strip while the new check is in flight -- never a stale verdict.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(tripwireText()).toContain("Checking…");
    expect(tripwireText()).not.toContain("CLEAR");

    await act(async () => {
      pending.resolve(response(spot(MINT_B), "CLEAR"));
      await renderB;
    });
    expect(tripwireText()).not.toContain("Checking…");
    expect(tripwireText()).toContain("No flags on this token");
    runner.dispose();
  });

  it("discards a result for a superseded key", async () => {
    const runner = createGuardRunner(fakeCtx());
    const slowA = deferred<ApiResult<GuardResponse>>();
    guardMock.mockReturnValueOnce(slowA.promise);
    guardMock.mockResolvedValueOnce(response(spot(MINT_B), "CLEAR"));

    let renderA!: Promise<void>;
    act(() => {
      renderA = runner.render(adapter, spot(MINT_A), keyFor(adapter.id, spot(MINT_A)));
    });
    await act(async () => {
      await runner.render(adapter, spot(MINT_B), keyFor(adapter.id, spot(MINT_B)));
    });
    await act(async () => {
      slowA.resolve(response(spot(MINT_A), "TRIPWIRE"));
      await renderA;
    });

    swap.click();
    expect(swapClicks).toBe(1);
    expect(tripwireText()).not.toContain("TRIPWIRE");
    expect(document.querySelectorAll("tripwire-ui").length).toBe(1);
    runner.dispose();
  });
});

describe("guardHeadline", () => {
  it("prefers the top hit, then the backend's UNCHECKED reason, then the generic line", async () => {
    const { guardHeadline } = await import("../entrypoints/venues.content/format");
    expect(guardHeadline({ verdict: "TRIPWIRE", hits: [{ text: "Dumping" }], headline: null })).toBe("Dumping");
    expect(guardHeadline({ verdict: "TRIPWIRE", hits: [{ text: "rule template", label: "Smart money net −$412K" }], headline: null })).toBe("Smart money net −$412K");
    expect(guardHeadline({ verdict: "UNCHECKED", hits: [], headline: "Pick a market" })).toBe("Tripwire couldn't check this: Pick a market");
    expect(guardHeadline({ verdict: "CLEAR", hits: [], headline: "ignored" })).toBe("No flags on this token");
    expect(guardHeadline({ verdict: "UNCHECKED", hits: [] })).toBe("Tripwire couldn't check this: no data");
  });
});
