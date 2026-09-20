import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { _forgetLogo, MAX_LOGO_BYTES, tokenLogo } from "@/lib/token-logo";
import { extractLabels, labelFromDexTrades } from "@/lib/intel/wallet";
import { POST as walletPOST } from "@/app/api/wallet/route";
import { POST as labelsPOST } from "@/app/api/wallet/labels/route";
import { POST as defiPOST } from "@/app/api/wallet/defi/route";
import { POST as unrealizedPOST } from "@/app/api/wallet/unrealized/route";
import { GET as logoGET } from "@/app/api/token-logo/route";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

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

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-wallet-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  delete process.env.NANSEN_ALLOW_PREMIUM;
  resetDb();
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/wallet", () => {
  it("profiles a raw EVM address", async () => {
    const res = await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolved).toBe(true);
    expect(body.address).toBe(ADDRESS);
    expect(body.input).toBe(ADDRESS);
    expect(body.portfolio.totalUsd).toBeGreaterThan(0);
    expect(body.portfolio.holdings.length).toBeGreaterThan(0);
    expect(body.portfolio.holdings).toHaveLength(20);
    expect(body.sampleData).toBe(true);
    expect(body.portfolio.chainHoldings.reduce((sum: number, row: { valueUsd: number }) => sum + row.valueUsd, 0)).toBeCloseTo(body.portfolio.totalUsd);
    expect(body.portfolio.holdingsTruncated).toBe(false);
    expect(body.pnl.topPnlTokens).toHaveLength(5);
    expect(body.pnl.topPnlTokens[0].symbol).toBe("LIT");
    expect(body.pnl.windowDays).toBe(90);
    expect(typeof body.pnl.winRate).toBe("number");
    // chainGuess is where the wallet's money actually is: the fixture's largest holding is on Arbitrum.
    expect(body.chainGuess).toBe("arbitrum");
    expect(body.nansenUrl).toBe(`https://app.nansen.ai/profiler?address=${ADDRESS}&chain=arbitrum`);
    expect(body.errors).toEqual([]);
  });

  it("carries the Hyperliquid and Polymarket blocks for an EVM address, and prices itself", async () => {
    const body = await (await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: ORIGIN }))).json();
    expect(body.hyperliquid.positions.length).toBeGreaterThan(0);
    expect(body.polymarket).toBeTruthy();
    expect(body.sources).toContain("Hyperliquid public API");
    // 1 balances + 1 PnL + 3 prediction-market; Hyperliquid and search are free.
    expect(body.credits).toBe(5);
  });

  it("does not ask Hyperliquid or Polymarket about a Solana address", async () => {
    const body = await (await walletPOST(req("/api/wallet", { body: { query: WIF }, origin: ORIGIN }))).json();
    expect(body.resolved).toBe(true);
    expect(body.chainGuess).toBe("solana");
    expect(body.hyperliquid).toBeNull();
    expect(body.polymarket).toBeNull();
    expect(body.credits).toBe(2);
  });

  it("resolves an ENS name (replay answers without touching the network)", async () => {
    const body = await (await walletPOST(req("/api/wallet", { body: { query: "vitalik.eth" }, origin: ORIGIN }))).json();
    expect(body.resolved).toBe(true);
    expect(body.name).toEqual({ value: "vitalik.eth", source: "replay" });
    expect(body.address).toBe(ADDRESS);
  });

  it("says why a .sol name cannot be resolved instead of guessing", async () => {
    const res = await walletPOST(req("/api/wallet", { body: { query: "toly.sol" }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolved).toBe(false);
    expect(body.address).toBeNull();
    expect(body.message).toMatch(/can't resolve toly\.sol/i);
  });

  it("rejects a string that is not a wallet at all", async () => {
    for (const query of ["hello there", "0xdead", `0x${"a1".repeat(32)}`, ""]) {
      const res = await walletPOST(req("/api/wallet", { body: { query }, origin: ORIGIN }));
      expect(res.status, query).toBe(400);
    }
  });

  it("keeps the origin guard", async () => {
    const res = await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: "https://evil.example.com" }));
    expect(res.status).toBe(403);
  });

  it("never sinks the whole card when one block fails", async () => {
    // Point the Hyperliquid fixtures at a directory that has none: the card still answers.
    const previous = process.env.TRIPWIRE_HL_FIXTURES;
    process.env.TRIPWIRE_HL_FIXTURES = path.join(os.tmpdir(), "tripwire-no-such-fixtures");
    try {
      const res = await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: ORIGIN }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resolved).toBe(true);
      expect(body.portfolio.totalUsd).toBeGreaterThan(0);
      expect(body.hyperliquid).toBeNull();
      expect(body.errors.some((e: string) => e.startsWith("Hyperliquid:"))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TRIPWIRE_HL_FIXTURES;
      else process.env.TRIPWIRE_HL_FIXTURES = previous;
    }
  });
});

