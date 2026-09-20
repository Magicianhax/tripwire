// @vitest-environment happy-dom
/**
 * A card that is open when the page's target changes.
 *
 * Reported live on app.uniswap.org: the user switched the Buy token, the strip re-checked, and
 * the evidence card beside it kept the previous token's panel — with the NEW token's address in
 * the same header. Two rules come out of that screenshot:
 *
 * 1. The card never paints a panel that belongs to another target. The response carries its own
 *    `target`; if it is not this card's, it is not this card's data, and the card waits.
 * 2. A target change re-targets the open card rather than leaving it: the header, the verdict
 *    and every section go back to skeletons and refill for the new target.
 */
import type { Target } from "@tripwire/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ApiResult } from "../lib/api";
import type { GuardResponse, SpotPanel } from "../lib/api-types";
import type { VenueAdapter } from "../lib/adapters/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://tripwiretest${p}` } };
});

const guardMock = vi.fn<(target: Target, venue: string, mode?: string) => Promise<ApiResult<GuardResponse>>>();

vi.mock("../lib/api", () => ({
  guard: (target: Target, venue: string, mode?: string) => guardMock(target, venue, mode),
  depth: vi.fn(async () => ({ ok: false, status: 0, error: "no" })),
  override: vi.fn(),
}));
vi.mock("../lib/token-logo", () => ({ tokenLogoDataUrl: async () => null }));

const { createGuardRunner, keyFor } = await import("../entrypoints/venues.content/runner");
const { Panel } = await import("../lib/ui/Panel");
const { createRoot } = await import("react-dom/client");

