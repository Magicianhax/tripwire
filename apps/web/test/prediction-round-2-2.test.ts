/**
 * Round 2.2 — multi-market events and multi-outcome markets.
 *
 * Two measurements drive this file, both taken live on 2026-09-20 against Polymarket's public
 * Gamma API (0 Nansen credits):
 *
 *   - **44 of the 100 highest-24h-volume open markets are not Yes/No.** All 44 were blanked by
 *     the old `isYesNoMarket` gate.
 *   - **`/events?slug=nfl-no-bal-2026-09-20` returns 329 open markets.** The event picker has to
 *     be bounded and ordered, or it is a wall rather than a picker.
 *
 * The recorded fixtures are `gammaMarketOutcomes.json` (market 4384973, "Spread: BAL (-8.5)",
 * outcomes `["BAL", "NO"]` — NO is New Orleans) and `gammaEvent.json` (the recorded Bitcoin
 * strike ladder, 11 open markets).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionTargetSchema } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { buildPredictionIntel, MARKET_OPTIONS_CAP, resolveMarket, siblingOptions, toMarket, toOption } from "@/lib/intel/prediction";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as T;

type Gamma = Record<string, unknown> & { id: string; slug: string; question: string; outcomes?: string };
const OUTCOMES_MARKET = read<Gamma>("gammaMarketOutcomes");
const EVENT = read<{ title?: string; markets?: Gamma[] }[]>("gammaEvent");
const EVENT_MARKETS = EVENT[0]!.markets!;
const BITCOIN = read<Gamma>("gammaMarket");

const market = (id: string, over: Partial<Gamma> = {}): Gamma => ({
  id,
  slug: `m-${id}`,
  question: `Q${id}?`,
  outcomes: '["Yes", "No"]',
  events: [{ slug: "an-event", title: "An event" }],
  ...over,
});

/**
 * Gamma + Nansen. `markets` answers `/markets?slug=`, `events` answers `/events?slug=` (keyed by
 * slug so the sibling lookup and the resolver can be told apart), and every call is recorded.
 */
function stub({ markets = [] as Gamma[], events = {} as Record<string, Gamma[]>, nansen = {} as Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("gamma-api.polymarket.com/markets")) return Response.json(markets);
    if (u.includes("gamma-api.polymarket.com/events")) {
      const slug = new URL(u).searchParams.get("slug") ?? "";
      const found = events[slug];
      return Response.json(found ? [{ markets: found }] : []);
    }
    if (u.includes("api.nansen.ai")) {
      const match = Object.keys(nansen).find((k) => u.includes(k));
      return Response.json(match ? nansen[match] : { data: [] }, { headers: { "x-nansen-credits-used": "1" } });
    }
    return Response.json({ data: [] });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const countOf = (calls: string[], fragment: string) => calls.filter((u) => u.includes(fragment)).length;

/** Top holders on the recorded ["BAL", "NO"] market: BAL money is small, New Orleans money is big. */
const balNoHolders = {
  data: [
    { market_id: "4384973", address: "0xaaa", owner_address: "0x", side: "BAL", position_size: 100, avg_entry_price: 0.5, current_price: 0.5, unrealized_pnl_usd: 1 },
    { market_id: "4384973", address: "0xbbb", owner_address: "0x", side: "NO", position_size: 300, avg_entry_price: 0.5, current_price: 0.5, unrealized_pnl_usd: 2 },
  ],
};
const SUMMARY = { data: [{ realized_pnl_usd: 1_000, win_rate: 0.5, markets_won: 5, markets_traded: 10, wallet_age_days: 30 }] };

beforeEach(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-pm22-")), "t.db");
  process.env.NANSEN_API_KEY = "test-key";
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
  _resetClientState();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetDb();
});

describe("the live measurements this round exists for", () => {
  it("the recorded non-Yes/No market is the New Orleans case", () => {
    expect(JSON.parse(String(OUTCOMES_MARKET.outcomes))).toEqual(["BAL", "NO"]);
    expect(OUTCOMES_MARKET.id).toBe("4384973");
  });

  it("the recorded event is a real strike ladder, not a pair", () => {
    expect(EVENT_MARKETS.length).toBeGreaterThan(2);
    expect(EVENT_MARKETS.filter((m) => !m.closed).length).toBe(EVENT_MARKETS.length);
    // Every rung is its own Yes/No market with its own label inside the event.
    expect(EVENT_MARKETS.every((m) => typeof m.groupItemTitle === "string")).toBe(true);
  });
});

