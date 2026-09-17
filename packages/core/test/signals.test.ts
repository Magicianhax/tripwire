import { describe, expect, it } from "vitest";
import type { FlowRow, IndicatorsResp, NetflowRow, PerpPosition, PerpScreenerRow, PmHolder } from "../src/nansen-types";
import { spotDerived, spotSignals, type SpotSignalInput } from "../src/signals/spot";
import { perpSignals } from "../src/signals/perp";
import { predictionSignals, provenWinnerSplit } from "../src/signals/prediction";
import { evaluate } from "../src/rules/evaluate";
import { PRESETS } from "../src/rules/presets";
import type { Verdict } from "../src/types";

const netflow = (net24: number, traders: number): NetflowRow => ({
  token_address: "x",
  token_symbol: "X",
  net_flow_1h_usd: 0,
  net_flow_24h_usd: net24,
  net_flow_7d_usd: 0,
  net_flow_30d_usd: 0,
  trader_count: traders,
});

const flow = (o: Partial<FlowRow>): FlowRow => ({
  smart_trader_net_flow_usd: 0,
  smart_trader_wallet_count: 1,
  smart_trader_avg_flow_usd: 400_000,
  whale_net_flow_usd: 0,
  whale_wallet_count: 1,
  whale_avg_flow_usd: 400_000,
  public_figure_net_flow_usd: 0,
  public_figure_wallet_count: 1,
  public_figure_avg_flow_usd: 400_000,
  top_pnl_net_flow_usd: 0,
  top_pnl_wallet_count: 1,
  exchange_net_flow_usd: 0,
  fresh_wallets_net_flow_usd: 0,
  fresh_wallets_wallet_count: 0,
  ...o,
});
const get = (s: { id: string }[], id: string) => s.find((x) => x.id === id) as any;

/** A token with 10M 24h volume and enough labeled turnover to clear every activity guard. */
const liquid = (o: Partial<SpotSignalInput> = {}) => ({ vol24: 10_000_000, priceChange7dPct: 0, ...o });

