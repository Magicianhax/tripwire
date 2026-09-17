import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { buildSpotIntel, safeLogoUrl } from "@/lib/intel/spot";
import { buildPerpIntel } from "@/lib/intel/perp";
import { buildPredictionIntel } from "@/lib/intel/prediction";
import { resolveCashtag } from "@/lib/intel/resolve";
import { buildPersonIntel } from "@/lib/intel/person";

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const val = (s: { id: string; value: number | null }[], id: string) => s.find((x) => x.id === id)?.value;

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-intel-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

describe("intel builders (replay of live-recorded responses)", () => {
  it("spot chip computes all spot signals from real payloads", async () => {
    const r = await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "chip" });
    for (const id of ["exit_pressure", "fresh_buy_share", "sm_netflow_24h", "risk_high_count"]) {
      expect(val(r.signals, id), id).not.toBeNull();
    }
    expect(r.panel.netflow?.symbol).toBe("WIF");
    expect(r.panel.topBuyers).toBeNull();
  });

  it("spot panel adds buyers, sellers, candles and since-post flow", async () => {
    const post = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const r = await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "panel", postTimeIso: post });
    expect(r.panel.topBuyers?.length).toBeGreaterThan(0);
    expect(r.panel.topSellers?.length).toBeGreaterThan(0);
    expect(r.panel.candles?.length).toBeGreaterThan(0);
    expect(r.panel.sincePost?.timeframe).toBe("6h");
  });

  it("spot panel: no token-information fixture means no logo, and no error line for a cosmetic field", async () => {
    const r = await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "panel" });
    expect(r.panel.logoUrl).toBeNull();
    expect(r.panel.errors.join(" ")).not.toMatch(/tokenInformation/);
    const chip = await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "chip" });
    expect(chip.panel.logoUrl).toBeNull();
  });

  it("only passes https image URLs through as a token logo", () => {
    expect(safeLogoUrl("https://cdn.nansen.ai/token/wif.png")).toBe("https://cdn.nansen.ai/token/wif.png");
    expect(safeLogoUrl("http://example.com/a.png")).toBeNull();
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(safeLogoUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(safeLogoUrl("")).toBeNull();
    expect(safeLogoUrl(null)).toBeNull();
    expect(safeLogoUrl(42)).toBeNull();
    expect(safeLogoUrl("https://" + "a".repeat(2100))).toBeNull();
  });

  it("perp intel returns screener, positions and a side-aware signal", async () => {
    const r = await buildPerpIntel({ kind: "perp", coin: "eth", side: "long" }, "panel");
    expect(r.panel.screener?.token_symbol).toBe("ETH");
    expect(r.panel.positions?.length).toBe(50);
    expect(val(r.signals, "sm_opposite_side_pct")).toBeGreaterThan(0);
    expect(val(r.signals, "inside_liq_band")).not.toBeNull();
  });

  it("prediction intel resolves slug and weights holders by pnl", async () => {
    const r = await buildPredictionIntel({ kind: "prediction", slug: "bitcoin-above-72k-on-september-17-2026", outcome: "yes" }, "panel");
    expect(r.panel.market?.id).toBe("4441305");
    expect(r.panel.holders?.length).toBe(20);
    expect(val(r.signals, "smart_side_disagrees")).not.toBeNull();
  });

  it("resolves a cashtag to the solana token, excluding hyperliquid pseudo tokens", async () => {
    const r = await resolveCashtag("wif");
    expect(r.best?.tokenAddress).toBe(WIF);
    expect(r.candidates.every((c) => c.chain !== ("hyperliquid" as never))).toBe(true);
  });

  it("person intel matches an exact entity name only", async () => {
    const hit = await buildPersonIntel({ handle: "VitalikButerin", displayName: "Vitalik Buterin" });
    expect(hit.entity).toBe("Vitalik Buterin");
    expect(hit.topHoldings.length).toBeGreaterThan(0);
    const miss = await buildPersonIntel({ handle: "randomdegen", displayName: "random degen 🐸" });
    expect(miss.entity).toBeNull();
  });
});
