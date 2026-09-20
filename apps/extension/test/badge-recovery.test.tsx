// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { authorBadges, health } from "../lib/api";
import { mountReact } from "../lib/ui/mount";
import { createBadgeController } from "../lib/x/author-badges";
import { createMountTracker } from "../lib/x/mounts";

vi.mock("../lib/api", () => ({ authorBadges: vi.fn(), health: vi.fn(), linkWallet: vi.fn(), unlinkWallet: vi.fn() }));
vi.mock("../lib/card-size", () => ({ cardSize: () => "compact", setCardSize: vi.fn() }));
vi.mock("../lib/ui/mount", () => ({ mountReact: vi.fn() }));

const offline = { ok: false as const, status: 0, error: "Backend unavailable" };
const found = {
  ok: true as const,
  data: {
    handle: "VitalikButerin", errors: [],
    nansen: {
      entity: "Vitalik Buterin", tags: ["Public Figure"], matchedBy: "displayName" as const,
      totalHoldingsUsd: 100, topHoldings: [], realizedPnlUsd: 20, winRate: 0.5, pnlWindowDays: 90, errors: [],
    },
  },
};

function setup() {
  let tick = () => {};
  let invalidate = () => {};
  const ctx = {
    isInvalid: false,
    setInterval: (callback: () => void) => { tick = callback; },
    onInvalidated: (callback: () => void) => { invalidate = callback; },
  };
  const owner = document.createElement("article");
  const anchor = document.createElement("a");
  owner.append(anchor);
  document.body.append(owner);
  const mounts = createMountTracker();
  const controller = createBadgeController({ ctx: ctx as unknown as ContentScriptContext, mounts, stopHostClicks: vi.fn(), zIndex: 100 });
  return {
    owner, mounts, invalidate,
    attach: () => controller.attachAt(owner, { handle: "VitalikButerin", displayName: "vitalik.eth" }, anchor),
    tick: async () => {
      tick();
      // The interval callback deliberately returns void; drain its promise/queue chain.
      for (let i = 0; i < 30; i++) await Promise.resolve();
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
  vi.mocked(authorBadges).mockResolvedValueOnce(offline).mockResolvedValue(found);
  vi.mocked(health).mockResolvedValue({ ok: true, data: {} } as Awaited<ReturnType<typeof health>>);
  vi.mocked(mountReact).mockImplementation(async () => ({
    update: vi.fn(),
    ui: { shadowHost: document.createElement("span"), shadow: document.createElement("div"), remove: vi.fn() },
  } as unknown as Awaited<ReturnType<typeof mountReact>>));
});

describe("author badge backend recovery", () => {
  it("retries an offline author when health recovers and mounts only once", async () => {
    const page = setup();
    await page.attach();
    expect(mountReact).not.toHaveBeenCalled();
    vi.mocked(health).mockResolvedValueOnce(offline);
    await page.tick();
    expect(authorBadges).toHaveBeenCalledTimes(1);
    await page.tick();
    expect(authorBadges).toHaveBeenCalledTimes(2);
    expect(mountReact).toHaveBeenCalledTimes(1);
    expect(page.mounts.size).toBe(1);
    await page.tick();
    expect(health).toHaveBeenCalledTimes(2);
    expect(authorBadges).toHaveBeenCalledTimes(2);
    expect(mountReact).toHaveBeenCalledTimes(1);
  });

  it("clears pending recovery callbacks when the context invalidates", async () => {
    const page = setup();
    await page.attach();
    page.invalidate();
    await page.tick();
    expect(health).not.toHaveBeenCalled();
    expect(authorBadges).toHaveBeenCalledTimes(1);
    expect(mountReact).not.toHaveBeenCalled();
  });

  it("drops a detached author's retry without fetching or mounting its badge", async () => {
    const page = setup();
    await page.attach();
    page.owner.remove();
    await page.tick();
    await page.tick();
    expect(health).toHaveBeenCalledTimes(1);
    expect(authorBadges).toHaveBeenCalledTimes(1);
    expect(mountReact).not.toHaveBeenCalled();
  });
});
