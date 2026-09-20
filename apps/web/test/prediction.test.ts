import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEPTH_SECTION_CREDITS, depthCostLabel } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { buildPredictionIntel, HOLDER_RECORD_CAP, marketState, resolveMarket, toMarket } from "@/lib/intel/prediction";
import { BOOK_LEVELS, predictionBookSection } from "@/lib/intel/depth";
import { clobBook, createClobBookReader } from "@/lib/polymarket/clob";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");

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
  clobBook.reset();
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
    expect(await resolveMarket("an-event")).toMatchObject({ market: null, problem: "Pick a market" });
  });

  // Round 2.2 widened this: a market's outcomes are whatever it says they are, and only a market
  // that sent no usable set at all is refused. The outcome-set rules live in
  // apps/web/test/prediction-round-2-2.test.ts.
  it("a market whose outcomes aren't Yes/No resolves, and one with no outcome set does not", async () => {
    stub({ markets: [yesNo("1", { outcomes: '["Up", "Down"]' })] });
    expect(await resolveMarket("m-1")).toMatchObject({ market: { id: "1" }, problem: null });
    resetDb();
    stub({ markets: [yesNo("2", { outcomes: undefined })] });
    expect(await resolveMarket("m-2")).toMatchObject({ market: null, problem: "Market outcomes unavailable" });
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
      expect(await resolveMarket("nothing")).toMatchObject({ market: null, problem: "Market not found" });
      expect(await resolveMarket("nothing")).toMatchObject({ market: null, problem: "Market not found" });
      expect(gammaCalls(fn)).toBe(2); // markets + events once
      vi.setSystemTime(new Date("2026-09-17T12:05:01Z"));
      await resolveMarket("nothing");
      expect(gammaCalls(fn)).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- Round 1.2: the prediction card gets a price, a state and an honest PnL column ------------

/** The full Gamma object, as scripts/record-prediction-fixtures.mjs recorded it. */
const RECORDED = JSON.parse(fs.readFileSync(path.join(FIXTURES, "gammaMarket.json"), "utf8")) as Record<string, unknown>;
type RecordedBook = { bids: { price: string; size: string }[]; asks: { price: string; size: string }[]; timestamp?: string };
const RECORDED_BOOKS = JSON.parse(fs.readFileSync(path.join(FIXTURES, "clobBook.json"), "utf8")) as Record<string, RecordedBook>;

/**
 * Gamma + CLOB + Nansen, all stubbed. `nansen` maps a path fragment to its response; anything
 * unlisted answers an empty page, and every outbound call is recorded so a test can assert how
 * many a card is allowed to make.
 */
function stubAll({
  market = RECORDED as Record<string, unknown> | null,
  nansen = {} as Record<string, unknown>,
  books = RECORDED_BOOKS as Record<string, unknown>,
  bookStatus = 200,
} = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("gamma-api.polymarket.com/markets")) return Response.json(market ? [market] : []);
    if (u.includes("gamma-api.polymarket.com/events")) return Response.json([]);
    if (u.includes("clob.polymarket.com/book")) {
      calls.push(u);
      const id = new URL(u).searchParams.get("token_id")!;
      if (bookStatus !== 200) return new Response("no", { status: bookStatus });
      return Response.json(books[id] ?? { bids: [], asks: [] });
    }
    if (u.includes("api.nansen.ai")) {
      calls.push(u);
      const match = Object.keys(nansen).find((k) => u.includes(k));
      return Response.json(match ? nansen[match] : { data: [] }, { headers: { "x-nansen-credits-used": "1" } });
    }
    return Response.json({ data: [] });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const hits = (calls: string[], fragment: string) => calls.filter((u) => u.includes(fragment)).length;

/** 20 holders, largest first, like the real top-holders page. */
const twentyHolders = {
  data: Array.from({ length: 20 }, (_, i) => ({
    market_id: "4527564",
    outcome_index: i % 2 === 0 ? 1 : 2,
    address: `0x${String(i).padStart(40, "a")}`,
    owner_address: "0x",
    side: i % 2 === 0 ? "Yes" : "No",
    position_size: 1_000 - i * 10,
    avg_entry_price: 0.5,
    current_price: 0.6,
    unrealized_pnl_usd: i === 0 ? -744.523228831668 : 10,
  })),
};

const SUMMARY = { data: [{ realized_pnl_usd: 1_000, win_rate: 0.5, markets_won: 5, markets_traded: 10, wallet_age_days: 30 }] };

describe("1.2.1 / 1.2.2 — the Gamma market survives the panel DTO", () => {
  it("every field the card can say something true with reaches the panel", async () => {
    stubAll();
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-80k-on-september-20-2026" }, "chip");
    const m = r.panel.market!;
    expect(m.id).toBe("4527564");
    expect(m.bestBid).toBe(RECORDED.bestBid);
    expect(m.bestAsk).toBe(RECORDED.bestAsk);
    expect(m.spread).toBe(RECORDED.spread);
    expect(m.lastTradePrice).toBe(RECORDED.lastTradePrice);
    expect(m.oneDayPriceChange).toBe(RECORDED.oneDayPriceChange);
    expect(m.liquidityUsd).toBe(RECORDED.liquidityNum);
    expect(m.volumeUsd).toBe(RECORDED.volumeNum);
    expect(m.volume24hUsd).toBe(RECORDED.volume24hr);
    expect(m.volume1wkUsd).toBe(RECORDED.volume1wk);
    expect(m.endDateIso).toBe(RECORDED.endDateIso);
    expect(m.startDateIso).toBe(RECORDED.startDateIso);
    expect(m.negRisk).toBe(RECORDED.negRisk);
    expect(m.clobTokenIds).toEqual(JSON.parse(String(RECORDED.clobTokenIds)));
    expect(m.description).toContain("Binance");
    expect(m.groupItemTitle).toBe(RECORDED.groupItemTitle);
    expect(m.eventSlug).toBe("bitcoin-above-on-september-20-2026");
    expect(m.active).toBe(true);
    expect(m.closed).toBe(false);
    expect(m.acceptingOrders).toBe(true);
    expect(m.state).toBe("live");
    expect(m.pricedAtIso).toMatch(/^\d{4}-/);
  });

  it("a field Gamma omits is null and does not blank the card", () => {
    // The recorded market carries oneDayPriceChange and no oneWeekPriceChange at all.
    expect("oneWeekPriceChange" in RECORDED).toBe(false);
    const m = toMarket(RECORDED as never, null);
    expect(m.oneWeekPriceChange).toBeNull();
    expect(m.question).toBe(RECORDED.question);
    expect(m.yesPrice).not.toBeNull();
  });

  it("the headline price is the book's mid, never the cached outcomePrices snapshot", () => {
    const m = toMarket(RECORDED as never, "2026-09-20T12:00:00.000Z");
    expect(m.yesPriceSource).toBe("book");
    expect(m.yesPrice).toBeCloseTo(((RECORDED.bestBid as number) + (RECORDED.bestAsk as number)) / 2, 12);
    expect(m.pricedAtIso).toBe("2026-09-20T12:00:00.000Z");

    // Polymarket derives outcomePrices from the same mid, so on a healthy market the two agree.
    // What must never happen is reading the snapshot *instead*: give the market a stale snapshot
    // and the card still prices it off the book.
    const stale = toMarket({ ...RECORDED, outcomePrices: '["0.10", "0.90"]' } as never, null);
    expect(stale.yesPriceSource).toBe("book");
    expect(stale.yesPrice).toBeCloseTo(((RECORDED.bestBid as number) + (RECORDED.bestAsk as number)) / 2, 12);

    const noBook = toMarket({ ...RECORDED, bestBid: undefined, bestAsk: undefined } as never, null);
    expect(noBook.yesPriceSource).toBe("last-trade");
    const nothing = toMarket({ ...RECORDED, bestBid: undefined, bestAsk: undefined, lastTradePrice: undefined } as never, null);
    expect(nothing.yesPriceSource).toBe("cached");
    const silent = toMarket({ id: "1", slug: "s", question: "q?" } as never, null);
    expect(silent.yesPrice).toBeNull();
    expect(silent.yesPriceSource).toBeNull();
  });

  it("the resolution date reaches the card", () => {
    const m = toMarket(RECORDED as never, null);
    expect(m.endDate).toBe(RECORDED.endDate);
    expect(m.endDateIso).toBe("2026-09-20");
  });
});

describe("1.2.3 — market state", () => {
  it("a settled market reached by its own slug reads resolved, keeps its evidence and stays UNCHECKED", async () => {
    const trades = { data: [{ timestamp: "2026-09-20T10:00:00Z", taker_action: "Buy", side: "Yes", size: 1, price: 0.5, usdc_value: 0.5 }] };
    const { calls } = stubAll({
      market: { ...RECORDED, closed: true, acceptingOrders: false },
      nansen: { "top-holders": twentyHolders, "trades-by-market": trades },
    });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "settled", outcome: "yes" }, "panel");
    expect(r.panel.market?.state).toBe("resolved");
    expect(r.panel.historical).toBe(true);
    expect(r.panel.holders?.length).toBe(20);
    expect(r.panel.trades?.length).toBe(1);
    // UNCHECKED: the signal has no value, so rules/evaluate can never produce CLEAR here.
    expect(r.signals.find((s) => s.id === "smart_side_disagrees")?.value).toBeNull();
    expect(r.headline).toBe("Market already resolved");
    // And it never buys records for a comparison that cannot exist.
    expect(hits(calls, "address-summary")).toBe(0);
  });

  it("a settled market costs a chip nothing at all", async () => {
    const { calls } = stubAll({ market: { ...RECORDED, closed: true } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "settled", outcome: "yes" }, "chip");
    expect(r.panel.market?.state).toBe("resolved");
    expect(r.panel.historical).toBe(true);
    expect(hits(calls, "api.nansen.ai")).toBe(0);
  });

  it("acceptingOrders:false with closed:false is paused, not resolved", () => {
    expect(marketState({ active: true, closed: false, acceptingOrders: false })).toBe("paused");
    expect(marketState({ active: false, closed: false, acceptingOrders: true })).toBe("paused");
    expect(marketState({ active: true, closed: true, acceptingOrders: true })).toBe("resolved");
    expect(marketState({ active: true, closed: false, acceptingOrders: true })).toBe("live");
    expect(marketState({})).toBeNull();
  });

  it("an empty umaResolutionStatuses means no resolution information, not 'unresolved'", () => {
    expect(RECORDED.umaResolutionStatuses).toBe("[]");
    expect(toMarket(RECORDED as never, null).umaResolutionStatuses).toEqual([]);
    expect(toMarket({ ...RECORDED, umaResolutionStatuses: undefined } as never, null).umaResolutionStatuses).toBeNull();
  });
});

