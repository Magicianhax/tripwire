import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { _forgetLogo, MAX_LOGO_BYTES, tokenLogo } from "@/lib/token-logo";
import { extractLabels } from "@/lib/intel/wallet";
import { POST as walletPOST } from "@/app/api/wallet/route";
import { POST as labelsPOST } from "@/app/api/wallet/labels/route";
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
    expect(body.portfolio.holdings.length).toBeLessThanOrEqual(6);
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
    new Response(bytes, { status: 200, headers: { "content-type": type, "content-length": String(bytes.byteLength) } });

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
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/coin-images\.coingecko\.com\//);

    const second = await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`));
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png", "content-length": String(MAX_LOGO_BYTES + 1) } })),
    );
    expect((await logoGET(req(`/api/token-logo?chain=solana&address=${WIF}`))).status).toBe(502);

    _forgetLogo("solana", WIF);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(MAX_LOGO_BYTES + 10), { status: 200, headers: { "content-type": "image/png" } })));
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
