// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The popup shell after the three-tab redesign.
 *
 * The redesign is layout, theme and copy: every behaviour the popup already had — preset
 * switching with its weaken-confirm, the per-site permission request, the links, the recent
 * wallets, the locate action and the status line — has to survive being moved into tabs. These
 * tests pin the behaviours across the move, and pin the one rule the new shell adds: opening the
 * popup and switching tabs costs nothing.
 */

type Sent = { type: string; method?: string; path?: string; body?: unknown };

const state = {
  sent: [] as Sent[],
  origins: [] as string[],
  granted: true,
  storage: {} as Record<string, unknown>,
  tabUrl: "https://jup.ag/swap/SOL-WIF" as string | undefined,
  tabMessages: [] as unknown[],
  /** What the active tab's content scripts answer the locate message with. */
  locate: (() => Promise.resolve(true)) as () => Promise<unknown>,
  health: { ok: true, status: 200, json: { ok: true, keySource: "nansen-cli", replay: false } } as { ok: boolean; status: number; json: unknown },
  rules: { ok: true, status: 200, json: { preset: "paranoid", rules: [] } } as { ok: boolean; status: number; json: unknown },
  ledger: { ok: true, status: 200, json: { totalCalls: 616, successfulCalls: 610, creditsTotal: 900, creditsToday: 42, callsToday: 7, byEndpoint: [], recent: [] } } as {
    ok: boolean;
    status: number;
    json: unknown;
  },
};

vi.hoisted(() => {
  // @wxt-dev/browser reads globalThis.chrome at import time, so the fake has to exist first.
  (globalThis as { chrome?: unknown }).chrome = {};
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  document.body.innerHTML = "";
  state.sent = [];
  state.origins = ["https://debank.com/*"];
  state.granted = true;
  state.storage = {};
  state.tabUrl = "https://jup.ag/swap/SOL-WIF";
  state.tabMessages = [];
  state.locate = () => Promise.resolve(true);
  (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
    runtime: {
      id: "tripwire-test",
      getURL: (p: string) => p,
      sendMessage: async (message: Sent) => {
        state.sent.push(message);
        if (message.type === "health") return state.health;
        if (message.path === "/api/rules" && message.method === "GET") return state.rules;
        if (message.path === "/api/rules" && message.method === "PUT") {
          state.rules = { ok: true, status: 200, json: { preset: (message.body as { preset: string }).preset, rules: [] } };
          return state.rules;
        }
        if (message.path === "/api/ledger") return state.ledger;
        return { ok: false, status: 404, json: null };
      },
    },
    storage: {
      local: {
        get: async (key: string) => (key in state.storage ? { [key]: state.storage[key] } : {}),
        set: async (values: Record<string, unknown>) => {
          Object.assign(state.storage, values);
        },
      },
    },
    tabs: {
      query: async () => (state.tabUrl === undefined ? [] : [{ id: 7, url: state.tabUrl, active: true }]),
      sendMessage: async (_id: number, message: unknown) => {
        state.tabMessages.push(message);
        return state.locate();
      },
    },
    permissions: {
      getAll: async () => ({ origins: state.origins, permissions: [] }),
      request: async ({ origins }: { origins: string[] }) => {
        if (!state.granted) return false;
        state.origins.push(...origins);
        return true;
      },
      remove: async ({ origins }: { origins: string[] }) => {
        state.origins = state.origins.filter((o) => !origins.includes(o));
        return true;
      },
    },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => {},
      updateContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
  };
});

