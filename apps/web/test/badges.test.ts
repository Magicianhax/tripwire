import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { _resetHyperliquidState, hyperliquidInfo, HyperliquidError } from "@/lib/hyperliquid/client";
import { DELETE as linksDELETE, GET as linksGET, OPTIONS as linksOPTIONS, PUT as linksPUT } from "@/app/api/links/route";
import { POST as badgesPOST } from "@/app/api/author-badges/route";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const EXT = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const HL = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
const PM = "0x1963eabad7eb7499fb049ddebb96a8fd22179bfd";

function req(url: string, opts: { method?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.origin !== undefined) headers.origin = opts.origin;
  return new Request(`http://127.0.0.1:3000${url}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

function freshDb() {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-badges-")), "t.db");
  resetDb();
  _resetClientState();
  _resetHyperliquidState();
}

describe("/api/links", () => {
  beforeAll(() => {
    process.env.TRIPWIRE_REPLAY = "1";
    process.env.TRIPWIRE_FIXTURES = FIXTURES;
  });
  beforeEach(freshDb);
  afterAll(() => {
    delete process.env.TRIPWIRE_REPLAY;
    resetDb();
  });

  it("PUT links a handle (normalized), GET lists it as a user link", async () => {
    const put = await linksPUT(req("/api/links", { method: "PUT", body: { handle: "DegenAlpha", venue: "hyperliquid", address: HL.toUpperCase().replace("0X", "0x") }, origin: EXT }));
    expect(put.status).toBe(200);
    expect((await put.json()).link).toMatchObject({ handle: "degenalpha", venue: "hyperliquid", address: HL, source: "user" });

    const list = await (await linksGET(req("/api/links", { origin: EXT }))).json();
    expect(list.links).toEqual([expect.objectContaining({ handle: "degenalpha", venue: "hyperliquid", address: HL, source: "user", sourceUrl: null })]);
  });

  it("PUT upserts: a second address for the same handle and venue replaces the first", async () => {
    await linksPUT(req("/api/links", { method: "PUT", body: { handle: "degenalpha", venue: "polymarket", address: HL } }));
    await linksPUT(req("/api/links", { method: "PUT", body: { handle: "degenalpha", venue: "polymarket", address: PM } }));
    const list = await (await linksGET(req("/api/links"))).json();
    expect(list.links).toHaveLength(1);
    expect(list.links[0].address).toBe(PM);
  });

  it("400s on a bad address, venue or handle", async () => {
    for (const body of [
      { handle: "degenalpha", venue: "hyperliquid", address: "0x1234" },
      { handle: "degenalpha", venue: "binance", address: HL },
      { handle: "not a handle", venue: "polymarket", address: HL },
      { handle: "degenalpha", venue: "hyperliquid" },
    ]) {
      expect((await linksPUT(req("/api/links", { method: "PUT", body }))).status).toBe(400);
    }
    expect((await linksDELETE(req("/api/links", { method: "DELETE", body: { handle: "degenalpha" } }))).status).toBe(400);
  });

  it("DELETE removes a user link and reports whether one existed", async () => {
    await linksPUT(req("/api/links", { method: "PUT", body: { handle: "degenalpha", venue: "hyperliquid", address: HL } }));
    const del = await linksDELETE(req("/api/links", { method: "DELETE", body: { handle: "DegenAlpha", venue: "hyperliquid" }, origin: EXT }));
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });
    expect((await (await linksGET(req("/api/links"))).json()).links).toEqual([]);
    expect(await (await linksDELETE(req("/api/links", { method: "DELETE", body: { handle: "degenalpha", venue: "hyperliquid" } }))).json()).toEqual({ deleted: false });
  });

  it("403s every method for a foreign origin, and the extension's preflight allows DELETE", async () => {
    const evil = "https://evil.example";
    expect((await linksGET(req("/api/links", { origin: evil }))).status).toBe(403);
    expect((await linksPUT(req("/api/links", { method: "PUT", body: { handle: "a", venue: "hyperliquid", address: HL }, origin: evil }))).status).toBe(403);
    expect((await linksDELETE(req("/api/links", { method: "DELETE", body: { handle: "a", venue: "hyperliquid" }, origin: evil }))).status).toBe(403);
    expect((await (await linksGET(req("/api/links"))).json()).links).toEqual([]);
    const pre = await linksOPTIONS(req("/api/links", { method: "OPTIONS", origin: EXT }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("DELETE");
  });
});

describe("/api/author-badges (replay)", () => {
  beforeAll(() => {
    process.env.TRIPWIRE_REPLAY = "1";
    process.env.TRIPWIRE_FIXTURES = FIXTURES;
  });
  beforeEach(freshDb);
  afterEach(() => {
    delete process.env.TRIPWIRE_HL_FIXTURES;
  });
  afterAll(() => {
    delete process.env.TRIPWIRE_REPLAY;
    resetDb();
  });

  const badges = async (handle: string, displayName: string, origin?: string) => {
    const res = await badgesPOST(req("/api/author-badges", { body: { handle, displayName }, origin }));
    return { status: res.status, body: await res.json() };
  };
  const link = (handle: string, venue: string, address: string) => linksPUT(req("/api/links", { method: "PUT", body: { handle, venue, address } }));

  it("Nansen badge on an exact entity match: holdings, top 3, realized PnL and win rate", async () => {
    const { status, body } = await badges("VitalikButerin", "Vitalik Buterin");
    expect(status).toBe(200);
    expect(body.hyperliquid).toBeUndefined();
    expect(body.polymarket).toBeUndefined();
    expect(body.nansen).toMatchObject({ entity: "Vitalik Buterin", tags: ["Public Figure", "Co-Founder"], matchedBy: "displayName", pnlWindowDays: 90 });
    expect(body.nansen.totalHoldingsUsd).toBeGreaterThan(595_000_000);
    expect(body.nansen.topHoldings).toHaveLength(3);
    expect(body.nansen.topHoldings[0]).toMatchObject({ symbol: "ETH", chain: "ethereum" });
    expect(body.nansen.realizedPnlUsd).toBeCloseTo(9594142.06, 1);
    expect(body.nansen.winRate).toBeCloseTo(0.5286, 3);
  });

  it("no badges for an unlabeled, unlinked account", async () => {
    const { status, body } = await badges("weatherfan", "Weather Fan");
    expect(status).toBe(200);
    expect(body).toEqual({ handle: "weatherfan", errors: [] });
  });

  it("near-miss names never match (no fuzzy entity match)", async () => {
    const { body } = await badges("vitalik_fan", "Vitalik Buterin Fan");
    expect(body.nansen).toBeUndefined();
  });

  it("Hyperliquid badge for a linked handle: account, positions, last 10 fills, Nansen perp PnL", async () => {
    await link("degenalpha", "hyperliquid", HL);
    const { body } = await badges("DegenAlpha", "Degen Alpha");
    expect(body.nansen).toBeUndefined();
    const hl = body.hyperliquid;
    expect(hl.link).toEqual({ address: HL, source: "user", sourceUrl: null });
    expect(hl.accountValueUsd).toBeCloseTo(32067508.17, 1);
    expect(hl.marginUsedUsd).toBeCloseTo(13149214.39, 1);
    expect(hl.positions.length).toBeGreaterThan(2);
    const eth = hl.positions.find((p: { coin: string }) => p.coin === "ETH");
    expect(eth).toMatchObject({ side: "short", leverage: 25, entryPx: 2299.4, liquidationPx: 4320.479450516 });
    expect(eth.size).toBeCloseTo(13980.5894, 4);
    expect(eth.markPx).toBeCloseTo(34425803.33856 / 13980.5894, 4);
    expect(eth.unrealizedPnlUsd).toBeCloseTo(-2278791.79, 1);
    expect(hl.fills).toHaveLength(10);
    expect(hl.fillsWindow.count).toBe(50);
    expect(typeof hl.fillsRealizedPnlUsd).toBe("number");
    expect(hl.nansenPerp).toMatchObject({ windowDays: 30 });
    expect(hl.nansenPerp.winRate).toBeGreaterThan(0);
    expect(hl.errors).toEqual([]);
  });

  it("Polymarket badge for a linked handle: summary, open positions by value, last 5 trades", async () => {
    await link("degenalpha", "polymarket", PM);
    const { body } = await badges("degenalpha", "Degen Alpha");
    const pm = body.polymarket;
    expect(pm.link.source).toBe("user");
    expect(pm.totalPnlUsd).toBeCloseTo(13788.16, 1);
    expect(pm.winRate).toBeCloseTo(0.1219, 3);
    expect(pm.marketsTraded).toBe(558);
    expect(pm.openPositions.length).toBeGreaterThan(0);
    expect(pm.openPositions.length).toBeLessThanOrEqual(5);
    const values = pm.openPositions.map((p: { valueUsd: number }) => p.valueUsd);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(pm.openPositions[0]).toEqual(expect.objectContaining({ question: expect.any(String), side: expect.stringMatching(/^(Yes|No)$/) }));
    expect(pm.trades).toHaveLength(5);
    expect(pm.errors).toEqual([]);
  });

  it("a Hyperliquid failure is a partial result: the badge keeps its link and says why, Polymarket still loads", async () => {
    process.env.TRIPWIRE_HL_FIXTURES = fs.mkdtempSync(path.join(os.tmpdir(), "tw-nohl-"));
    await link("degenalpha", "hyperliquid", HL);
    await link("degenalpha", "polymarket", PM);
    const { status, body } = await badges("degenalpha", "Degen Alpha");
    expect(status).toBe(200);
    expect(body.hyperliquid.link.address).toBe(HL);
    expect(body.hyperliquid.accountValueUsd).toBeNull();
    expect(body.hyperliquid.positions).toBeNull();
    expect(body.hyperliquid.errors.length).toBeGreaterThan(0);
    expect(body.polymarket.totalPnlUsd).not.toBeNull();
  });

  it("403s a foreign origin and 400s a bad handle", async () => {
    expect((await badges("degenalpha", "Degen Alpha", "https://evil.example")).status).toBe(403);
    expect((await badges("bad handle", "x")).status).toBe(400);
  });
});

describe("hyperliquidInfo (live mode, fetch stubbed)", () => {
  beforeEach(() => {
    delete process.env.TRIPWIRE_REPLAY;
    freshDb();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the info body and caches the answer for its TTL", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ marginSummary: { accountValue: "1" } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const a = await hyperliquidInfo<{ marginSummary: { accountValue: string } }>("clearinghouseState", HL);
    const b = await hyperliquidInfo("clearinghouseState", HL);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe("https://api.hyperliquid.xyz/info");
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ type: "clearinghouseState", user: HL });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(b.data).toEqual(a.data);
  });

  it("throws on a non-OK answer and never caches the failure", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await expect(hyperliquidInfo("userFills", HL)).rejects.toBeInstanceOf(HyperliquidError);
    expect((await hyperliquidInfo("userFills", HL)).data).toEqual([]);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
