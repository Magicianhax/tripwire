import { describe, expect, it } from "vitest";
import {
  addressKey,
  ageInDays,
  bothSidesKeys,
  exchangeFlowCopy,
  FLOW_STACK_FIELDS,
  flowWarningRow,
  indicatorTriggerDate,
  MAX_WARNING_CHARS,
  MIN_VOL24_USD,
  priceReadout,
  scoreVocabulary,
  severityLevel,
  splitIsReadable,
  tradedBothSides,
  toFlowWarnings,
  toIsoInstant,
} from "../src/index";

/**
 * Values copied verbatim from the recorded WIF responses in `fixtures/nansen/`. The core
 * package has no Node types, so it cannot read the files; `apps/web/test/intel.test.ts` asserts
 * the same figures straight off disk, so a re-recorded fixture that no longer matches fails
 * there rather than passing silently here.
 */
const FLOW_INTEL = {
  data: [{ exchange_net_flow_usd: -126_565.61940862653, exchange_wallet_count: 0, fresh_wallets_net_flow_usd: 576_474.8719659239 }],
  warnings: [
    "exchange_wallet_count is always 0 (not tracked), even when exchange net flow is non-zero.",
    "fresh_wallets_wallet_count is always 0 (not tracked), even when fresh-wallet net flow is non-zero.",
  ],
};
const INDICATORS = {
  risk_indicators: [
    { indicator_type: "btc-reflexivity", score: "high", signal: 2.05, signal_percentile: 93.45454545454545, last_trigger_on: "2026-09-15" },
    { indicator_type: "cex-flows", score: "high", signal: 0.03141053425897812, signal_percentile: 87.87878787878788, last_trigger_on: "1970-01-01" },
  ],
  reward_indicators: [
    { indicator_type: "concentration-risk", score: "low", signal: 0.09512342236166854, signal_percentile: 60.63492063492063, last_trigger_on: "2026-08-23" },
    { indicator_type: "price-momentum", score: "bearish", signal: -0.01295462870040498, signal_percentile: 9.98439937597504, last_trigger_on: "2026-04-21" },
  ],
};
const TOKEN_INFORMATION = {
  data: { token_details: { token_deployment_date: "2023-11-20 19:22:43" }, spot_metrics: { volume_total_usd: 1_471_491.2552693444 } },
};
/** The recorded top-buyers page: the #2 row is the bot that round-tripped. */
const WHO_BOUGHT = {
  data: [
    { address: "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD", bought_volume_usd: 52_001.99004316397, sold_volume_usd: 0 },
    { address: "CsVdJ8WH8Q9eHSTRpwtwN3TYApm24QnLKYUMNxJ3DaED", bought_volume_usd: 49_893.505864463135, sold_volume_usd: 49_844.61619946406 },
    { address: "6nFTCdnry6jkRz3jeHdmFsRpNs1UnGH9dA1RDAzqaNgm", bought_volume_usd: 35_026.6374371974, sold_volume_usd: 5.382361245949781 },
  ],
};
/** The recorded top-sellers page shares no address with the buyers page. */
const WHO_SOLD = { data: [{ address: "7yE6dE89PWwR8F9UepokVWwu73gHvu8duyzhKmcyJzNM" }] };