/** Mounts the popup and lets its opening effects settle. */
async function openPopup(): Promise<{ container: HTMLDivElement; root: Root }> {
  const { default: App } = await import("../entrypoints/popup/App");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

const tablist = (c: HTMLElement) => c.querySelector('[role="tablist"]')!;
const tabs = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const shown = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").includes(name));
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

describe("popup shell", () => {
  it("opens on Protection, with Sites and Wallets beside it", async () => {
    const { container } = await openPopup();
    expect(tabs(container).map((t) => t.textContent)).toEqual(["Protection", "Sites", "Wallets"]);
    expect(tabs(container)[0]!.getAttribute("aria-selected")).toBe("true");
    expect(shown(container).textContent).toContain("Paranoid");
  });

  it("only reads connection and rules on open, and nothing on tab changes", async () => {
    const { container } = await openPopup();
    const onOpen = state.sent.map((m) => `${m.type} ${m.method ?? ""} ${m.path ?? ""}`.trim());
    expect(onOpen.sort()).toEqual(["api GET /api/rules", "health"]);

    await click(tabs(container)[1]!);
    await click(tabs(container)[2]!);
    expect(state.sent).toHaveLength(onOpen.length);
  });

  it("uses the Tripwire product mark in the header and preserves Nansen attribution", async () => {
    const { container } = await openPopup();
    const productMark = container.querySelector<HTMLImageElement>(".tw-wordmark img")!;
    expect(productMark.getAttribute("src")).toContain("/logos/tripwire.png");
    expect(productMark.getAttribute("width")).toBe("28");
    expect(productMark.alt).toBe("");
    expect(container.querySelector(".tw-wordmark")!.textContent).toBe("Tripwire");
    expect(container.querySelector<HTMLImageElement>(".tw-popup-foot img")!.getAttribute("src")).toContain("/logos/nansen.svg");
  });

  it("moves focus with the arrow keys and only commits on Enter", async () => {
    const { container } = await openPopup();
    const [protection, sites] = tabs(container);
    await act(async () => {
      protection!.focus();
      tablist(container).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(sites);
    expect(protection!.getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      tablist(container).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(sites!.getAttribute("aria-selected")).toBe("true");
  });

  it("asks before weakening the preset, then saves what was confirmed", async () => {
    const { container } = await openPopup();
    await click(button(container, "Degen")!);
    expect(state.sent.some((m) => m.method === "PUT")).toBe(false);
    expect(shown(container).textContent).toContain("Switch to Degen?");

    await click(button(container, "Confirm")!);
    expect(state.sent.filter((m) => m.method === "PUT")).toEqual([{ type: "api", method: "PUT", path: "/api/rules", body: { preset: "degen" } }]);
  });

  it("names the active tab and what Tripwire does there, beside the locate action", async () => {
    const { container } = await openPopup();
    const here = shown(container).querySelector(".tw-here")!;
    expect(here.textContent).toContain("jup.ag");
    expect(here.textContent).toContain("Tripwire runs here");
    expect(here.querySelector("button")).not.toBeNull();
  });

  it("keeps the locate answer honest when no content script replies", async () => {
    state.locate = () => Promise.reject(new Error("could not establish connection"));
    const { container } = await openPopup();
    await click(shown(container).querySelector<HTMLButtonElement>(".tw-here button")!);
    expect(state.tabMessages).toHaveLength(1);
    expect(shown(container).textContent).toContain("Tripwire isn't showing anything on this tab.");
  });

  it("keeps internal accounting out of the popup and does not request the ledger", async () => {
    const { container } = await openPopup();
    const tiles = [...shown(container).querySelectorAll(".tw-tile")].map((t) => t.textContent);
    expect(tiles).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Credits today|Calls today|Calls used|Nansen CLI|NANSEN_API_KEY/);
    expect(state.sent.some((message) => message.path === "/api/ledger")).toBe(false);
  });

  it("does not show accounting placeholders when the backend is offline", async () => {
    state.ledger = { ok: false, status: 0, json: { error: "backend_unreachable" } };
    const { container } = await openPopup();
    const values = [...shown(container).querySelectorAll(".tw-tile-value")].map((t) => t.textContent);
    expect(values).toEqual([]);
  });

  it("offers the current site on Sites, and asks the browser for exactly that origin", async () => {
    state.tabUrl = "https://app.pendle.finance/trade";
    const { container } = await openPopup();
    await click(tabs(container)[1]!);
    const enable = button(shown(container), "app.pendle.finance")!;
    await click(enable);
    expect(state.origins).toContain("https://app.pendle.finance/*");
  });

  it("lists the sites already granted, with a way off each one", async () => {
    const { container } = await openPopup();
    await click(tabs(container)[1]!);
    expect(shown(container).textContent).toContain("debank.com");
    await click(shown(container).querySelector<HTMLButtonElement>('[aria-label^="Turn Tripwire off"]')!);
    expect(state.origins).toEqual([]);
  });

  it("shows every venue it runs on as a marked cell, not a list of names", async () => {
    const { container } = await openPopup();
    await click(tabs(container)[1]!);
    const cells = shown(container).querySelectorAll(".tw-venue-cell");
    expect(cells).toHaveLength(18);
    expect([...cells].every((c) => c.querySelector("img") !== null)).toBe(true);
  });

  it("keeps the recent wallets, and clears them on request", async () => {
    state.storage.recentWallets = [
      { query: "vitalik.eth", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: "vitalik.eth", chain: "ethereum", seenAt: Date.now() - 60_000 },
    ];
    const { container } = await openPopup();
    await click(tabs(container)[2]!);
    expect(shown(container).textContent).toContain("vitalik.eth");
    await click(button(shown(container), "Clear")!);
    expect(state.storage.recentWallets).toEqual([]);
  });

  it("shortens a bare address rather than letting the row clip it mid-hash", async () => {
    state.storage.recentWallets = [
      { query: "0x7fdafde5cfb5465924316eced2d3715494c517d1", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: null, chain: "arbitrum", seenAt: Date.now() },
    ];
    const { container } = await openPopup();
    await click(tabs(container)[2]!);
    const id = shown(container).querySelector(".tw-recent-id")!;
    expect(id.textContent).toBe("0x7f…17d1");
    expect(id.getAttribute("title")).toBe("0x7fdafde5cfb5465924316eced2d3715494c517d1");
  });

  it("keeps user controls reachable without linking to the internal ledger", async () => {
    const { container } = await openPopup();
    const links = [...container.querySelectorAll<HTMLAnchorElement>(".tw-popup-foot a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["http://127.0.0.1:3000/rules", "http://127.0.0.1:3000/history"]);
  });

  it("says the site is not enabled when the tab is somewhere Tripwire has no permission", async () => {
    state.tabUrl = "https://app.pendle.finance/trade";
    const { container } = await openPopup();
    expect(shown(container).querySelector(".tw-here")!.textContent).toContain("Not enabled here");
  });

  it("says there is nothing to watch on a page it can never run on", async () => {
    state.tabUrl = "chrome://extensions";
    const { container } = await openPopup();
    expect(shown(container).querySelector(".tw-here")!.textContent).toContain("No page here to watch");
  });

  it("says the wallet lens is on for a site the user granted", async () => {
    state.tabUrl = "https://debank.com/profile";
    const { container } = await openPopup();
    expect(shown(container).querySelector(".tw-here")!.textContent).toContain("Wallet lens enabled here");
  });

  it("keeps the backend URL editable, behind the settings control", async () => {
    const { container } = await openPopup();
    expect(container.querySelector("#tw-backend-url")).toBeNull();
    await click(container.querySelector<HTMLButtonElement>(".tw-gear")!);
    const input = container.querySelector<HTMLInputElement>("#tw-backend-url")!;
    await act(async () => {
      // React tracks the last value it wrote, so a typed change has to go through the native
      // setter the way a real keystroke does.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "http://127.0.0.1:3229");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.storage.backendUrl).toBe("http://127.0.0.1:3229");
  });
});
