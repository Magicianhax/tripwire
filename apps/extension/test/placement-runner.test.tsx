// @vitest-environment happy-dom
import type { Target } from "@tripwire/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ApiResult } from "../lib/api";
import type { GuardResponse } from "../lib/api-types";
import type { VenueAdapter } from "../lib/adapters/types";

/**
 * Round 1.6, at the runner: what the placement rules actually put on the page.
 *
 * One primary surface per page (the brief's second principle), the strip mounted on the side
 * of its anchor that the anchor's role calls for, a tier-2 venue with a header getting a strip
 * instead of a corner dock, and "where is it?" lighting whatever is mounted.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://tripwiretest${p}` } };
});

const guardMock = vi.fn<(target: Target, venue: string, mode?: string) => Promise<ApiResult<GuardResponse>>>();

vi.mock("../lib/api", () => ({
  guard: (target: Target, venue: string, mode?: string) => guardMock(target, venue, mode),
  override: vi.fn(),
  depth: vi.fn(),
}));

const { createGuardRunner, keyFor } = await import("../entrypoints/venues.content/runner");
const { LOCATE_MS } = await import("../entrypoints/venues.content/locate");

function fakeCtx(): ContentScriptContext {
  return { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

const MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const target: Target = { kind: "spot", chain: "solana", tokenAddress: MINT };

function response(verdict: GuardResponse["verdict"]): ApiResult<GuardResponse> {
  return {
    ok: true,
    data: {
      target,
      verdict,
      hits: [],
      unavailable: [],
      signals: [],
      panel: { market: null, holders: null, sides: null, recordsChecked: null, recordsCap: 10, trades: null, historical: false, errors: [] },
      rulesPreset: "balanced",
    } as unknown as GuardResponse,
  };
}

/** A tier-2 venue shaped like DexScreener's data panel: a pair header, then the price block. */
const tier2: VenueAdapter = {
  id: "dexscreener",
  tier: 2,
  match: () => true,
  readTarget: () => null,
  anchorPriority: [{ role: "token-identity", find: (doc) => doc.querySelector<HTMLElement>("#pair-header") }],
  overridePhrase: "I AM EXIT LIQUIDITY",
};

/** A tier-1 venue whose trade button is the head candidate, exactly as today. */
const tier1: VenueAdapter = {
  id: "jupiter",
  tier: 1,
  match: () => true,
  readTarget: () => null,
  anchor: (doc) => doc.querySelector<HTMLButtonElement>("#swap"),
  anchorPriority: [{ role: "token-identity", find: (doc) => doc.querySelector<HTMLElement>("#pair-header") }],
  overridePhrase: "I AM EXIT LIQUIDITY",
};

function panelPage(withButton: boolean): void {
  const main = document.createElement("main");
  const header = document.createElement("div");
  header.id = "pair-header";
  header.textContent = "$WIF / SOL";
  const price = document.createElement("div");
  price.id = "price";
  price.textContent = "Price USD $0.1966";
  main.append(header, price);
  if (withButton) {
    const button = document.createElement("button");
    button.id = "swap";
    button.textContent = "Swap";
    main.append(button);
  }
  document.body.append(main);
}

/** The mounted shadow hosts, in document order, with the host they were inserted next to. */
function mountedHosts(): { previousId: string | null; nextId: string | null }[] {
  return [...document.querySelectorAll("tripwire-ui")].map((host) => ({
    previousId: host.previousElementSibling?.id ?? null,
    nextId: host.nextElementSibling?.id ?? null,
  }));
}

beforeEach(() => {
  document.body.replaceChildren();
  guardMock.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("one primary placement per page", () => {
  it("mounts exactly one surface for a tier-2 venue, under its pair header", async () => {
    panelPage(false);
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValue(response("CAUTION"));
    await act(async () => {
      await runner.render(tier2, target, keyFor(tier2.id, target));
    });

    const hosts = mountedHosts();
    expect(hosts).toHaveLength(1);
    // "after" the header: the header is behind it, the price block ahead of it.
    expect(hosts[0]).toEqual({ previousId: "pair-header", nextId: "price" });
    runner.dispose();
  });

  it("prefers the trade button and mounts above it, leaving the header alone", async () => {
    panelPage(true);
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValue(response("CLEAR"));
    await act(async () => {
      await runner.render(tier1, target, keyFor(tier1.id, target));
    });

    const hosts = mountedHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.nextId).toBe("swap"); // above the button it guards, never covering it
    runner.dispose();
  });

  it("falls back to the dock when the page offers no anchor at all", async () => {
    document.body.append(document.createElement("main"));
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValue(response("UNCHECKED"));
    await act(async () => {
      await runner.render(tier2, target, keyFor(tier2.id, target));
    });

    expect(document.querySelectorAll("tripwire-ui")).toHaveLength(1);
    const chip = document.querySelector("tripwire-ui")?.shadowRoot?.querySelector(".tw-dock-chip");
    expect(chip).not.toBeNull();
    // The fallback earns its entrance and its verdict edge; an on-demand card does not.
    expect(chip?.hasAttribute("data-primary")).toBe(true);
    expect(chip?.getAttribute("data-verdict")).toBe("UNCHECKED");
    runner.dispose();
  });

  it("re-routes to the dock when the anchor leaves the page, leaving nothing behind", async () => {
    panelPage(false);
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValue(response("CAUTION"));
    await act(async () => {
      await runner.render(tier2, target, keyFor(tier2.id, target));
    });
    expect(document.querySelectorAll("tripwire-ui")).toHaveLength(1);

    document.querySelector("#pair-header")!.remove();
    await act(async () => {
      await runner.resyncAnchor();
    });

    expect(document.querySelectorAll("tripwire-ui")).toHaveLength(1);
    expect(document.querySelector("tripwire-ui")?.shadowRoot?.querySelector(".tw-dock-chip")).not.toBeNull();
    runner.dispose();
  });
});

describe("where is it?", () => {
  it("lights the mounted strip for 1.5s and then stops", async () => {
    vi.useFakeTimers();
    panelPage(false);
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValue(response("CAUTION"));
    await act(async () => {
      await runner.render(tier2, target, keyFor(tier2.id, target));
    });

    expect(runner.locate()).toBe(true);
    const strip = document.querySelector("tripwire-ui")?.shadowRoot?.querySelector(".tw-strip");
    expect(strip?.hasAttribute("data-tw-locate")).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(LOCATE_MS + 1);
    });
    expect(strip?.hasAttribute("data-tw-locate")).toBe(false);
    runner.dispose();
  });

  it("answers false when nothing is mounted, so the popup can say so", () => {
    const runner = createGuardRunner(fakeCtx());
    expect(runner.locate()).toBe(false);
    runner.dispose();
  });
});
