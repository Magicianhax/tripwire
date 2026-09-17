import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { buildPredictionIntel, resolveMarket } from "@/lib/intel/prediction";

type Gamma = { id: string; slug: string; question: string; outcomes?: string; closed?: boolean; volumeNum?: number };

const yesNo = (id: string, extra: Partial<Gamma> = {}): Gamma => ({ id, slug: `m-${id}`, question: `Q${id}?`, outcomes: '["Yes", "No"]', ...extra });

/** Gamma + Nansen stub: `markets` answers /markets?slug=, `events` answers /events?slug=. No network. */
function stub({ markets = [] as Gamma[], events = null as Gamma[] | null, status = 200 } = {}) {
  const fn = vi.fn(async (url: string) => {
    if (url.includes("gamma-api.polymarket.com/markets")) return Response.json(markets, { status });
    if (url.includes("gamma-api.polymarket.com/events")) return Response.json(events ? [{ markets: events }] : [], { status });
    return Response.json({ data: [] }, { headers: { "x-nansen-credits-used": "0" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const gammaCalls = (fn: ReturnType<typeof stub>) => fn.mock.calls.filter(([u]) => String(u).includes("gamma-api")).length;

beforeEach(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-pm-")), "t.db");
  process.env.NANSEN_API_KEY = "test-key";
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
  _resetClientState();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetDb();
});

describe("Polymarket market resolution", () => {
  it("a market slug resolves to that market", async () => {
    stub({ markets: [yesNo("1")] });
    expect(await resolveMarket("m-1")).toMatchObject({ market: { id: "1" }, problem: null });
  });

  it("an event with exactly one open market resolves to it", async () => {
    stub({ events: [yesNo("1"), yesNo("2", { closed: true })] });
    expect(await resolveMarket("an-event")).toMatchObject({ market: { id: "1" }, problem: null });
  });

  it("an event with several open markets is ambiguous: no market, 'Pick a market'", async () => {
    stub({ events: [yesNo("1", { volumeNum: 9 }), yesNo("2", { volumeNum: 1 })] });
    expect(await resolveMarket("an-event")).toEqual({ market: null, problem: "Pick a market" });
  });

  it("a market whose outcomes aren't exactly Yes/No is not checked", async () => {
    stub({ markets: [yesNo("1", { outcomes: '["Up", "Down"]' })] });
    expect(await resolveMarket("m-1")).toEqual({ market: null, problem: "Not a Yes/No market" });
  });

  it("buildPredictionIntel returns UNCHECKED data with the reason as headline, and spends no Nansen calls", async () => {
    const fn = stub({ events: [yesNo("1"), yesNo("2")] });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "an-event", outcome: "yes" }, "chip");
    expect(r.signals.find((s) => s.id === "smart_side_disagrees")?.value).toBeNull();
    expect(r.headline).toBe("Pick a market");
    expect(r.panel.market).toBeNull();
    expect(fn.mock.calls.some(([u]) => String(u).includes("api.nansen.ai"))).toBe(false);
  });

  it("no outcome picked -> 'Pick Yes or No' headline", async () => {
    stub({ markets: [yesNo("1")] });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "m-1" }, "chip");
    expect(r.headline).toBe("Pick Yes or No");
  });
});

describe("Gamma lookup caching (D6)", () => {
  it("a non-OK response is not cached (and surfaces as a lookup error)", async () => {
    const fn = stub({ status: 503 });
    await expect(resolveMarket("m-x")).rejects.toThrow(/503/);
    await expect(resolveMarket("m-x")).rejects.toThrow(/503/);
    expect(gammaCalls(fn)).toBe(2 * 1); // markets endpoint fails first, each time
  });

  it("a real empty 200 result is cached for 5 minutes only", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    try {
      const fn = stub({ markets: [], events: [] });
      vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
      expect(await resolveMarket("nothing")).toEqual({ market: null, problem: "Market not found" });
      expect(await resolveMarket("nothing")).toEqual({ market: null, problem: "Market not found" });
      expect(gammaCalls(fn)).toBe(2); // markets + events once
      vi.setSystemTime(new Date("2026-09-17T12:05:01Z"));
      await resolveMarket("nothing");
      expect(gammaCalls(fn)).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