describe("2.2 — a non-Yes/No market resolves and is checked", () => {
  it("resolves, carries its outcome set, and prices outcome 0", async () => {
    stub({ markets: [OUTCOMES_MARKET] });
    const r = await resolveMarket(String(OUTCOMES_MARKET.slug));
    expect(r.problem).toBeNull();
    const m = toMarket(r.market!, null);
    expect(m.outcomes).toEqual(["BAL", "NO"]);
    expect(m.outcomePrices).toEqual((JSON.parse(String(OUTCOMES_MARKET.outcomePrices)) as string[]).map(Number));
    // `yesPrice` is outcome 0's price. On this market that is BAL, which is why the card labels
    // it from `outcomes[0]` and never with the word "Yes".
    expect(m.yesPrice).not.toBeNull();
  });

  it("an outcome read from the page as 'NO' means New Orleans, and the signal is computed", async () => {
    stub({ markets: [OUTCOMES_MARKET], nansen: { "top-holders": balNoHolders, "address-summary": SUMMARY } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: String(OUTCOMES_MARKET.slug), outcomeLabel: "NO" }, "panel");
    expect(r.panel.outcomeIndex).toBe(1);
    expect(r.panel.targetOutcome).toBe("NO");
    expect(r.headline).toBeNull();
    // 100 of 400 proven-winner dollars sit on BAL, so a quarter of the money disagrees.
    const s = r.signals.find((x) => x.id === "smart_side_disagrees")!;
    expect(s.value).toBeCloseTo(25, 6);
    expect(s.label).toBe("25% of proven-winner money is on BAL");
  });

  it("the sampled money is reported per outcome, and the Yes/No fields stay null", async () => {
    stub({ markets: [OUTCOMES_MARKET], nansen: { "top-holders": balNoHolders } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: String(OUTCOMES_MARKET.slug), outcomeLabel: "BAL" }, "panel");
    expect(r.panel.sides!.byOutcome).toEqual([50, 150]);
    expect(r.panel.sides!.yesUsd).toBeNull();
    expect(r.panel.sides!.noUsd).toBeNull();
  });

  it("the legacy yes/no flag alone does not pick an outcome on a market that is not Yes/No", async () => {
    const { calls } = stub({ markets: [OUTCOMES_MARKET], nansen: { "top-holders": balNoHolders } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: String(OUTCOMES_MARKET.slug), outcome: "no" }, "chip");
    expect(r.panel.outcomeIndex).toBeNull();
    expect(r.headline).toBe("Pick BAL or NO");
    // And UNCHECKED costs nothing, exactly as it did for a Yes/No market with no pick.
    expect(countOf(calls, "api.nansen.ai")).toBe(0);
  });

  it("an outcome the market does not list is UNCHECKED and says which one was offered", async () => {
    stub({ markets: [OUTCOMES_MARKET] });
    const r = await buildPredictionIntel({ kind: "prediction", slug: String(OUTCOMES_MARKET.slug), outcomeLabel: "Yes" }, "chip");
    expect(r.panel.outcomeIndex).toBeNull();
    expect(r.panel.unknownOutcome).toBe("Yes");
    expect(r.headline).toBe("Outcome not on this market");
    expect(r.signals.find((x) => x.id === "smart_side_disagrees")?.value).toBeNull();
  });

  it("a Yes/No market still resolves through the legacy flag, unchanged", async () => {
    stub({ markets: [market("1")] });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "m-1", outcome: "no" }, "chip");
    expect(r.panel.outcomeIndex).toBe(1);
    expect(r.panel.targetOutcome).toBe("No");
  });

  it("the target schema accepts a page label and refuses prose or control characters", () => {
    const base = { kind: "prediction" as const, slug: "m-1" };
    expect(PredictionTargetSchema.parse({ ...base, outcomeLabel: "LGD Gaming" }).outcomeLabel).toBe("LGD Gaming");
    expect(PredictionTargetSchema.parse({ ...base, outcomeLabel: "  BAL  " }).outcomeLabel).toBe("BAL");
    expect(PredictionTargetSchema.safeParse({ ...base, outcomeLabel: "x".repeat(81) }).success).toBe(false);
    expect(PredictionTargetSchema.safeParse({ ...base, outcomeLabel: `a${String.fromCharCode(10)}b` }).success).toBe(false);
    expect(PredictionTargetSchema.safeParse({ ...base, outcomeLabel: "" }).success).toBe(false);
  });
});

