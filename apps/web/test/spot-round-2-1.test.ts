/**
 * Round 1.6 and Round 2.1 — the spot card's market structure, and its sense of sequence and time.
 *
 * Everything runs in replay against the responses recorded by
 * `scripts/record-spot-depth-fixtures.mjs`, so no test here reaches Nansen, reaches Dexscreener
 * or spends a credit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEPTH_SECTION_CREDITS, depthCostLabel, tapeDivider } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const DEX_FIXTURE = path.resolve(__dirname, "..", "..", "..", "fixtures", "dexscreener", "token.json");

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-spot21-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

const { spotDcaSection, spotHoldersSection, spotMarketSection, spotTapeSection, spotTransfersSection, spotWinnersSection } = await import("@/lib/intel/depth");
const { createTokenMarketResolver, parseTokenMarket } = await import("@/lib/dexscreener/token");
const { enrichmentPlan, enrichMarkets, MAX_ENRICH_GROUPS } = await import("@/lib/intel/markets");

/** The token every spot fixture describes: dogwifhat on Solana. */
const CHAIN = "solana";
const TOKEN = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const dexBody = () => JSON.parse(fs.readFileSync(DEX_FIXTURE, "utf8")) as unknown;

// --- 1.6.1 Dexscreener market structure --------------------------------------------------------

