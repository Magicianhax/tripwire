import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicBriefService, parsePublicBrief, publicCandleMetrics, PUBLIC_BRIEF_TTL, PUBLIC_MARKETS } from "../lib/public-brief";

const now = 1_800_000_000_000;
const raw = (time = now) => ({ state: "ready", asOf: time, markets: [{ ...PUBLIC_MARKETS[0], updatedAt: time,
  priceUsd: 2300, change24hPct: -2, volume24hUsd: null, marketCapUsd: null,
  flows: [{ valueUsd: -1000 }, { valueUsd: null }, { valueUsd: 0 }, { valueUsd: 500 }],
  candles: [{ timestamp: time - 3600000, close: 2350 }, { timestamp: time, close: 2300 }],
}] });
afterEach(() => vi.unstubAllEnvs());
describe("sanitized public snapshot", () => {
  it("uses genuine candle closes and computes change only with 24h coverage",()=>{
    expect(publicCandleMetrics([{timestamp:now-86400000,close:100},{timestamp:now,close:110}])).toMatchObject({priceUsd:110});
    expect(publicCandleMetrics([{timestamp:now-86400000,close:100},{timestamp:now,close:110}]).change24hPct).toBeCloseTo(10);
    expect(publicCandleMetrics([{timestamp:now,close:110}])).toEqual({priceUsd:110,change24hPct:null});
    expect(publicCandleMetrics([])).toEqual({priceUsd:null,change24hPct:null});
  });
  it("does not infer balanced trading from a zero smart-trader flow",()=>{
    const input=raw();input.markets[0]!.flows[0]!.valueUsd=0;
    expect(parsePublicBrief(input,now)!.markets[0]!.analysis.title).toBe("Fresh wallets: net inflows");
  });
  it("preserves unavailable values and derives measured prose", () => {
    const market = parsePublicBrief(raw(), now)!.markets[0]!;
    expect(market.volume24hUsd).toBeNull();
    expect(market.flows[1]!.valueUsd).toBeNull();
    expect(market.flows[2]!.valueUsd).toBe(0);
    expect(market.analysis.title).toBe("Smart traders net sellers");
    expect(market.analysis.body).toContain("$1K net selling");
  });
  it("reconstructs identity, labels, URLs and prose instead of trusting artifact text", () => {
    const input = raw();
    Object.assign(input.markets[0]!, { symbol: "evil", nansenUrl: "javascript:bad", analysis: { title: "secret" }, apiKey: "secret" });
    const result = parsePublicBrief(input, now)!;
    expect(result.markets[0]!.symbol).toBe("WETH");
    expect(JSON.stringify(result)).not.toMatch(/secret|javascript|evil/);
    input.markets[0]!.id = "arbitrary" as typeof input.markets[0]["id"];
    expect(parsePublicBrief(input, now)).toBeNull();
  });
  it("rejects nonfinite, oversized and future artifacts; ages old data out", () => {
    expect(parsePublicBrief(raw(now + 120000), now)).toBeNull();
    expect(parsePublicBrief(raw(now - 86400001), now)).toBeNull();
    const bad = raw(); bad.markets[0]!.priceUsd = Infinity;
    expect(parsePublicBrief(bad, now)).toBeNull();
    expect(parsePublicBrief({ ...raw(), markets: Array(4).fill(raw().markets[0]) }, now)).toBeNull();
  });
  it("preserves observation time and marks cached observations stale", () => {
    const result = parsePublicBrief(raw(now - PUBLIC_BRIEF_TTL), now)!;
    expect(result.state).toBe("stale");
    expect(result.asOf).toBe(now - PUBLIC_BRIEF_TTL);
  });
});
describe("bounded refresh service", () => {
  function setup(canRefresh = true) {
    let time = now;
    const read = vi.fn(async (): Promise<unknown> => null);
    const collect = vi.fn(async () => parsePublicBrief(raw(time), time)!);
    const write = vi.fn(async () => {});
    const service = createPublicBriefService({ now: () => time, read, collect, write, canRefresh: () => canRefresh, replay: () => false });
    return { service, read, collect, write, advance: (ms: number) => { time += ms; } };
  }
  it("singleflights visitors and reuses a 15 minute cache", async () => {
    const s = setup();
    await Promise.all(Array.from({ length: 30 }, () => s.service()));
    expect(s.collect).toHaveBeenCalledTimes(1);
    await s.service(); expect(s.collect).toHaveBeenCalledTimes(1);
    s.advance(PUBLIC_BRIEF_TTL); await s.service(); expect(s.collect).toHaveBeenCalledTimes(2);
  });
  it("serves cached data without any collection in public mode, even cold or stale", async () => {
    const s = setup(false);
    expect((await s.service()).state).toBe("unavailable");
    s.advance(60000); s.read.mockResolvedValue(raw(now - PUBLIC_BRIEF_TTL));
    expect((await s.service()).state).toBe("stale");
    expect(s.collect).not.toHaveBeenCalled(); expect(s.write).not.toHaveBeenCalled();
  });
  it("retains last good data and backs off after errors without leaking the error", async () => {
    const s = setup(); await s.service(); s.advance(PUBLIC_BRIEF_TTL);
    s.collect.mockRejectedValue(new Error("secret raw API key"));
    const response = await s.service();
    expect(response.state).toBe("stale"); expect(response.asOf).toBe(now);
    expect(JSON.stringify(response)).not.toContain("secret");
    await s.service(); expect(s.collect).toHaveBeenCalledTimes(2);
    s.advance(300000); await s.service(); expect(s.collect).toHaveBeenCalledTimes(3);
  });
  it("does not expose persisted sample data as live data", async () => {
    const s = setup(false); s.read.mockResolvedValue({ ...raw(), state: "sample" });
    expect((await s.service()).state).toBe("unavailable");
  });
  it("reloads a newer published artifact even when its oldest component timestamp is unchanged", async () => {
    const s = setup(false); s.read.mockResolvedValue(raw());
    expect((await s.service()).markets[0]!.priceUsd).toBe(2300);
    const revised = raw(); revised.markets[0]!.priceUsd = 2400;
    s.read.mockResolvedValue(revised); s.advance(60000);
    expect((await s.service()).markets[0]!.priceUsd).toBe(2400);
  });
  it("keeps the whole last-good market if a partial refresh loses its chart or flow", async () => {
    const s = setup(); await s.service(); s.advance(PUBLIC_BRIEF_TTL);
    const partial = raw(now + PUBLIC_BRIEF_TTL); partial.markets[0]!.candles = [];
    s.collect.mockResolvedValue(parsePublicBrief({ ...partial, state: "stale" }, now + PUBLIC_BRIEF_TTL)!);
    const result = await s.service();
    expect(result.state).toBe("stale"); expect(result.asOf).toBe(now);
    expect(result.markets[0]!.candles).toHaveLength(2);
  });
  it("never persists replay output", async () => {
    const write = vi.fn(async () => {});
    const sample = parsePublicBrief({ ...raw(), state: "sample" }, now)!;
    const get = createPublicBriefService({ now: () => now, read: async () => null, write, collect: async () => sample, canRefresh: () => true, replay: () => true });
    expect((await get()).state).toBe("sample"); expect(write).not.toHaveBeenCalled();
  });
});