describe("2.2 — the event picker, at 0 credits", () => {
  it("an ambiguous event answers with its markets attached, ordered by 24h volume", async () => {
    const { calls } = stub({ events: { "an-event": [market("1", { volume24hr: 10 }), market("2", { volume24hr: 900 }), market("3", { volume24hr: 100 })] } });
    const r = await resolveMarket("an-event");
    expect(r.problem).toBe("Pick a market");
    expect(r.market).toBeNull();
    expect(r.options!.map((o) => o.id)).toEqual(["2", "3", "1"]);
    expect(r.optionsTotal).toBe(3);
    // No second call: the list is what the ambiguity lookup already returned.
    expect(countOf(calls, "gamma-api")).toBe(2);
    expect(countOf(calls, "api.nansen.ai")).toBe(0);
  });

  it("a market Gamma sent no 24h volume for sorts last rather than as zero", async () => {
    stub({ events: { "an-event": [market("1"), market("2", { volume24hr: 5 })] } });
    const r = await resolveMarket("an-event");
    expect(r.options!.map((o) => o.id)).toEqual(["2", "1"]);
    expect(r.options![1]!.volume24hUsd).toBeNull();
  });

  it("a 329-market event is capped, and the card is told the total it is a slice of", async () => {
    const many = Array.from({ length: 329 }, (_, i) => market(String(i), { volume24hr: i }));
    stub({ events: { "an-event": many } });
    const r = await resolveMarket("an-event");
    expect(r.options!.length).toBe(MARKET_OPTIONS_CAP);
    expect(r.optionsTotal).toBe(329);
    expect(r.options![0]!.id).toBe("328");
  });

  it("the picker reaches the panel, the verdict stays UNCHECKED, and nothing is bought for any row", async () => {
    const { calls } = stub({ events: { "an-event": [market("1"), market("2")] } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "an-event", outcomeLabel: "Yes" }, "panel");
    expect(r.headline).toBe("Pick a market");
    expect(r.panel.market).toBeNull();
    expect(r.panel.options!.length).toBe(2);
    expect(r.panel.eventSlug).toBe("an-event");
    expect(r.signals.find((x) => x.id === "smart_side_disagrees")?.value).toBeNull();
    expect(countOf(calls, "api.nansen.ai")).toBe(0);
  });

  it("a row carries only what a list needs, not Gamma's 88 fields", async () => {
    const option = toOption(EVENT_MARKETS[0]!);
    expect(Object.keys(option).sort()).toEqual(
      ["endDate", "groupItemTitle", "id", "liquidityUsd", "outcomePrices", "outcomes", "question", "slug", "state", "volume24hUsd"].sort(),
    );
    expect(Object.keys(EVENT_MARKETS[0]!).length).toBeGreaterThan(50);
    expect(option.outcomePrices!.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe("2.2 — siblings of a market that did resolve", () => {
  it("are fetched once, for free, and exclude the market already on screen", async () => {
    const { calls } = stub({ events: { "an-event": [market("1"), market("2"), market("3")] } });
    const first = await siblingOptions("an-event", "2");
    expect(first!.options.map((o) => o.id)).toEqual(["1", "3"]);
    const again = await siblingOptions("an-event", "2");
    expect(again!.options.length).toBe(2);
    expect(countOf(calls, "gamma-api")).toBe(1);
    expect(countOf(calls, "api.nansen.ai")).toBe(0);
  });

  it("an event of one market has no siblings, and says so as null rather than an empty list", async () => {
    stub({ events: { "an-event": [market("1")] } });
    expect(await siblingOptions("an-event", "1")).toBeNull();
  });

  it("a chip never fetches them; a panel does", async () => {
    const chip = stub({ markets: [market("1", { slug: "m-1" })], events: { "an-event": [market("1"), market("2")] } });
    await buildPredictionIntel({ kind: "prediction", slug: "m-1", outcome: "yes" }, "chip");
    expect(countOf(chip.calls, "gamma-api.polymarket.com/events")).toBe(0);

    resetDb();
    vi.unstubAllGlobals();
    const panel = stub({ markets: [market("1", { slug: "m-1" })], events: { "an-event": [market("1"), market("2")] } });
    const r = await buildPredictionIntel({ kind: "prediction", slug: "m-1", outcome: "yes" }, "panel");
    expect(countOf(panel.calls, "gamma-api.polymarket.com/events")).toBe(1);
    expect(r.panel.options!.map((o) => o.id)).toEqual(["2"]);
  });

  it("a sibling lookup that fails costs the card nothing but the section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("gamma-api.polymarket.com/markets")) return Response.json([market("1", { slug: "m-1" })]);
        if (u.includes("gamma-api.polymarket.com/events")) return new Response("no", { status: 503 });
        return Response.json({ data: [] }, { headers: { "x-nansen-credits-used": "0" } });
      }),
    );
    const r = await buildPredictionIntel({ kind: "prediction", slug: "m-1", outcome: "yes" }, "panel");
    expect(r.panel.market!.id).toBe("1");
    expect(r.panel.options).toBeNull();
    expect(r.headline).toBeNull();
  });

  it("the recorded strike ladder produces the other ten rungs of the recorded market's event", async () => {
    stub({ events: { "bitcoin-above-on-september-20-2026": EVENT_MARKETS } });
    const siblings = await siblingOptions("bitcoin-above-on-september-20-2026", String(BITCOIN.id));
    expect(siblings!.options.length).toBe(EVENT_MARKETS.length - 1);
    expect(siblings!.options.some((o) => o.id === String(BITCOIN.id))).toBe(false);
    // Each rung is named by its strike, which is the only thing that tells them apart.
    expect(siblings!.options.every((o) => typeof o.groupItemTitle === "string" && o.groupItemTitle !== "")).toBe(true);
  });
});