describe("1.6.1 market structure comes from Dexscreener, labelled as Dexscreener's", () => {
  it("reduces a thirty-pool answer to pair age, short-window change and summed trade counts", () => {
    const s = parseTokenMarket(dexBody(), { chain: CHAIN, tokenAddress: TOKEN })!;
    expect(s.poolCount).toBe(30);
    // The deepest pool is the one every single-pool figure is measured on.
    expect(s.pool!.liquidityUsd).toBeCloseTo(5_763_077, -1);
    expect(s.pool!.dexId).toBeTruthy();
    expect(s.pool!.createdAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Counts are summed across the pools, so they are larger than any single pool's.
    const singleH1 = (dexBody() as { pairs: { txns?: { h1?: { buys?: number } } }[] }).pairs[0]!.txns!.h1!.buys!;
    expect(s.txns.h1.buys!).toBeGreaterThan(singleH1);
    expect(s.priceChangePct.h1).not.toBeNull();
  });

  it("never carries a boost, a social link or a website across the boundary", () => {
    const s = parseTokenMarket(dexBody(), { chain: CHAIN, tokenAddress: TOKEN })!;
    const serialised = JSON.stringify(s);
    // Bought placements and team-submitted links are not evidence; the schema has no field for
    // them, so this asserts the whole reduced object, not one omission.
    for (const forbidden of ["boost", "twitter", "telegram", "social", "website", "imageUrl", "dogwifcoin.org"]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("reports no pools rather than zeroes when the token is not on the chain asked about", () => {
    const s = parseTokenMarket(dexBody(), { chain: "ethereum", tokenAddress: TOKEN })!;
    expect(s.poolCount).toBe(0);
    expect(s.pool).toBeNull();
    // Absent counts are null, never 0 — "no answer" and "no trades" are different claims.
    expect(s.txns.h1.buys).toBeNull();
    expect(s.txns.h1.sells).toBeNull();
    expect(s.priceChangePct.m5).toBeNull();
  });

  // C-1: "unreadable" and "no pools" are two different claims and were one null.
  it("returns null only when the body is not a Dexscreener response at all", () => {
    expect(parseTokenMarket({ error: "rate limited" }, { chain: CHAIN, tokenAddress: TOKEN })).toBeNull();
    expect(parseTokenMarket("<html>502</html>", { chain: CHAIN, tokenAddress: TOKEN })).toBeNull();
    expect(parseTokenMarket({ pairs: 7 }, { chain: CHAIN, tokenAddress: TOKEN })).toBeNull();
    // An answer with no pools is readable, and is a structure, not a null.
    expect(parseTokenMarket({ pairs: [] }, { chain: CHAIN, tokenAddress: TOKEN })).not.toBeNull();
    expect(parseTokenMarket({ pairs: null }, { chain: CHAIN, tokenAddress: TOKEN })!.poolCount).toBe(0);
  });

  it("keeps the readable pools when one entry is malformed, and says how many it dropped", () => {
    const body = dexBody() as { pairs: unknown[] };
    // One pool of thirty loses its chain: `z.array(pairSchema)` used to fail the whole parse and
    // the card printed "lists no pools" for a token trading in twenty-nine of them.
    delete (body.pairs[3] as { chainId?: unknown }).chainId;
    const s = parseTokenMarket(body, { chain: CHAIN, tokenAddress: TOKEN })!;
    expect(s.poolCount).toBe(29);
    expect(s.droppedPoolCount).toBe(1);
    expect(s.pool).not.toBeNull();
  });

  it("does not count a malformed entry that plainly belongs to another chain", () => {
    const body = {
      pairs: [
        { chainId: "solana", baseToken: { address: TOKEN }, liquidity: { usd: 10 } },
        { chainId: "ethereum", baseToken: "not an object" },
        { chainId: "solana", baseToken: 42 },
      ],
    };
    const s = parseTokenMarket(body, { chain: CHAIN, tokenAddress: TOKEN })!;
    expect(s.poolCount).toBe(1);
    expect(s.droppedPoolCount).toBe(1);
  });

  it("excludes pools where the token is the quote side, and counts them instead", () => {
    const body = {
      pairs: [
        { chainId: "solana", baseToken: { address: "OTHER" }, quoteToken: { address: TOKEN }, txns: { h1: { buys: 99, sells: 99 } }, liquidity: { usd: 9e9 } },
        { chainId: "solana", baseToken: { address: TOKEN }, txns: { h1: { buys: 3, sells: 4 } }, liquidity: { usd: 10 } },
      ],
    };
    const s = parseTokenMarket(body, { chain: CHAIN, tokenAddress: TOKEN })!;
    expect(s.poolCount).toBe(1);
    expect(s.quoteSidePoolCount).toBe(1);
    // The huge pool would have won "deepest" and described a different token entirely.
    expect(s.pool!.liquidityUsd).toBe(10);
    expect(s.txns.h1.buys).toBe(3);
  });

  it("is free, and asks the public API once per token per window", async () => {
    // The live path, so replay is stood down for this one test: everywhere else in this file
    // the resolver answers from the recorded body instead of reaching a third party.
    delete process.env.TRIPWIRE_REPLAY;
    let calls = 0;
    const resolve = createTokenMarketResolver(async (url) => {
      calls += 1;
      expect(String(url)).toBe(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`);
      return new Response(JSON.stringify(dexBody()), { status: 200 });
    });
    const [a, b] = await Promise.all([resolve({ chain: CHAIN, tokenAddress: TOKEN }), resolve({ chain: CHAIN, tokenAddress: TOKEN })]);
    await resolve({ chain: CHAIN, tokenAddress: TOKEN });
    expect(calls).toBe(1);
    expect(a!.poolCount).toBe(30);
    expect(b!.poolCount).toBe(30);
    expect(DEPTH_SECTION_CREDITS.spotMarket).toBe(0);
    expect(depthCostLabel(["spotMarket"])).toBe("free");
    process.env.TRIPWIRE_REPLAY = "1";
  });

  it("answers from the recording in replay, so an offline card never paints a fetch failure", async () => {
    const section = await spotMarketSection(CHAIN, TOKEN);
    expect(section.errors).toEqual([]);
    expect(section.structure!.poolCount).toBe(30);
  });
});

// --- 2.1 the labelled trade tape ---------------------------------------------------------------

describe("2.1 the trade tape states the window it actually got", () => {
  it("keeps every labelled trade and holds the rest to the floor", async () => {
    const tape = await spotTapeSection(CHAIN, TOKEN);
    expect(tape.credits).toBe(1);
    expect(tape.fetched).toBe(100);
    expect(tape.trades!.length).toBe(tape.kept);
    for (const t of tape.trades!) {
      const labelled = typeof t.label === "string" && t.label.trim() !== "";
      expect(labelled || (t.valueUsd ?? 0) >= tape.minUsd).toBe(true);
    }
    // The recorded page has labelled rows well under the floor: they are the evidence.
    expect(tape.trades!.some((t) => !!t.label && (t.valueUsd ?? 0) < tape.minUsd)).toBe(true);
  });

  it("reports the span the rows cover, not the day it asked for", async () => {
    const tape = await spotTapeSection(CHAIN, TOKEN);
    const spanMs = Date.parse(tape.spanToIso!) - Date.parse(tape.spanFromIso!);
    // Measured: 100 trades on this liquid token cover about fourteen minutes, not 24 hours.
    expect(spanMs).toBeGreaterThan(0);
    expect(spanMs).toBeLessThan(6 * 3_600_000);
    expect(tape.isLastPage).toBe(false);
  });

  it("puts a trade either side of the post on the correct side of the divider", async () => {
    const tape = await spotTapeSection(CHAIN, TOKEN);
    const rows = tape.trades!;
    const mid = rows[Math.floor(rows.length / 2)]!.timestampIso;
    const divider = tapeDivider(rows, mid);
    expect(divider.kind).toBe("inside");
    if (divider.kind !== "inside") throw new Error("unreachable");
    expect(rows.slice(0, divider.index).every((r) => Date.parse(r.timestampIso) > Date.parse(mid))).toBe(true);
    expect(rows.slice(divider.index).every((r) => Date.parse(r.timestampIso) <= Date.parse(mid))).toBe(true);
  });

  it("draws no divider for a post older than the fetched window", async () => {
    const tape = await spotTapeSection(CHAIN, TOKEN);
    expect(tapeDivider(tape.trades!, "2020-01-01T00:00:00Z")).toEqual({ kind: "older-than-window" });
  });

  it("normalises the side and keeps the transaction, so a row can be checked", async () => {
    const tape = await spotTapeSection(CHAIN, TOKEN);
    expect(new Set(tape.trades!.map((t) => t.action))).toEqual(new Set(["buy", "sell"]));
    expect(tape.trades!.every((t) => typeof t.txHash === "string" && t.txHash!.length > 0)).toBe(true);
  });
});

// --- 2.1 the winners leaderboard ---------------------------------------------------------------

describe("2.1 the winners tab answers whether they have already sold", () => {
  it("prices itself at five credits and says so before it is opened", () => {
    expect(DEPTH_SECTION_CREDITS.spotWinners).toBe(5);
    expect(depthCostLabel(["spotWinners"])).toBe("5 credits");
  });

  it("weights the still-holding share by peak position value", async () => {
    const s = await spotWinnersSection(CHAIN, TOKEN);
    expect(s.winners!.length).toBe(20);
    // Ten of the twenty recorded rows hold their whole peak and realised nothing at all, so an
    // unweighted mean would read about 68%. Weighted by peak value it reads far lower.
    const plain = s.winners!.reduce((sum, w) => sum + (w.stillHoldingRatio ?? 0), 0) / s.winners!.length;
    expect(plain).toBeGreaterThan(0.5);
    expect(s.stillHolding!.pct).toBeLessThan(plain * 100);
    expect(s.stillHolding!.counted).toBeGreaterThan(0);
    expect(s.stillHolding!.weightUsd).toBeGreaterThan(0);
  });

  it("reads ROI as the fraction Nansen sends and keeps the sample's own limits visible", async () => {
    const s = await spotWinnersSection(CHAIN, TOKEN);
    const top = s.winners![0]!;
    // 0.06789… on the wire is +6.79%, not +0.07%.
    expect(top.roiPct).toBeCloseTo(6.789, 2);
    expect(top.realizedPnlUsd).toBeCloseTo(15_308.7, 1);
    expect(s.isLastPage).toBe(false);
  });
});

// --- 2.1 holder change columns -----------------------------------------------------------------

describe("2.1 the holders tab reads the columns it was already paying for", () => {
  it("turns a raw token change into a percent of the wallet's balance", async () => {
    const s = await spotHoldersSection(CHAIN, TOKEN);
    const moved = s.holders!.find((h) => h.change7dPct !== null && h.change7dPct !== 0)!;
    expect(Math.abs(moved.change7dPct!)).toBeGreaterThan(0);
    expect(Math.abs(moved.change7dPct!)).toBeLessThan(1000);
    // Still five credits: these columns were on every row of a page the card already bought.
    expect(s.credits).toBe(5);
  });

  it("counts the holders that have never sent a token out, and states its own page limit", async () => {
    const s = await spotHoldersSection(CHAIN, TOKEN);
    expect(s.neverSentOutCount).toBe(s.holders!.filter((h) => h.totalOutflow === 0).length);
    expect(s.isLastPage).toBe(false);
    // The recorded token reports real 24h movement, so the "every holder reads zero" line must
    // not fire. Null would mean nobody reported the figure at all, which is a third answer.
    expect(s.allChange24hZero).toBe(false);
  });

  it("carries the response's own warnings on their own channel, never as errors", async () => {
    const s = await spotHoldersSection(CHAIN, TOKEN);
    expect(Array.isArray(s.warnings)).toBe(true);
    expect(s.errors).toEqual([]);
  });
});

// --- 2.1 transfers and Jupiter DCA ---------------------------------------------------------------

describe("2.1 transfers state the movement and never the motive", () => {
  it("names both wallets and keeps the amount and the value apart", async () => {
    const s = await spotTransfersSection(CHAIN, TOKEN);
    expect(s.credits).toBe(1);
    const top = s.transfers![0]!;
    expect(top.fromAddress).toBeTruthy();
    expect(top.toAddress).toBeTruthy();
    // `transfer_amount` is a token quantity and `transfer_value_usd` is a price; a token with no
    // price keeps the amount and shows no dollars rather than printing zero.
    expect(top.amount).toBeGreaterThan(0);
    expect(top.valueUsd).toBeGreaterThan(0);
    expect(top.kind).toBe("transfer");
  });

  it("carries Nansen's own labels verbatim, with no ownership wording added", async () => {
    const s = await spotTransfersSection(CHAIN, TOKEN);
    const labelled = s.transfers!.find((t) => !!t.fromLabel)!;
    expect(labelled.fromLabel).toBe("Token Millionaire");
  });
});

describe("2.1 Jupiter DCA is Solana-only, and its empty answer is the normal one", () => {
  it("never spends a credit on a chain the endpoint does not serve", async () => {
    const s = await spotDcaSection("ethereum", "0x6982508145454ce325ddbe47a25d4ec3d2311933");
    expect(s.asked).toBe(false);
    expect(s.credits).toBe(0);
    // Never asked is not the same answer as asked-and-empty, so the card can tell them apart.
    expect(s.vaults).toBeNull();
  });

  it("reports an empty answer as an empty answer, not as an absent one", async () => {
    const s = await spotDcaSection(CHAIN, TOKEN);
    expect(s.asked).toBe(true);
    expect(s.credits).toBe(1);
    expect(s.vaults).toEqual([]);
  });
});

// --- 1.6.2 the batched token-screener ------------------------------------------------------------

describe("1.6.2 one credit enriches a whole catalog page", () => {
  it("counts the groups before anything is spent", () => {
    const four = enrichmentPlan([{ chain: "solana" }, { chain: "ethereum" }, { chain: "base" }, { chain: "arbitrum" }, { chain: "solana" }]);
    expect(four.groups.length).toBe(1);
    expect(four.credits).toBe(1);

    const many = enrichmentPlan(Array.from({ length: 12 }, (_, i) => ({ chain: `chain-${i}` })));
    expect(many.groups.length).toBe(3);
    expect(many.credits).toBe(3);
  });

  it("caps what one press can cost, and says which chains it left out", () => {
    const plan = enrichmentPlan(Array.from({ length: 40 }, (_, i) => ({ chain: `chain-${i}` })));
    expect(plan.groups.length).toBe(MAX_ENRICH_GROUPS);
    expect(plan.credits).toBe(MAX_ENRICH_GROUPS);
    expect(plan.skippedChains.length).toBe(40 - MAX_ENRICH_GROUPS * 5);
  });

  it("adds the four figures the free search snapshot does not carry, and no duplicate of one it does", async () => {
    const answer = await enrichMarkets({ markets: [{ chain: CHAIN, address: TOKEN }] });
    expect(answer.groups).toBe(1);
    expect(answer.credits).toBe(1);
    const row = answer.rows[`${CHAIN}:${TOKEN}`]!;
    expect(row.ageDays).toBe(1035);
    // `price_change` is a fraction on the wire: -0.0735 is -7.36%, not -0.07%.
    expect(row.priceChangePct).toBeCloseTo(-7.356, 2);
    expect(row.fdvUsd).toBeGreaterThan(0);
    expect(row.fdvMcRatio).toBeCloseTo(1.0017, 3);
    expect(Object.keys(row).sort()).toEqual(["ageDays", "fdvMcRatio", "fdvUsd", "priceChangePct"]);
  });

  it("leaves a row the screener has no answer for exactly as it was", async () => {
    const answer = await enrichMarkets({ markets: [{ chain: CHAIN, address: "1111111111111111111111111111111111111111111" }] });
    expect(answer.rows["solana:1111111111111111111111111111111111111111111"]).toBeUndefined();
    expect(answer.errors).toEqual([]);
  });
});