const FIXTURES: Record<string, unknown> = {
  flowIntel: FLOW_INTEL,
  indicators: INDICATORS,
  tokenInformation: TOKEN_INFORMATION,
  whoBought: WHO_BOUGHT,
  whoSold: WHO_SOLD,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixture = (name: string): any => FIXTURES[name];

// --- 1.1.6 exchange net flow ----------------------------------------------------------------

describe("exchange net flow reads at its own polarity", () => {
  it("a negative figure is tokens leaving exchanges, not a cohort selling", () => {
    const live = fixture("flowIntel").data[0].exchange_net_flow_usd as number;
    expect(live).toBeLessThan(0);
    const copy = exchangeFlowCopy(live);
    expect(copy.direction).toBe("out");
    expect(copy.text).toBe("left exchanges");
    // The wording must not borrow the cohort rows' meaning.
    expect(copy.text).not.toMatch(/sold|bought|exit/i);
  });

  it("positive is money moving onto exchanges, zero is flat, null is unknown", () => {
    expect(exchangeFlowCopy(126_565).direction).toBe("in");
    expect(exchangeFlowCopy(126_565).text).toBe("moved onto exchanges");
    expect(exchangeFlowCopy(0).direction).toBe("flat");
    for (const absent of [null, undefined, Number.NaN]) {
      expect(exchangeFlowCopy(absent).direction).toBe("unknown");
      expect(exchangeFlowCopy(absent).text).toMatch(/unavailable/i);
    }
  });

  it("the exchange field is not one of the five rows the symlog stack draws", () => {
    expect(FLOW_STACK_FIELDS).toHaveLength(5);
    expect(FLOW_STACK_FIELDS).not.toContain("exchange_net_flow_usd");
  });
});

// --- 1.1.7 flow-intelligence warnings -------------------------------------------------------

describe("flow-intelligence warnings are data, not failures", () => {
  it("the recorded warnings place themselves under the rows they are about", () => {
    const warnings = toFlowWarnings(fixture("flowIntel").warnings);
    expect(warnings).toHaveLength(2);
    expect(warnings.map(flowWarningRow)).toEqual(["exchange", "fresh_wallets"]);
  });

  it("caps length and count, drops non-strings, and keeps an unplaceable warning", () => {
    const long = "x".repeat(400);
    const capped = toFlowWarnings([long, 7, "", "   ", ...Array.from({ length: 10 }, (_, i) => `w${i}`)]);
    expect(capped[0]!.length).toBe(MAX_WARNING_CHARS);
    expect(capped[0]!.endsWith("…")).toBe(true);
    expect(capped.length).toBeLessThanOrEqual(6);
    expect(toFlowWarnings(null)).toEqual([]);
    expect(flowWarningRow("timeframes beyond 7d are not supported")).toBeNull();
  });
});

// --- 1.1.8 indicators -----------------------------------------------------------------------

describe("indicators group by score vocabulary, not by the array they arrived in", () => {
  const live = fixture("indicators") as {
    risk_indicators: { indicator_type: string; score: string; last_trigger_on: string; signal_percentile: number }[];
    reward_indicators: { indicator_type: string; score: string; last_trigger_on: string }[];
  };

  it("a high-scored risk row and a low-scored reward row share the severity vocabulary", () => {
    const cex = live.risk_indicators.find((i) => i.indicator_type === "cex-flows")!;
    const concentration = live.reward_indicators.find((i) => i.indicator_type === "concentration-risk")!;
    expect(cex.score).toBe("high");
    expect(concentration.score).toBe("low");
    expect(scoreVocabulary(cex.score)).toBe("severity");
    expect(scoreVocabulary(concentration.score)).toBe("severity");
  });

  it("a bearish row is direction even though it arrives in reward_indicators", () => {
    const momentum = live.reward_indicators.find((i) => i.score === "bearish")!;
    expect(scoreVocabulary(momentum.score)).toBe("direction");
    expect(scoreVocabulary("bullish")).toBe("direction");
    expect(scoreVocabulary("neutral")).toBe("direction");
    // Grouping by array name would have put this beside concentration-risk.
    expect(scoreVocabulary("med")).toBe("severity");
    expect(scoreVocabulary("wat")).toBeNull();
    expect(scoreVocabulary(undefined)).toBeNull();
  });

  it("severity levels fold med and medium together", () => {
    expect(severityLevel("med")).toBe("medium");
    expect(severityLevel("MEDIUM")).toBe("medium");
    expect(severityLevel("high")).toBe("high");
    expect(severityLevel("bearish")).toBeNull();
  });

  it("the epoch last_trigger_on is unknown, never '56 years ago'", () => {
    const cex = live.risk_indicators.find((i) => i.indicator_type === "cex-flows")!;
    expect(cex.last_trigger_on).toBe("1970-01-01");
    expect(indicatorTriggerDate(cex.last_trigger_on)).toBeNull();
    const real = live.risk_indicators.find((i) => i.indicator_type === "btc-reflexivity")!;
    expect(indicatorTriggerDate(real.last_trigger_on)).toBe("2026-09-15T00:00:00.000Z");
    for (const bad of [null, undefined, "", "not a date"]) expect(indicatorTriggerDate(bad)).toBeNull();
  });
});

// --- 1.1.2 token record ---------------------------------------------------------------------

describe("token deployment date", () => {
  it("Nansen's offset-free timestamp is read as UTC, not as the reader's local time", () => {
    const raw = fixture("tokenInformation").data.token_details.token_deployment_date as string;
    expect(raw).toBe("2023-11-20 19:22:43");
    expect(toIsoInstant(raw)).toBe("2023-11-20T19:22:43.000Z");
    expect(toIsoInstant("2023-11-20T19:22:43Z")).toBe("2023-11-20T19:22:43.000Z");
  });

  it("an absent or unparseable date is null, and a future date has no age", () => {
    for (const bad of [null, undefined, "", "soon"]) expect(toIsoInstant(bad)).toBeNull();
    const now = Date.UTC(2026, 8, 20);
    expect(ageInDays("2026-09-10T00:00:00.000Z", now)).toBe(10);
    expect(ageInDays("2026-09-25T00:00:00.000Z", now)).toBeNull();
    expect(ageInDays(null, now)).toBeNull();
  });
});

// --- 1.1.3 buy/sell split gate --------------------------------------------------------------

describe("the 24h split is printed only where a percentage of volume means something", () => {
  it("uses the same activity floor as the flow signals", () => {
    const vol = fixture("tokenInformation").data.spot_metrics.volume_total_usd as number;
    expect(vol).toBeGreaterThan(MIN_VOL24_USD);
    expect(splitIsReadable(vol)).toBe(true);
    expect(splitIsReadable(MIN_VOL24_USD)).toBe(true);
    expect(splitIsReadable(MIN_VOL24_USD - 1)).toBe(false);
    for (const absent of [null, undefined, Number.NaN]) expect(splitIsReadable(absent)).toBe(false);
  });
});

// --- 1.1.4 both sides -----------------------------------------------------------------------

describe("wallets that appear on both recorded pages", () => {
  it("the bot that bought $49,893 and sold $49,844 is tagged from its own row", () => {
    const buyers = fixture("whoBought").data as { address: string; bought_volume_usd: number; sold_volume_usd: number }[];
    const sellers = fixture("whoSold").data as { address: string }[];
    const bot = buyers[1]!;
    expect(bot.bought_volume_usd).toBeCloseTo(49_893.51, 1);
    expect(bot.sold_volume_usd).toBeCloseTo(49_844.62, 1);
    // The two independently ranked pages share no wallet at all here, which is exactly why the
    // tag cannot depend on them overlapping.
    const overlap = bothSidesKeys(buyers, sellers);
    expect(overlap.size).toBe(0);
    expect(tradedBothSides(bot, overlap)).toBe(true);
    // A buy-only wallet (sold 0) is not "both sides".
    const buyOnly = buyers.find((b) => b.sold_volume_usd === 0)!;
    expect(tradedBothSides(buyOnly, overlap)).toBe(false);
  });

  it("page overlap still tags a wallet whose other side is zero on this page", () => {
    const row = { address: "0x1111111111111111111111111111111111111111", bought_volume_usd: 10, sold_volume_usd: 0 };
    expect(tradedBothSides(row)).toBe(false);
    expect(tradedBothSides(row, new Set([row.address]))).toBe(true);
  });

  it("a missing side is unknown, so it can never make the tag fire", () => {
    expect(tradedBothSides({ address: "A", bought_volume_usd: 10, sold_volume_usd: null })).toBe(false);
    expect(tradedBothSides({ address: "A", bought_volume_usd: null, sold_volume_usd: null })).toBe(false);
  });

  it("EVM addresses match case-insensitively; base58 is left exactly as returned", () => {
    const mixed = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
    expect(addressKey(mixed)).toBe(mixed.toLowerCase());
    expect(addressKey("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm")).toBe("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm");
    expect(bothSidesKeys([{ address: mixed }], [{ address: mixed.toUpperCase().replace("0X", "0x") }]).size).toBe(1);
    expect(bothSidesKeys(null, null).size).toBe(0);
  });
});

// --- 1.1.1 price readout --------------------------------------------------------------------

describe("the price readout survives a window the chart refuses to draw", () => {
  const candle = (iso: string, close: number, low = close, high = close) => ({ interval_start: iso, open: close, low, high, close, volume_usd: 1 });

  it("one candle still states a price and a range, with no change", () => {
    const r = priceReadout([candle("2026-09-20T00:00:00Z", 0.185, 0.18, 0.19)]);
    expect(r.priceUsd).toBe(0.185);
    expect(r.changePct).toBeNull();
    expect(r.lowUsd).toBe(0.18);
    expect(r.highUsd).toBe(0.19);
  });

  it("no candles falls back to the token record's price, and to null when there is none", () => {
    expect(priceReadout([], 0.2).priceUsd).toBe(0.2);
    expect(priceReadout(null, null).priceUsd).toBeNull();
    expect(priceReadout(undefined, null).highUsd).toBeNull();
    // Never a zero standing in for a missing price.
    expect(priceReadout([], null).priceUsd).not.toBe(0);
  });

  it("change runs first close to last close in time order, whatever order they arrive in", () => {
    const r = priceReadout([candle("2026-09-20T02:00:00Z", 1.1, 1.0, 1.2), candle("2026-09-20T00:00:00Z", 1.0)]);
    expect(r.priceUsd).toBeCloseTo(1.1, 10);
    expect(r.changePct).toBeCloseTo(10, 10);
    expect(r.lowUsd).toBe(1.0);
    expect(r.highUsd).toBe(1.2);
  });

  it("a zero first close has no percentage change rather than an infinity", () => {
    expect(priceReadout([candle("2026-09-20T00:00:00Z", 0), candle("2026-09-20T01:00:00Z", 1)]).changePct).toBeNull();
  });
});
