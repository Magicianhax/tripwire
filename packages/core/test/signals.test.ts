import { describe, expect, it } from "vitest";
import type { FlowRow, IndicatorsResp, PerpPosition, PerpScreenerRow, PmHolder } from "../src/nansen-types";
import { spotSignals } from "../src/signals/spot";
import { perpSignals } from "../src/signals/perp";
import { predictionSignals, provenWinnerSplit } from "../src/signals/prediction";

const flow = (o: Partial<FlowRow>): FlowRow => ({
  smart_trader_net_flow_usd: 0,
  smart_trader_wallet_count: 1,
  whale_net_flow_usd: 0,
  whale_wallet_count: 1,
  public_figure_net_flow_usd: 0,
  public_figure_wallet_count: 1,
  top_pnl_net_flow_usd: 0,
  top_pnl_wallet_count: 1,
  exchange_net_flow_usd: 0,
  fresh_wallets_net_flow_usd: 0,
  fresh_wallets_wallet_count: 1,
  ...o,
});
const get = (s: { id: string }[], id: string) => s.find((x) => x.id === id) as any;

describe("spotSignals", () => {
  it("exit_pressure sums labeled segments and fires warn when fresh wallets buy", () => {
    const s = spotSignals({
      flow: flow({ smart_trader_net_flow_usd: -400_000, whale_net_flow_usd: -100_000, public_figure_net_flow_usd: 50_000, fresh_wallets_net_flow_usd: 600_000 }),
    });
    const ep = get(s, "exit_pressure");
    expect(ep.value).toBe(-450_000);
    expect(ep.severity).toBe("high");
    expect(ep.evidence.length).toBeGreaterThan(0);
  });

  it("treats null segment with zero wallets as 0, null flow object as unavailable", () => {
    const s = spotSignals({ flow: flow({ smart_trader_net_flow_usd: null, smart_trader_wallet_count: 0, whale_net_flow_usd: -10 }) });
    expect(get(s, "exit_pressure").value).toBe(-10);
    expect(get(spotSignals({ flow: null }), "exit_pressure").value).toBeNull();
  });

  it("fresh_buy_share is null when fresh data missing (sub-1d windows)", () => {
    const s = spotSignals({ flow: flow({ fresh_wallets_net_flow_usd: null, fresh_wallets_wallet_count: null, whale_net_flow_usd: 100 }) });
    expect(get(s, "fresh_buy_share").value).toBeNull();
  });

  it("fresh_buy_share is share of positive inflow", () => {
    const s = spotSignals({ flow: flow({ fresh_wallets_net_flow_usd: 800, whale_net_flow_usd: 200, smart_trader_net_flow_usd: -500 }) });
    expect(get(s, "fresh_buy_share").value).toBe(80);
  });

  it("fresh_buy_share null when no positive inflow at all", () => {
    const s = spotSignals({ flow: flow({ smart_trader_net_flow_usd: -5 }) });
    expect(get(s, "fresh_buy_share").value).toBeNull();
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

  it("risk_high_count also scans reward_indicators (live API mixes them)", () => {
    const ind: IndicatorsResp = { risk_indicators: [], reward_indicators: [{ indicator_type: "concentration-risk", score: "high", signal: 1, signal_percentile: 99 }] };
    expect(get(spotSignals({ indicators: ind }), "risk_high_count").value).toBe(1);
  });

  it("sm_netflow_24h passes through", () => {
    const s = spotSignals({ netflow: { token_address: "x", token_symbol: "X", net_flow_1h_usd: 1, net_flow_24h_usd: -75_000, net_flow_7d_usd: 0, net_flow_30d_usd: 0 } });
    expect(get(s, "sm_netflow_24h").value).toBe(-75_000);
  });

  it("author_holds_token only present when author given", () => {
    expect(get(spotSignals({}), "author_holds_token")).toBeUndefined();
    const s = spotSignals({ author: { entity: "Some Figure", valueUsd: 12_000 } });
    expect(get(s, "author_holds_token").value).toBe(12_000);
    expect(get(s, "author_holds_token").severity).toBe("info");
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
