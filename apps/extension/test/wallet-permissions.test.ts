import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-site consent flow, against a fake `chrome`. What matters is that the wallet content
 * script is registered for exactly the origins the user granted and for nothing else — an
 * extension that keeps injecting after a permission is revoked is the failure this guards.
 */

type Listener = () => void;

const state = {
  origins: [] as string[],
  registered: [] as { id: string; matches: string[]; js: string[] }[],
  granted: true,
  calls: { register: 0, update: 0, unregister: 0, request: [] as string[][], remove: [] as string[][] },
};

vi.hoisted(() => {
  // @wxt-dev/browser reads globalThis.chrome at import time, so the fake has to exist first.
  (globalThis as { chrome?: unknown }).chrome = {};
});

beforeEach(() => {
  state.origins = [];
  state.registered = [];
  state.granted = true;
  state.calls = { register: 0, update: 0, unregister: 0, request: [], remove: [] };
  (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
    permissions: {
      getAll: async () => ({ origins: state.origins, permissions: [] }),
      request: async ({ origins }: { origins: string[] }) => {
        state.calls.request.push(origins);
        if (!state.granted) return false;
        state.origins.push(...origins);
        return true;
      },
      remove: async ({ origins }: { origins: string[] }) => {
        state.calls.remove.push(origins);
        state.origins = state.origins.filter((o) => !origins.includes(o));
        return true;
      },
      onAdded: { addListener: (_: Listener) => {} },
      onRemoved: { addListener: (_: Listener) => {} },
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids }: { ids: string[] }) => state.registered.filter((s) => ids.includes(s.id)),
      registerContentScripts: async (scripts: typeof state.registered) => {
        state.calls.register++;
        state.registered.push(...scripts);
      },
      updateContentScripts: async (scripts: typeof state.registered) => {
        state.calls.update++;
        state.registered = scripts;
      },
      unregisterContentScripts: async ({ ids }: { ids: string[] }) => {
        state.calls.unregister++;
        state.registered = state.registered.filter((s) => !ids.includes(s.id));
      },
    },
  };
});

const load = () => import("../lib/permissions");

describe("syncWalletScripts", () => {
  it("registers nothing while no site has been granted", async () => {
    const { syncWalletScripts } = await load();
    await syncWalletScripts();
    expect(state.registered).toEqual([]);
    expect(state.calls.register).toBe(0);
  });

  it("registers the script for exactly the granted origins", async () => {
    const { syncWalletScripts, WALLET_SCRIPT_FILE, WALLET_SCRIPT_ID } = await load();
    state.origins = ["https://pendle.finance/*", "https://x.com/*", "http://127.0.0.1:3000/*"];
    await syncWalletScripts();
    expect(state.registered).toHaveLength(1);
    expect(state.registered[0]).toMatchObject({ id: WALLET_SCRIPT_ID, matches: ["https://pendle.finance/*"], js: [WALLET_SCRIPT_FILE] });
  });

  it("updates rather than re-registers once it exists", async () => {
    const { syncWalletScripts } = await load();
    state.origins = ["https://pendle.finance/*"];
    await syncWalletScripts();
    state.origins.push("https://debank.com/*");
    await syncWalletScripts();
    expect(state.calls.register).toBe(1);
    expect(state.calls.update).toBe(1);
    expect(state.registered[0]!.matches).toEqual(["https://debank.com", "https://pendle.finance"].map((o) => `${o}/*`));
  });

  it("stops injecting the moment the last grant is revoked", async () => {
    const { syncWalletScripts, removeSite } = await load();
    state.origins = ["https://pendle.finance/*"];
    await syncWalletScripts();
    expect(state.registered).toHaveLength(1);

    expect(await removeSite("https://pendle.finance")).toBe(true);
    expect(state.calls.remove).toEqual([["https://pendle.finance/*"]]);
    expect(state.registered).toEqual([]);
    expect(state.calls.unregister).toBe(1);
  });
});

describe("requestSite", () => {
  it("asks for one origin and registers it once the user says yes", async () => {
    const { requestSite, listEnabledSites } = await load();
    expect(await requestSite("https://pendle.finance")).toBe(true);
    expect(state.calls.request).toEqual([["https://pendle.finance/*"]]);
    expect(await listEnabledSites()).toEqual(["https://pendle.finance"]);
    expect(state.registered).toHaveLength(1);
  });

  it("registers nothing when the user says no", async () => {
    const { requestSite } = await load();
    state.granted = false;
    expect(await requestSite("https://pendle.finance")).toBe(false);
    expect(state.registered).toEqual([]);
    expect(state.calls.register).toBe(0);
  });
});
