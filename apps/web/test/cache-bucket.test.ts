import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { nansen } from "@/lib/nansen/endpoints";
import { buildSpotIntel } from "@/lib/intel/spot";

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

function stubNansen() {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "x-nansen-credits-used": "1" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const callsTo = (fn: ReturnType<typeof stubNansen>, endpoint: string) =>
  fn.mock.calls.filter(([url]) => url.endsWith(`/${endpoint}`)).map(([, init]) => init!.body as string);

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-bucket-"));
  process.env.TRIPWIRE_DB = path.join(dir, "t.db");
  process.env.NANSEN_API_KEY = "test-key";
  process.env.NANSEN_DAILY_CREDIT_CAP = "100000";
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
  _resetClientState();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetDb();
});

describe("dated Nansen bodies are bucketed to the endpoint TTL", () => {
  it("spot panel: two calls 30s apart in one 5-minute bucket send identical bodies, one fetch each", async () => {
    const f = stubNansen();
    const post = "2026-09-17T10:00:00Z";
    vi.setSystemTime(new Date("2026-09-17T12:01:10.250Z"));
    await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "panel", postTimeIso: post });
    vi.setSystemTime(new Date("2026-09-17T12:01:40.900Z"));
    await buildSpotIntel({ kind: "spot", chain: "solana", tokenAddress: WIF }, { mode: "panel", postTimeIso: post });

    const who = callsTo(f, "tgm/who-bought-sold");
    const ohlcv = callsTo(f, "tgm/token-ohlcv");
    expect(who).toHaveLength(2); // BUY + SELL, each fetched once
    // Two price windows, each fetched once: the 8-day daily series the drawdown signal is
    // measured on (1h bucket), and the chart's own window (bucketed to its candle interval).
    expect(ohlcv).toHaveLength(2);
    const windows = ohlcv.map((b) => JSON.parse(b)).map((b) => [b.timeframe, b.date.from, b.date.to]);
    expect(windows).toContainEqual(["1d", "2026-09-09T12:00:00Z", "2026-09-17T12:00:00Z"]);
    expect(windows).toContainEqual(["15m", "2026-09-16T12:00:00Z", "2026-09-17T12:00:00Z"]);
    expect(JSON.parse(who[0]!).date).toEqual({ from: "2026-09-17T10:00:00Z", to: "2026-09-17T12:00:00Z" });
  });

  it("perp screener: two calls 30s apart in one 2-minute bucket share one fetch", async () => {
    const f = stubNansen();
    vi.setSystemTime(new Date("2026-09-17T12:02:50Z"));
    await nansen.perpScreener("ETH");
    vi.setSystemTime(new Date("2026-09-17T12:03:20Z"));
    await nansen.perpScreener("ETH");
    const bodies = callsTo(f, "perp-screener");
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!).date).toEqual({ from: "2026-09-16T12:02:00Z", to: "2026-09-17T12:02:00Z" });
  });

  it("a new bucket produces a new body", async () => {
    const f = stubNansen();
    vi.setSystemTime(new Date("2026-09-17T12:03:59Z"));
    await nansen.perpScreener("ETH");
    vi.setSystemTime(new Date("2026-09-17T12:04:01Z"));
    await nansen.perpScreener("ETH");
    expect(callsTo(f, "perp-screener")).toHaveLength(2);
  });
});