function fakeCtx(): ContentScriptContext {
  return { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

const SPCX = "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea";
const GIZA = "0x1e2f8f0a1b3c4d5e6f708192a3b4c5d6e7f80911";

const spot = (address: string): Target => ({ kind: "spot", chain: "base", tokenAddress: address });

function spotPanel(symbol: string, name: string): SpotPanel {
  return {
    chain: "base",
    token: { symbol, name, logoUrl: null } as SpotPanel["token"],
    flow: null,
    flowTimeframe: "1d",
    netflow: null,
    indicators: null,
    marketCapUsd: null,
    topBuyers: null,
    topSellers: null,
    postTimeIso: null,
    errors: [],
  } as unknown as SpotPanel;
}

function response(target: Target, symbol: string, name: string): ApiResult<GuardResponse> {
  return {
    ok: true,
    data: { target, verdict: "CLEAR", hits: [], unavailable: [], signals: [], panel: spotPanel(symbol, name), rulesPreset: "balanced" },
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
  id: "uniswap",
  tier: 1,
  match: () => true,
  readTarget: () => null,
  anchor: (doc) => doc.querySelector<HTMLButtonElement>("#swap"),
  overridePhrase: "I AM EXIT LIQUIDITY",
};

/** Every mounted shadow root, in mount order. */
const shadows = (): ShadowRoot[] => [...document.querySelectorAll("tripwire-ui")].map((h) => h.shadowRoot!).filter(Boolean);
const find = <T extends Element>(selector: string): T | null => {
  for (const root of shadows()) {
    const el = root.querySelector<T>(selector);
    if (el) return el;
  }
  return null;
};
const cardText = (): string => (find(".tw-card")?.textContent ?? "");

beforeEach(() => {
  document.body.replaceChildren();
  const swap = document.createElement("button");
  swap.id = "swap";
  swap.textContent = "Swap";
  document.body.append(swap);
  guardMock.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
});

/** Lets the mounts and the promises in flight settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Opens the strip's evidence card for the current target. */
async function openCard(): Promise<void> {
  const details = find<HTMLButtonElement>(".tw-strip-details")!;
  expect(details, "the strip offers its Details button").toBeTruthy();
  await act(async () => {
    details.click();
    await new Promise((r) => setTimeout(r, 0));
  });
  await settle();
}

describe("the open evidence card and a target change", () => {
  it("never paints a panel that belongs to another target", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    // The card is for GIZA; the response in hand is SPCX's.
    act(() =>
      root.render(
        <Panel data={response(spot(SPCX), "SPCX", "Space Exploration Technologies").ok ? (response(spot(SPCX), "SPCX", "Space Exploration Technologies") as { ok: true; data: GuardResponse }).data : null}
          title="$GIZA" target={spot(GIZA)} onClose={() => {}} />,
      ),
    );
    expect(container.textContent).not.toContain("SPCX");
    expect(container.textContent).not.toContain("Space Exploration");
    expect(container.querySelector(".tw-card")?.getAttribute("aria-busy")).toBe("true");
    act(() => root.unmount());
  });

  it("re-targets the open card: the new identity and skeletons, never the old token's numbers", async () => {
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await act(async () => {
      await runner.render(adapter, spot(SPCX), keyFor(adapter.id, spot(SPCX)));
    });
    await settle();

    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await openCard();
    expect(cardText()).toContain("SPCX");

    // The Buy token changes. The panel call for the new target is still in flight.
    const pending = deferred<ApiResult<GuardResponse>>();
    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza")); // the chip call
    guardMock.mockReturnValueOnce(pending.promise); // the card's panel call
    let renderB!: Promise<void>;
    act(() => {
      renderB = runner.render(adapter, spot(GIZA), keyFor(adapter.id, spot(GIZA)));
    });
    await settle();

    const card = find(".tw-card");
    expect(card, "the card stays open across the target change").toBeTruthy();
    expect(cardText()).not.toContain("SPCX");
    expect(cardText()).not.toContain("Space Exploration");
    expect(card!.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      pending.resolve(response(spot(GIZA), "GIZA", "Giza"));
      await renderB;
    });
    await settle();
    expect(cardText()).toContain("GIZA");
    runner.dispose();
  });

  // The change-detection loop clears everything on a URL change before it renders the new
  // target, which is exactly how the Buy token changes on a swap form. The card has to survive
  // that round trip, not only a direct re-render.
  it("re-targets across the clear the navigation loop does first", async () => {
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await act(async () => {
      await runner.render(adapter, spot(SPCX), keyFor(adapter.id, spot(SPCX)));
    });
    await settle();
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await openCard();
    expect(cardText()).toContain("SPCX");

    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza"));
    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza"));
    await act(async () => {
      await runner.clear();
      await runner.render(adapter, spot(GIZA), keyFor(adapter.id, spot(GIZA)));
    });
    await settle();
    expect(find(".tw-card"), "the card came back for the new target").toBeTruthy();
    expect(cardText()).toContain("GIZA");
    expect(cardText()).not.toContain("SPCX");
    runner.dispose();
  });

  it("never re-opens a card the user closed", async () => {
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await act(async () => {
      await runner.render(adapter, spot(SPCX), keyFor(adapter.id, spot(SPCX)));
    });
    await settle();
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await openCard();
    const close = find<HTMLButtonElement>(".tw-card-close")!;
    await act(async () => close.click());
    expect(find(".tw-card")).toBeNull();

    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza"));
    await act(async () => {
      await runner.render(adapter, spot(GIZA), keyFor(adapter.id, spot(GIZA)));
    });
    await settle();
    expect(find(".tw-card"), "a closed card stays closed").toBeNull();
    runner.dispose();
  });

  it("drops a panel answer for the target the page has already left", async () => {
    const runner = createGuardRunner(fakeCtx());
    guardMock.mockResolvedValueOnce(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
    await act(async () => {
      await runner.render(adapter, spot(SPCX), keyFor(adapter.id, spot(SPCX)));
    });
    await settle();

    const slow = deferred<ApiResult<GuardResponse>>();
    guardMock.mockReturnValueOnce(slow.promise);
    await openCard();

    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza"));
    guardMock.mockResolvedValueOnce(response(spot(GIZA), "GIZA", "Giza"));
    await act(async () => {
      await runner.render(adapter, spot(GIZA), keyFor(adapter.id, spot(GIZA)));
    });
    await settle();
    await act(async () => {
      slow.resolve(response(spot(SPCX), "SPCX", "Space Exploration Technologies"));
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();

    expect(cardText()).not.toContain("SPCX");
    expect(cardText()).not.toContain("Space Exploration");
    runner.dispose();
  });
});