describe("spotSignals", () => {
  it("labeled_exit_pct is labeled net flow as a share of 24h volume", () => {
    const s = spotSignals(
      liquid({ flow: flow({ smart_trader_net_flow_usd: -400_000, whale_net_flow_usd: -100_000, public_figure_net_flow_usd: 50_000, fresh_wallets_net_flow_usd: 600_000 }) }),
    );
    // −$450K of $10M
    expect(get(s, "labeled_exit_pct").value).toBeCloseTo(-4.5, 6);
    expect(get(s, "labeled_exit_pct").label).toContain("4.5% of 24h volume");
    expect(get(s, "labeled_exit_pct").label).toContain("$450K of $10M");
    expect(get(s, "labeled_exit_pct").severity).toBe("high");
  });

  it("the same dollar exit is a small percentage on a deep market and a large one on a thin market", () => {
    const f = flow({ whale_net_flow_usd: -100_000, whale_avg_flow_usd: 100_000, whale_wallet_count: 5, fresh_wallets_net_flow_usd: 1 });
    expect(get(spotSignals({ flow: f, vol24: 35_600_000 }), "labeled_exit_pct").value).toBeCloseTo(-0.281, 3);
    expect(get(spotSignals({ flow: f, vol24: 1_000_000 }), "labeled_exit_pct").value).toBeCloseTo(-10, 6);
  });

  it("treats a null segment with zero wallets as 0, and a null flow object as unavailable", () => {
    const s = spotSignals(liquid({ flow: flow({ smart_trader_net_flow_usd: null, smart_trader_wallet_count: 0, whale_net_flow_usd: -100_000, whale_wallet_count: 5 }) }));
    expect(get(s, "labeled_exit_pct").value).toBeCloseTo(-1, 6);
    expect(get(spotSignals(liquid({ flow: null })), "labeled_exit_pct").value).toBeNull();
  });

  it("labeled_exit_pct is unavailable (null) when all three labeled segments are missing", () => {
    const s = spotSignals(
      liquid({
        flow: flow({
          smart_trader_net_flow_usd: null,
          smart_trader_wallet_count: null,
          whale_net_flow_usd: null,
          whale_wallet_count: null,
          public_figure_net_flow_usd: null,
          public_figure_wallet_count: null,
        }),
      }),
    );
    expect(get(s, "labeled_exit_pct").value).toBeNull();
    expect(get(s, "distribution_pct").value).toBeNull();
  });

  describe("an endpoint that answered with nothing versus one that failed", () => {
    it("a token Nansen reports no 24h volume for falls to the volume guard, not to UNCHECKED", () => {
      const s = spotSignals({ flow: flow({ whale_net_flow_usd: -500_000 }), vol24: null, netflow: netflow(-500_000, 20), priceChange7dPct: -2, chain: "base" });
      for (const id of ["labeled_exit_pct", "distribution_pct", "sm_netflow_pct"]) expect(get(s, id).value, id).toBe(0);
      expect(get(s, "labeled_exit_pct").label).toMatch(/Not enough labeled trading to judge/);
    });

    it("a failed token-information call is UNCHECKED, and names the endpoint and the chain", () => {
      const s = spotSignals({ flow: flow({ whale_net_flow_usd: -500_000 }), vol24: null, netflow: netflow(-500_000, 20), failed: { market: true }, chain: "base" });
      for (const id of ["labeled_exit_pct", "distribution_pct", "sm_netflow_pct"]) expect(get(s, id).value, id).toBeNull();
      expect(get(s, "labeled_exit_pct").label).toBe("Nansen 24h volume unavailable for this token on base, so flows can't be sized");
    });

    it("a failed flow call is UNCHECKED, and names the endpoint and the chain", () => {
      const s = spotSignals({ flow: null, vol24: 10_000_000, failed: { flow: true }, chain: "base" });
      expect(get(s, "labeled_exit_pct").value).toBeNull();
      expect(get(s, "labeled_exit_pct").label).toBe("Nansen flow data unavailable for this token on base");
      expect(get(s, "distribution_pct").label).toBe("Nansen flow data unavailable for this token on base");
    });

    it("a failed Smart Money netflow call names that endpoint, and leaves the flow signals alone", () => {
      const s = spotSignals(liquid({ flow: flow({ whale_net_flow_usd: -500_000, whale_wallet_count: 5 }), failed: { netflow: true }, chain: "base" }));
      expect(get(s, "sm_netflow_pct").value).toBeNull();
      expect(get(s, "sm_netflow_pct").label).toBe("Nansen Smart Money netflow unavailable for this token on base");
      expect(get(s, "labeled_exit_pct").value).not.toBeNull();
    });

    it("a token with no Nansen coverage at all says exactly that, on every signal it affects", () => {
      // Every call answered; none of them had anything. This is the jumper/WBTC shape: a
      // resolvable target that Nansen simply does not index on that chain.
      const s = spotSignals({ flow: null, netflow: null, vol24: null, chain: "base" });
      for (const id of ["labeled_exit_pct", "distribution_pct", "sm_netflow_pct", "drawdown_pct"]) {
        expect(get(s, id).value, id).toBeNull();
        expect(get(s, id).label, id).toBe("Nansen has no coverage for this token on base");
      }
    });

    it("null volume with null flow segments degrades to the guards rather than reporting nothing", () => {
      const s = spotSignals({
        flow: flow({
          smart_trader_net_flow_usd: null,
          smart_trader_wallet_count: null,
          whale_net_flow_usd: null,
          whale_wallet_count: null,
          public_figure_net_flow_usd: null,
          public_figure_wallet_count: null,
        }),
        netflow: netflow(0, 0),
        vol24: null,
        priceChange24hPct: 0,
        chain: "base",
      });
      // The flow row exists, so this is "no labeled wallet traded it", not "we could not look".
      expect(get(s, "labeled_exit_pct").value).toBeNull();
      expect(get(s, "labeled_exit_pct").label).not.toMatch(/no data/i);
      expect(get(s, "drawdown_pct").value).toBe(0);
    });

    it("a token with no candles yet has not fallen, and says so", () => {
      const s = spotSignals(liquid({ flow: flow({}), priceChange7dPct: null, priceChange24hPct: null, chain: "base" }));
      expect(get(s, "drawdown_pct").value).toBe(0);
      expect(get(s, "drawdown_pct").label).toBe("No price history for this token on base yet");
    });

    it("a failed ohlcv call leaves the drawdown unavailable", () => {
      const s = spotSignals(liquid({ flow: flow({}), priceChange7dPct: null, priceChange24hPct: null, failed: { price: true }, chain: "base" }));
      expect(get(s, "drawdown_pct").value).toBeNull();
      expect(get(s, "drawdown_pct").label).toBe("Nansen price history unavailable for this token on base");
    });

    it("never reports a gap as a bare \"no data\"", () => {
      const cases = [
        spotSignals({ flow: null, netflow: null, vol24: null, chain: "base" }),
        spotSignals({ flow: null, vol24: 1, failed: { flow: true }, chain: "solana" }),
        spotSignals({ flow: flow({}), vol24: null, failed: { market: true }, chain: "ethereum" }),
      ];
      for (const signals of cases) for (const s of signals) expect(s.label, s.id).not.toMatch(/^no data$|: no data/i);
    });
  });

  describe("activity guards yield 0 (CLEAR), not null (UNCHECKED)", () => {
    it("a token below the volume floor", () => {
      const s = spotSignals({ flow: flow({ whale_net_flow_usd: -50_000, whale_avg_flow_usd: 50_000, whale_wallet_count: 9 }), vol24: 100_000, netflow: netflow(-5_000, 20) });
      expect(get(s, "labeled_exit_pct").value).toBe(0);
      expect(get(s, "distribution_pct").value).toBe(0);
      expect(get(s, "sm_netflow_pct").value).toBe(0);
      expect(get(s, "labeled_exit_pct").label).toMatch(/Not enough labeled trading to judge/);
    });

    it("labeled segments that moved under 0.5% of volume", () => {
      const s = spotSignals(liquid({ flow: flow({ whale_net_flow_usd: -20_000, whale_avg_flow_usd: 4_000, whale_wallet_count: 5, smart_trader_avg_flow_usd: 0, public_figure_avg_flow_usd: 0 }) }));
      expect(get(s, "labeled_exit_pct").value).toBe(0); // $20K gross of $10M is 0.2%
    });

    it("fewer than 3 labeled wallets", () => {
      const s = spotSignals(
        liquid({ flow: flow({ whale_net_flow_usd: -500_000, whale_avg_flow_usd: 500_000, whale_wallet_count: 2, smart_trader_wallet_count: 0, public_figure_wallet_count: 0 }) }),
      );
      expect(get(s, "labeled_exit_pct").value).toBe(0);
      expect(get(s, "labeled_exit_pct").label).toContain("2 wallets");
    });

    it("fewer than 5 labeled wallets blocks distribution but still warns on the exit", () => {
      const f = flow({
        whale_net_flow_usd: -500_000,
        whale_avg_flow_usd: 200_000,
        whale_wallet_count: 4,
        smart_trader_wallet_count: 0,
        public_figure_wallet_count: 0,
        fresh_wallets_net_flow_usd: 2_000_000,
      });
      const s = spotSignals(liquid({ flow: f }));
      expect(get(s, "labeled_exit_pct").value).toBeCloseTo(-5, 6);
      expect(get(s, "distribution_pct").value).toBe(0);
    });

    it("fewer than 3 Smart Money traders", () => {
      const s = spotSignals(liquid({ flow: flow({ whale_net_flow_usd: -100_000 }), netflow: netflow(-400_000, 2) }));
      expect(get(s, "sm_netflow_pct").value).toBe(0);
      expect(get(s, "sm_netflow_pct").label).toMatch(/Not enough Smart Money trading/);
    });
  });

  it("distribution_pct only fires when fresh wallets absorb at least 1x the labeled exit", () => {
    const base = { whale_net_flow_usd: -500_000, whale_avg_flow_usd: 200_000, whale_wallet_count: 6, smart_trader_wallet_count: 0, public_figure_wallet_count: 0 };
    const absorbed = spotSignals(liquid({ flow: flow({ ...base, fresh_wallets_net_flow_usd: 1_400_000 }) }));
    expect(get(absorbed, "distribution_pct").value).toBeCloseTo(-5, 6);
    expect(get(absorbed, "distribution_pct").label).toContain("fresh wallets bought 2.8x that");

    // Fresh wallets bought less than the labeled wallets sold: an exit, but not exit liquidity.
    const thin = spotSignals(liquid({ flow: flow({ ...base, fresh_wallets_net_flow_usd: 200_000 }) }));
    expect(get(thin, "distribution_pct").value).toBe(0);
    expect(get(thin, "labeled_exit_pct").value).toBeCloseTo(-5, 6);

    // Fresh-wallet inflow below 0.5% of volume is noise, not the other side of the trade.
    const noise = spotSignals(liquid({ flow: flow({ ...base, fresh_wallets_net_flow_usd: 10_000 }) }));
    expect(get(noise, "distribution_pct").value).toBe(0);
  });

  it("distribution_pct is 0 when labeled wallets are net buyers", () => {
    const s = spotSignals(liquid({ flow: flow({ whale_net_flow_usd: 500_000, whale_avg_flow_usd: 200_000, whale_wallet_count: 6, fresh_wallets_net_flow_usd: 900_000 }) }));
    expect(get(s, "distribution_pct").value).toBe(0);
    expect(get(s, "labeled_exit_pct").label).toContain("net bought");
  });

  it("sm_netflow_pct is Smart Money's 24h netflow as a share of volume", () => {
    const s = spotSignals(liquid({ flow: flow({ whale_net_flow_usd: -100_000 }), netflow: netflow(-400_000, 12) }));
    expect(get(s, "sm_netflow_pct").value).toBeCloseTo(-4, 6);
    expect(get(s, "sm_netflow_pct").label).toContain("Smart Money sold 4% of 24h volume ($400K of $10M), 12 traders");
    // No netflow row at all: nobody traded it, which the trader-count guard reads as 0.
    expect(get(spotSignals(liquid({ flow: flow({}) })), "sm_netflow_pct").value).toBe(0);
  });

  it("drawdown_pct prefers the 7d change and falls back to 24h", () => {
    expect(get(spotSignals({ priceChange7dPct: -75, priceChange24hPct: 4 }), "drawdown_pct").value).toBe(-75);
    expect(get(spotSignals({ priceChange7dPct: -75 }), "drawdown_pct").label).toBe("Price is down 75% in 7 days");
    expect(get(spotSignals({ priceChange24hPct: -98 }), "drawdown_pct").label).toBe("Price is down 98% in 24 hours");
    expect(get(spotSignals({}), "drawdown_pct").value).toBeNull();
  });

  it("risk_high_count counts high risk indicators", () => {
    const ind: IndicatorsResp = {
      risk_indicators: [
        { indicator_type: "concentration-risk", score: "high", signal: 1, signal_percentile: 90 },
        { indicator_type: "liquidity-risk", score: "high", signal: 1, signal_percentile: 95 },
        { indicator_type: "btc-reflexivity", score: "low", signal: 0, signal_percentile: 5 },
      ],
      reward_indicators: [],
    };
    expect(get(spotSignals({ indicators: ind }), "risk_high_count").value).toBe(2);
    expect(get(spotSignals({ indicators: null }), "risk_high_count").value).toBeNull();
  });

  it("risk_high_count ignores cex-flows and btc-reflexivity, the only types Nansen ever scores high here", () => {
    const ind: IndicatorsResp = {
      risk_indicators: [
        { indicator_type: "btc-reflexivity", score: "high", signal: 1, signal_percentile: 99 },
        { indicator_type: "cex-flows", score: "high", signal: 1, signal_percentile: 99 },
      ],
      reward_indicators: [],
    };
    expect(get(spotSignals({ indicators: ind }), "risk_high_count").value).toBe(0);
  });

  it("risk_high_count also scans reward_indicators (live API mixes them)", () => {
    const ind: IndicatorsResp = { risk_indicators: [], reward_indicators: [{ indicator_type: "concentration-risk", score: "high", signal: 1, signal_percentile: 99 }] };
    expect(get(spotSignals({ indicators: ind }), "risk_high_count").value).toBe(1);
  });

  it("author_holds_token only present when author given", () => {
    expect(get(spotSignals({}), "author_holds_token")).toBeUndefined();
    const s = spotSignals({ author: { entity: "Some Figure", valueUsd: 12_000 } });
    expect(get(s, "author_holds_token").value).toBe(12_000);
    expect(get(s, "author_holds_token").severity).toBe("info");
  });

  it("spotDerived exposes the dollars and the absorption ratio behind the percentages", () => {
    const d = spotDerived(liquid({ flow: flow({ whale_net_flow_usd: -500_000, whale_avg_flow_usd: 200_000, whale_wallet_count: 6, fresh_wallets_net_flow_usd: 1_400_000 }) }));
    expect(d.labeledUsd).toBe(-500_000);
    expect(d.labeledWallets).toBe(8);
    expect(d.absorption).toBeCloseTo(2.8, 6);
    expect(d.minActivity).toBe(true);
  });
});