describe("POST /api/wallet/labels", () => {
  it("refuses without the env gate, and names the switch", async () => {
    delete process.env.NANSEN_ALLOW_PREMIUM;
    const res = await labelsPOST(req("/api/wallet/labels", { body: { address: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("premium_disabled");
    expect(body.message).toMatch(/NANSEN_ALLOW_PREMIUM=1/);
    expect(body.message).toMatch(/100 Nansen credits/);
  });

  it("validates the address before it can cost anything", async () => {
    process.env.NANSEN_ALLOW_PREMIUM = "1";
    const res = await labelsPOST(req("/api/wallet/labels", { body: { address: "0xdead" }, origin: ORIGIN }));
    expect(res.status).toBe(400);
    delete process.env.NANSEN_ALLOW_PREMIUM;
  });

  it("reports the 100-credit price with whatever labels came back", async () => {
    process.env.NANSEN_ALLOW_PREMIUM = "1";
    const res = await labelsPOST(req("/api/wallet/labels", { body: { address: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(100);
    expect(body.address).toBe(ADDRESS);
    // No fixture exists for a 100-credit endpoint, so replay reports it as unavailable.
    expect(body.labels).toEqual([]);
    expect(body.errors[0]).toMatch(/profiler\/labels|addressLabels/i);
    delete process.env.NANSEN_ALLOW_PREMIUM;
  });
});

// ---- Round 1.5 ----

describe("1.5.1 the label line", () => {
  it("no longer comes from a search/general entity row, which can never carry an address", async () => {
    const body = await (await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: ORIGIN }))).json();
    // The old path kept an entity whose `address` matched. `search/general` entities are
    // {name, tags, rank}: the condition could not be true, so the line was always empty.
    expect(body.label).toBeNull();
    expect(body.sources).not.toContain("Nansen search");
  });

  it("populates from a dex-trades label, and survives a page that has none", () => {
    expect(labelFromDexTrades([{ trader_address_label: "Smart Trader" }])?.text).toBe("Smart Trader");
    // The recorded page is genuinely empty (measured: three public addresses, 30 and 360 days).
    expect(labelFromDexTrades([])).toBeNull();
    expect(labelFromDexTrades(undefined)).toBeNull();
    expect(labelFromDexTrades([{ trader_address_label: null }, { trader_address_label: "  " }])).toBeNull();
    expect(labelFromDexTrades([{}, { trader_address_label: "Jump Trading" }])?.text).toBe("Jump Trading");
  });
});

describe("1.5.2 realized ROI", () => {
  it("carries the wallet figure and the per-row one, as the fractions Nansen sends", async () => {
    const body = await (await walletPOST(req("/api/wallet", { body: { query: ADDRESS }, origin: ORIGIN }))).json();
    // +$19.5k at +0.23%: the percentage is a fraction, so a card that forgets to multiply
    // prints 0% for a wallet that made twenty thousand dollars.
    expect(body.pnl.realizedPnlUsd).toBeCloseTo(19460.94, 2);
    expect(body.pnl.realizedPnlPercent).toBeCloseTo(0.0023448, 6);
    expect(body.pnl.topPnlTokens[0].realizedRoi).toBeCloseTo(0.0071355, 6);
    expect(body.pnl.topPnlTokens.map((t: { realizedRoi: number | null }) => t.realizedRoi).every((r: unknown) => r === null || typeof r === "number")).toBe(true);
  });
});

describe("POST /api/wallet/defi (1.5.6 + 1.5.1)", () => {
  it("prices itself at two credits and never sums DeFi into the token portfolio", async () => {
    const res = await defiPOST(req("/api/wallet/defi", { body: { address: ADDRESS, chain: "ethereum" }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(2);
    expect(body.address).toBe(ADDRESS);
    expect(body.labelChain).toBe("ethereum");
  });

  it("an all-zero answer is reported as none found, not as a balance of $0", async () => {
    const body = await (await defiPOST(req("/api/wallet/defi", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    // The recorded response is the real one: every summary figure 0 and `protocols: []`.
    expect(body.defi.reportedNone).toBe(true);
    expect(body.defi.totalDebtsUsd).toBe(0);
  });

  it("does not ask for a label when the wallet has no chain to ask about", async () => {
    const body = await (await defiPOST(req("/api/wallet/defi", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    expect(body.labelChain).toBeNull();
    expect(body.label).toBeNull();
  });

  it("validates the address, and keeps the origin guard, before it can cost anything", async () => {
    expect((await defiPOST(req("/api/wallet/defi", { body: { address: "0xdead" }, origin: ORIGIN }))).status).toBe(400);
    expect((await defiPOST(req("/api/wallet/defi", { body: { address: ADDRESS }, origin: "https://evil.example.com" }))).status).toBe(403);
  });
});

describe("POST /api/wallet/unrealized (1.5.7)", () => {
  it("returns one credit's worth of per-token unrealized PnL and cost basis", async () => {
    const res = await unrealizedPOST(req("/api/wallet/unrealized", { body: { address: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(1);
    expect(body.windowDays).toBe(90);
    expect(body.rows.length).toBe(7);
    expect(body.rows[0].unrealizedPnlUsd).toBeCloseTo(104.2872, 3);
    expect(body.rows[0].costBasisUsd).toBeCloseTo(1880.496, 3);
    // Nansen sends the trade counts as strings; they reach the card as numbers.
    expect(body.rows[0].buys).toBe(13);
    expect(body.rows[0].sells).toBe(3);
  });

  it("orders by unrealized PnL, so a long-tail wallet's page is its largest rows", async () => {
    const body = await (await unrealizedPOST(req("/api/wallet/unrealized", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const values = body.rows.map((r: { unrealizedPnlUsd: number }) => r.unrealizedPnlUsd);
    expect(values).toEqual([...values].sort((a: number, b: number) => b - a));
  });

  it("nulls stay nulls, and a symbol can repeat because the rows carry no chain", async () => {
    const body = await (await unrealizedPOST(req("/api/wallet/unrealized", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const bnb = body.rows.find((r: { symbol: string }) => r.symbol === "BNB");
    // A token never sold has no average sale price. That is a dash, not a zero.
    expect(bnb.avgSoldPriceUsd).toBeNull();
    expect(body.rows.filter((r: { symbol: string }) => r.symbol === "ETH").length).toBeGreaterThan(1);
  });

  it("keeps the address validation and the origin guard", async () => {
    expect((await unrealizedPOST(req("/api/wallet/unrealized", { body: { address: "nope" }, origin: ORIGIN }))).status).toBe(400);
    expect((await unrealizedPOST(req("/api/wallet/unrealized", { body: { address: ADDRESS }, origin: "https://evil.example.com" }))).status).toBe(403);
  });
});

describe("extractLabels", () => {
  it("reads labels out of the shapes profiler/labels might use", () => {
    expect(extractLabels({ labels: ["Smart Trader", "Fund"] })).toEqual(["Smart Trader", "Fund"]);
    expect(extractLabels({ data: [{ label: "Whale" }, { label: "Whale" }] })).toEqual(["Whale"]);
    expect(extractLabels({ data: [{ entity_name: "Jump Trading", tags: ["fund"] }] })).toEqual(["Jump Trading", "fund"]);
  });

  it("ignores everything that is not a label", () => {
    expect(extractLabels({ balance_usd: 12, data: [{ value_usd: 3 }] })).toEqual([]);
    expect(extractLabels(null)).toEqual([]);
  });
});

describe("GET /api/token-logo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const image = (type: string, bytes: Uint8Array = png) =>
    new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { "content-type": type, "content-length": String(bytes.byteLength) } });

  it("never substitutes the WIF replay logo for another holding or case-distinct Solana address", async () => {
    const fetchMock = vi.fn(async () => image("image/png"));
    vi.stubGlobal("fetch", fetchMock);
    for (const [chain, address] of [["ethereum", ADDRESS], ["solana", WIF.toLowerCase()], ["ethereum", WIF]]) {
      expect(await tokenLogo(chain!, address!)).toEqual({ ok: false, status: 404, reason: "no logo known for this token" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bad params", async () => {
    expect((await logoGET(req("/api/token-logo"))).status).toBe(400);
    expect((await logoGET(req(`/api/token-logo?chain=notachain&address=${WIF}`))).status).toBe(400);
    expect((await logoGET(req("/api/token-logo?chain=solana&address=nope"))).status).toBe(400);
  });

  it("refuses a request that did not come to the backend's own host", async () => {
    const res = await logoGET(new Request(`http://evil.example.com/api/token-logo?chain=solana&address=${WIF}`, { headers: { host: "evil.example.com" } }));
    expect(res.status).toBe(403);
  });

  it("serves the bytes for a logo Nansen already named, then serves them from cache", async () => {
    _forgetLogo("solana", WIF);
    const fetchMock = vi.fn(async () => image("image/jpeg"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`));
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(png);
    // The URL fetched is the one out of Nansen's own answer, never one from the request.
    expect(String((fetchMock.mock.calls as unknown as unknown[][])[0]![0])).toMatch(/^https:\/\/coin-images\.coingecko\.com\//);

    const second = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`));
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets the extension's background fetch it from a backend on any local port", async () => {
    _forgetLogo("solana", WIF);
    vi.stubGlobal("fetch", vi.fn(async () => image("image/png")));
    const res = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`, { origin: ORIGIN }));
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("vary")).toBe("Origin");

    const stranger = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`, { origin: "https://evil.example.com" }));
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a response that is not an image", async () => {
    _forgetLogo("solana", WIF);
    vi.stubGlobal("fetch", vi.fn(async () => image("text/html")));
    const res = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/not an image/);
  });

  it("refuses a response larger than the cap, declared or streamed", async () => {
    _forgetLogo("solana", WIF);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png.slice().buffer as ArrayBuffer, { status: 200, headers: { "content-type": "image/png", "content-length": String(MAX_LOGO_BYTES + 1) } })),
    );
    expect((await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`))).status).toBe(502);

    _forgetLogo("solana", WIF);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(MAX_LOGO_BYTES + 10), { status: 200, headers: { "content-type": "image/png" } })));
    const res = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/larger than/);
  });

  it("never spends a credit for a token nothing has looked up", async () => {
    // Off replay, the proxy reads the Nansen cache and nothing else: an unseen token is a 404
    // and no request leaves the machine, rather than a 1-credit token-information call.
    delete process.env.TRIPWIRE_REPLAY;
    const fetchMock = vi.fn(async () => image("image/png"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await tokenLogo("ethereum", "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c");
      expect(result).toEqual({ ok: false, status: 404, reason: "no logo known for this token" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.TRIPWIRE_REPLAY = "1";
    }
  });
});
