import { describe, expect, it } from "vitest";
import {
  annualisedFundingPct,
  fundingPer8h,
  PERP_VENUES,
  PERP_VENUE_IDS,
  perpVenueSymbol,
  venueFunding,
  type PerpVenueId,
} from "../src/perp-venues";

describe("perp venue symbol mapping", () => {
  it("maps a plain coin onto each venue's own contract name", () => {
    expect(perpVenueSymbol("hyperliquid", "BTC")).toBe("BTC");
    expect(perpVenueSymbol("binance", "BTC")).toBe("BTCUSDT");
    expect(perpVenueSymbol("bybit", "BTC")).toBe("BTCUSDT");
    expect(perpVenueSymbol("okx", "BTC")).toBe("BTC-USDT-SWAP");
    expect(perpVenueSymbol("dydx", "BTC")).toBe("BTC-USD");
  });

  it("is case-insensitive about the coin", () => {
    expect(perpVenueSymbol("binance", "eth")).toBe("ETHUSDT");
    expect(perpVenueSymbol("hyperliquid", "hype")).toBe("HYPE");
  });

  it("translates Hyperliquid's k-prefixed 1000x contracts", () => {
    expect(perpVenueSymbol("binance", "kPEPE")).toBe("1000PEPEUSDT");
    expect(perpVenueSymbol("bybit", "kSHIB")).toBe("1000SHIBUSDT");
    expect(perpVenueSymbol("okx", "kBONK")).toBe("1000BONK-USDT-SWAP");
    // Hyperliquid keeps its own name.
    expect(perpVenueSymbol("hyperliquid", "kPEPE")).toBe("kPEPE");
  });

  it("omits a venue that has no name for the coin", () => {
    // dYdX has no 1000x contracts, so a k-coin maps to nothing rather than to a wrong market.
    expect(perpVenueSymbol("dydx", "kPEPE")).toBeNull();
    expect(perpVenueSymbol("binance", "")).toBeNull();
    expect(perpVenueSymbol("binance", "not a coin")).toBeNull();
  });

  it("names every venue in the registry", () => {
    for (const id of PERP_VENUE_IDS) {
      expect(PERP_VENUES[id].name.length).toBeGreaterThan(0);
      expect(PERP_VENUES[id].fundingIntervalHours).toBeGreaterThan(0);
    }
  });
});

describe("funding normalisation", () => {
  it("rebases a per-hour rate onto 8 hours", () => {
    // Hyperliquid quotes funding per hour: 0.00125%/h is 0.01%/8h.
    expect(fundingPer8h(0.0000125, 1)).toBeCloseTo(0.0001, 12);
  });

  it("leaves an 8-hourly rate alone", () => {
    expect(fundingPer8h(0.0001, 8)).toBeCloseTo(0.0001, 12);
  });

  it("rebases a 4-hourly rate", () => {
    expect(fundingPer8h(0.0001, 4)).toBeCloseTo(0.0002, 12);
  });

  it("annualises from the venue's own interval, not from 8h", () => {
    // 0.01% per 8h = 3 payments a day = 10.95% a year.
    expect(annualisedFundingPct(0.0001, 8)).toBeCloseTo(10.95, 6);
    // The same rate paid hourly is 24 payments a day.
    expect(annualisedFundingPct(0.0001, 1)).toBeCloseTo(87.6, 6);
  });

  it("passes nulls through instead of inventing a zero", () => {
    expect(fundingPer8h(null, 8)).toBeNull();
    expect(annualisedFundingPct(null, 8)).toBeNull();
    expect(fundingPer8h(Number.NaN, 8)).toBeNull();
  });

  it("refuses a nonsense interval rather than dividing by zero", () => {
    expect(fundingPer8h(0.0001, 0)).toBeNull();
    expect(annualisedFundingPct(0.0001, -1)).toBeNull();
  });
});

describe("venueFunding", () => {
  it("normalises a raw rate against the venue's own interval", () => {
    const hl = venueFunding("hyperliquid", 0.0000125);
    expect(hl.intervalHours).toBe(1);
    expect(hl.per8h).toBeCloseTo(0.0001, 12);
    expect(hl.annualPct).toBeCloseTo(10.95, 6);

    const binance = venueFunding("binance", 0.0001);
    expect(binance.intervalHours).toBe(8);
    expect(binance.per8h).toBeCloseTo(0.0001, 12);
    expect(binance.annualPct).toBeCloseTo(10.95, 6);
  });

  it("accepts an interval the venue reported for this market", () => {
    // Binance moves volatile markets to 4h funding; the payload says so and we believe it.
    const f = venueFunding("binance", 0.0001, 4);
    expect(f.intervalHours).toBe(4);
    expect(f.per8h).toBeCloseTo(0.0002, 12);
  });

  it("keeps a missing rate missing", () => {
    const f = venueFunding("okx" as PerpVenueId, null);
    expect(f.per8h).toBeNull();
    expect(f.annualPct).toBeNull();
    expect(f.raw).toBeNull();
  });
});