// --- The 37-token calibration sample (docs/CALIBRATION.md) --------------------------------
//
// Each row is built from that document's own derived table (T2), so the signals under test are
// exactly the numbers the recalibration was argued from, and the expected verdicts are the
// "proposed" columns of §5. If a threshold is ever nudged, this table is what breaks.

type CalToken = {
  token: string;
  tier: "large" | "mid" | "fresh" | "dumped";
  /** 24h volume in USD (T1). */
  vol: number;
  /** Labeled net flow, labeled gross turnover and fresh net flow, each as a % of `vol` (T2). */
  labeledPct: number;
  grossPct: number;
  freshPct: number;
  /** Labeled wallet count (T1 "Lab wallets"). */
  wallets: number;
  /** Smart Money 24h netflow as a % of `vol`, and its trader count (T2, T1). */
  smPct: number;
  traders: number;
  /** 7d price change, else 24h (T2 "drawdown %"). */
  drawdown: number;
  expect: { degen: Verdict; balanced: Verdict; paranoid: Verdict };
};

const M = 1_000_000;

const CALIBRATION: CalToken[] = [
  { token: "WIF", tier: "large", vol: 1.4 * M, labeledPct: -0.54, grossPct: 2.28, freshPct: 42.4, wallets: 18, smPct: -0.04, traders: 17, drawdown: -3, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CAUTION" } },
  { token: "FARTCOIN", tier: "large", vol: 2.0 * M, labeledPct: -14.49, grossPct: 10.0, freshPct: 39.9, wallets: 17, smPct: -0.01, traders: 60, drawdown: 3, expect: { degen: "TRIPWIRE", balanced: "TRIPWIRE", paranoid: "TRIPWIRE" } },
  { token: "PUMP", tier: "large", vol: 35.6 * M, labeledPct: -0.59, grossPct: 12.86, freshPct: 78.2, wallets: 102, smPct: 0.03, traders: 187, drawdown: 0, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CAUTION" } },
  { token: "HYPE", tier: "large", vol: 33.4 * M, labeledPct: -0.53, grossPct: 2.14, freshPct: 11.2, wallets: 31, smPct: -0.09, traders: 122, drawdown: 1, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CAUTION" } },
  { token: "ZEC", tier: "large", vol: 27.8 * M, labeledPct: -0.11, grossPct: 13.86, freshPct: 18.0, wallets: 136, smPct: 0.07, traders: 262, drawdown: 21, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "UNI", tier: "large", vol: 23.5 * M, labeledPct: -2.44, grossPct: 1.6, freshPct: 45.0, wallets: 4, smPct: -0.2, traders: 12, drawdown: 28, expect: { degen: "CLEAR", balanced: "CAUTION", paranoid: "CAUTION" } },
  { token: "LINK", tier: "large", vol: 9.3 * M, labeledPct: 4.73, grossPct: 1.05, freshPct: 15.6, wallets: 3, smPct: -0.03, traders: 5, drawdown: -2, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "AAVE", tier: "large", vol: 6.3 * M, labeledPct: 0, grossPct: 0, freshPct: 153.3, wallets: 0, smPct: 0, traders: 6, drawdown: 4, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "USELESS", tier: "mid", vol: 16.4 * M, labeledPct: -0.62, grossPct: 9.67, freshPct: 40.2, wallets: 36, smPct: -0.01, traders: 83, drawdown: 10, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CAUTION" } },
  { token: "STONK", tier: "mid", vol: 41.7 * M, labeledPct: 1.38, grossPct: 65.87, freshPct: 31.6, wallets: 133, smPct: 0.29, traders: 308, drawdown: 10, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "BRETT", tier: "mid", vol: 355_000, labeledPct: 0, grossPct: 0, freshPct: 0, wallets: 0, smPct: 0, traders: 1, drawdown: -1, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "PAID", tier: "fresh", vol: 29.5 * M, labeledPct: 1.95, grossPct: 86.23, freshPct: 23.9, wallets: 78, smPct: 1.34, traders: 56, drawdown: 143, expect: { degen: "CLEAR", balanced: "CLEAR", paranoid: "CLEAR" } },
  { token: "HYPED", tier: "dumped", vol: 10.7 * M, labeledPct: -0.11, grossPct: 1.84, freshPct: 0, wallets: 51, smPct: -0.12, traders: 13, drawdown: -98, expect: { degen: "CAUTION", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
  { token: "LOCKINU", tier: "dumped", vol: 1.4 * M, labeledPct: -0.5, grossPct: 4.58, freshPct: 0, wallets: 9, smPct: -0.01, traders: 5, drawdown: -67, expect: { degen: "CLEAR", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
  { token: "LOOM", tier: "dumped", vol: 571_000, labeledPct: 2.17, grossPct: 4.06, freshPct: 0, wallets: 7, smPct: -0.06, traders: 45, drawdown: -75, expect: { degen: "CLEAR", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
  { token: "OTC", tier: "dumped", vol: 1.5 * M, labeledPct: 5.99, grossPct: 5.13, freshPct: 20.5, wallets: 9, smPct: 0.33, traders: 86, drawdown: -57, expect: { degen: "CLEAR", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
  { token: "LAPTOP", tier: "dumped", vol: 2.1 * M, labeledPct: 0.19, grossPct: 0.26, freshPct: 321.9, wallets: 1, smPct: 0.19, traders: 33, drawdown: -82, expect: { degen: "CAUTION", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
  { token: "SPIRAL", tier: "dumped", vol: 10_000, labeledPct: -4.53, grossPct: 12.29, freshPct: 0, wallets: 1, smPct: 0, traders: 18, drawdown: -55, expect: { degen: "CLEAR", balanced: "CAUTION", paranoid: "TRIPWIRE" } },
];

function calibrationInput(t: CalToken): SpotSignalInput {
  const labeled = (t.labeledPct / 100) * t.vol;
  const grossUsd = (t.grossPct / 100) * t.vol;
  return {
    // The whole labeled flow is filed under one segment: the signals sum the three, so the
    // split between them never changes a result.
    flow: {
      smart_trader_net_flow_usd: 0,
      smart_trader_wallet_count: 0,
      smart_trader_avg_flow_usd: 0,
      whale_net_flow_usd: labeled,
      whale_wallet_count: t.wallets,
      whale_avg_flow_usd: t.wallets > 0 ? grossUsd / t.wallets : 0,
      public_figure_net_flow_usd: 0,
      public_figure_wallet_count: 0,
      public_figure_avg_flow_usd: 0,
      top_pnl_net_flow_usd: 0,
      top_pnl_wallet_count: 0,
      exchange_net_flow_usd: 0,
      fresh_wallets_net_flow_usd: (t.freshPct / 100) * t.vol,
      fresh_wallets_wallet_count: 0,
    },
    netflow: netflow((t.smPct / 100) * t.vol, t.traders),
    // Measured on 5 tokens in the spike and 0 on all of them; no shipped preset reads it.
    indicators: { risk_indicators: [], reward_indicators: [] },
    vol24: t.vol,
    priceChange7dPct: t.drawdown,
  };
}

describe("calibration sample verdicts (docs/CALIBRATION.md §5)", () => {
  for (const t of CALIBRATION) {
    it(`${t.token} (${t.tier})`, () => {
      const signals = spotSignals(calibrationInput(t));
      // No signal may be unavailable: an UNCHECKED here would mean the recalibration turned a
      // measurable token into an unverifiable one.
      expect(signals.filter((s) => s.value === null).map((s) => s.id)).toEqual([]);
      for (const preset of ["degen", "balanced", "paranoid"] as const) {
        expect(evaluate(PRESETS[preset], signals, "spot").verdict, `${t.token} on ${preset}`).toBe(t.expect[preset]);
      }
    });
  }

  it("nothing in the sample is UNCHECKED, and the three examples from the bug report are not blocked", () => {
    const verdict = (token: string, preset: "degen" | "balanced" | "paranoid") => {
      const t = CALIBRATION.find((x) => x.token === token)!;
      return evaluate(PRESETS[preset], spotSignals(calibrationInput(t)), "spot").verdict;
    };
    for (const token of ["HYPE", "ZEC", "WIF"]) {
      expect(verdict(token, "balanced"), token).toBe("CLEAR");
      expect(verdict(token, "paranoid"), token).not.toBe("TRIPWIRE");
    }
    // The one genuine distribution event in the sample still blocks on every preset.
    for (const preset of ["degen", "balanced", "paranoid"] as const) expect(verdict("FARTCOIN", preset)).toBe("TRIPWIRE");
  });

  it("a quiet token is CLEAR, not UNCHECKED", () => {
    const brett = CALIBRATION.find((t) => t.token === "BRETT")!;
    const signals = spotSignals(calibrationInput(brett));
    expect(evaluate(PRESETS.balanced, signals, "spot").unavailable).toEqual([]);
    expect(evaluate(PRESETS.balanced, signals, "spot").verdict).toBe("CLEAR");
  });

  it("a failed evidence fetch is still UNCHECKED, never CLEAR", () => {
    const signals = spotSignals({ flow: null, netflow: null, indicators: null, vol24: null });
    const { verdict, unavailable } = evaluate(PRESETS.balanced, signals, "spot");
    expect(verdict).toBe("UNCHECKED");
    expect(unavailable).toContain("labeled_exit_pct");
  });
});

const screener = (longs: number, shorts: number): PerpScreenerRow => ({
  token_symbol: "ETH",
  mark_price: 2400,
  funding: 0.00001,
  open_interest: 1,
  current_smart_money_position_longs_usd: longs,
  current_smart_money_position_shorts_usd: shorts,
  smart_money_longs_count: 5,
  smart_money_shorts_count: 3,
});
const pos = (side: "Long" | "Short", value: number, liq: number | null): PerpPosition => ({
  address: "0x1", address_label: "Smart Trader", side, position_value_usd: value, leverage: "5x", entry_price: 2400, mark_price: 2400, liquidation_price: liq, upnl_usd: 0,
});

describe("perpSignals", () => {
  it("sm_opposite_side_pct for a long", () => {
    const s = perpSignals({ side: "long", screener: screener(4_200_000, -1_800_000) });
    expect(get(s, "sm_opposite_side_pct").value).toBe(30);
  });
  it("sm_opposite_side_pct for a short", () => {
    const s = perpSignals({ side: "short", screener: screener(4_200_000, -1_800_000) });
    expect(get(s, "sm_opposite_side_pct").value).toBe(70);
  });
  it("sm_opposite_side_pct null without side or totals", () => {
    expect(get(perpSignals({ screener: screener(1, -1) }), "sm_opposite_side_pct").value).toBeNull();
    expect(get(perpSignals({ side: "long", screener: screener(0, 0) }), "sm_opposite_side_pct").value).toBeNull();
  });
  it("inside_liq_band sums positions liquidating within 3% of mark", () => {
    const s = perpSignals({
      side: "long",
      markPrice: 1000,
      positions: [pos("Long", 500_000, 971), pos("Short", 300_000, 1029), pos("Long", 900_000, 969), pos("Long", 1, null)],
    });
    expect(get(s, "inside_liq_band").value).toBe(800_000);
  });
  it("inside_liq_band null without mark or positions", () => {
    expect(get(perpSignals({ positions: [pos("Long", 1, 1)] }), "inside_liq_band").value).toBeNull();
  });
});

const holder = (side: string, size: number, price: number, owner: string): PmHolder => ({
  market_id: "1", address: owner, owner_address: "0x", side, position_size: size, avg_entry_price: price, current_price: price, unrealized_pnl_usd: 0,
});

describe("predictionSignals", () => {
  it("everyone proven on NO and user buys YES -> 100", () => {
    const s = predictionSignals({
      outcome: "yes",
      holders: [holder("No", 1000, 0.5, "a"), holder("No", 500, 0.5, "b")],
      pnl: { a: 50_000, b: 1_000 },
    });
    expect(get(s, "smart_side_disagrees").value).toBe(100);
  });
  it("losing traders carry no weight", () => {
    const s = predictionSignals({
      outcome: "yes",
      holders: [holder("No", 1000, 0.5, "a"), holder("Yes", 1000, 0.5, "b")],
      pnl: { a: -90_000, b: 9_000 },
    });
    expect(get(s, "smart_side_disagrees").value).toBe(0);
  });
  it("null without outcome, holders, or any proven holders", () => {
    expect(get(predictionSignals({ holders: [holder("No", 1, 1, "a")], pnl: {} }), "smart_side_disagrees").value).toBeNull();
    expect(get(predictionSignals({ outcome: "no", holders: [], pnl: {} }), "smart_side_disagrees").value).toBeNull();
    expect(get(predictionSignals({ outcome: "no", holders: [holder("No", 1, 1, "a")], pnl: { a: -1 } }), "smart_side_disagrees").value).toBeNull();
  });
  it("only Yes/No holders count: other outcome sides are ignored", () => {
    const s = predictionSignals({
      outcome: "yes",
      holders: [holder("No", 1000, 0.5, "a"), holder("Up", 100_000, 0.5, "b"), holder("YES", 1000, 0.5, "c")],
      pnl: { a: 10_000, b: 10_000, c: 10_000 },
    });
    expect(get(s, "smart_side_disagrees").value).toBe(50);
  });
  it("null when the only proven winners hold a non Yes/No side", () => {
    const s = predictionSignals({ outcome: "no", holders: [holder("Down", 1000, 0.5, "a")], pnl: { a: 10_000 } });
    expect(get(s, "smart_side_disagrees").value).toBeNull();
  });
});

describe("provenWinnerSplit", () => {
  it("weights Yes/No stakes by positive PnL and skips losers and other sides", () => {
    const holders = [holder("Yes", 100, 0.5, "a"), holder("no", 100, 0.5, "b"), holder("Up", 100, 0.5, "c"), holder("No", 100, 0.5, "d")];
    const pnl: Record<string, number> = { a: 2, b: 1, c: 5, d: -3 };
    expect(provenWinnerSplit(holders, (h) => pnl[h.address])).toEqual({ yes: 100, no: 50, proven: 2 });
  });
});