describe("1.2.5 / 1.2.8 — the record, and what it is allowed to cost", () => {
  it("a 20-holder response issues at most 10 address calls, and never pnl-by-address", async () => {
    const { calls } = stubAll({ nansen: { "top-holders": twentyHolders, "address-summary": SUMMARY } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-80k-on-september-20-2026", outcome: "yes" }, "panel");
    expect(hits(calls, "address-summary")).toBe(HOLDER_RECORD_CAP);
    expect(hits(calls, "pnl-by-address")).toBe(0);
    expect(r.panel.recordsChecked).toBe(HOLDER_RECORD_CAP);
    expect(r.panel.recordsCap).toBe(HOLDER_RECORD_CAP);
    // The ten it bought are the ten largest, because top-holders is ordered by position_size.
    expect(r.panel.holders!.filter((h) => h.record !== null).map((h) => h.address)).toEqual(twentyHolders.data.slice(0, 10).map((h) => h.address));
    expect(r.panel.holders![19]!.record).toBeNull();
  });

  it("the signal's evidence states what was bought, never a longer record than that", async () => {
    stubAll({ nansen: { "top-holders": twentyHolders, "address-summary": SUMMARY } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-80k-on-september-20-2026", outcome: "yes" }, "panel");
    const evidence = r.signals.find((s) => s.id === "smart_side_disagrees")!.evidence;
    const line = evidence.find((e) => e.endpoint === "prediction-market/address-summary")!;
    expect(line.field).toBe("realized_pnl_usd > 0");
    expect(String(line.value)).toMatch(/^\d+ proven of \d+ checked$/);
  });

  it("holders with no record carry no weight, and the card still renders them", async () => {
    stubAll({ nansen: { "top-holders": twentyHolders } }); // address-summary answers { data: [] }
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-80k-on-september-20-2026", outcome: "yes" }, "panel");
    expect(r.panel.holders?.length).toBe(20);
    expect(r.panel.holders!.every((h) => h.record === null)).toBe(true);
    expect(r.signals.find((s) => s.id === "smart_side_disagrees")?.value).toBeNull();
  });

  it("side totals and concentration ride along with the holders", async () => {
    stubAll({ nansen: { "top-holders": twentyHolders } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-80k-on-september-20-2026", outcome: "yes" }, "panel");
    expect(r.panel.sides!.sample).toBe(20);
    expect(r.panel.sides!.yesUsd).toBeGreaterThan(0);
    expect(r.panel.sides!.noUsd).toBeGreaterThan(0);
    expect(r.panel.sides!.top10SharePct).toBeGreaterThan(50);
  });
});

describe("1.2.7 — both sides of the book, for free", () => {
  it("reads one CLOB book per outcome token and produces a real spread", async () => {
    const { calls } = stubAll();
    const s = await predictionBookSection("bitcoin-above-80k-on-september-20-2026");
    expect(s.errors).toEqual([]);
    expect(s.books!.map((b) => b.outcome)).toEqual(["Yes", "No"]);
    expect(hits(calls, "clob.polymarket.com")).toBe(2);
    expect(hits(calls, "api.nansen.ai")).toBe(0);
    for (const b of s.books!) {
      expect(b.bids.length).toBeGreaterThan(0);
      expect(b.asks.length).toBeGreaterThan(0);
      expect(b.bids.length).toBeLessThanOrEqual(BOOK_LEVELS);
      expect(b.asks.length).toBeLessThanOrEqual(BOOK_LEVELS);
      for (let i = 1; i < b.bids.length; i++) expect(b.bids[i]!.price).toBeLessThanOrEqual(b.bids[i - 1]!.price);
      for (let i = 1; i < b.asks.length; i++) expect(b.asks[i]!.price).toBeGreaterThanOrEqual(b.asks[i - 1]!.price);
      // cumulative is depth from the touch outward, so it only ever grows.
      for (let i = 1; i < b.bids.length; i++) expect(b.bids[i]!.cumulative).toBeGreaterThan(b.bids[i - 1]!.cumulative);
      expect(b.spread).toBeCloseTo(b.bestAsk! - b.bestBid!, 12);
      expect(b.spread).toBeGreaterThan(0);
    }
    expect(s.snapshotIso).toMatch(/^\d{4}-/);
  });

  it("the section costs nothing, and the tab says so", () => {
    expect(DEPTH_SECTION_CREDITS.predictionBook).toBe(0);
    expect(depthCostLabel(["predictionBook"])).toBe("free");
  });

  it("an outcome with no book drops out and the other still renders", async () => {
    const ids = Object.keys(RECORDED_BOOKS);
    stubAll({ books: { [ids[0]!]: RECORDED_BOOKS[ids[0]!]! } });
    const s = await predictionBookSection("one-side-down");
    expect(s.books!.length).toBe(1);
    expect(s.books![0]!.outcome).toBe("Yes");
  });

  it("a market with no order-book tokens says so rather than failing the tab", async () => {
    stubAll({ market: { ...RECORDED, clobTokenIds: undefined } });
    const s = await predictionBookSection("no-tokens");
    expect(s.books).toBeNull();
    expect(s.errors[0]).toMatch(/order-book tokens/);
  });

  it("only a decimal CLOB token id ever reaches the URL", async () => {
    const read = createClobBookReader(vi.fn());
    await expect(read("../../etc")).rejects.toThrow(/CLOB token id/);
    await expect(read("0xdeadbeef")).rejects.toThrow(/CLOB token id/);
  });
});
