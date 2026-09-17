import { perpSignals, type PerpPosition, type PerpScreenerRow, type PerpTarget, type PerpTrade, type Signal } from "@tripwire/core";
import { nansen } from "../nansen/endpoints";
import { settle } from "./util";

export type PerpPanel = {
  coin: string;
  screener: PerpScreenerRow | null;
  positions: PerpPosition[] | null;
  trades: PerpTrade[] | null;
  errors: string[];
};

export async function buildPerpIntel(t: PerpTarget, mode: "chip" | "panel"): Promise<{ signals: Signal[]; panel: PerpPanel }> {
  const coin = t.coin.toUpperCase();
  const [screener, positions, trades] = await Promise.all([
    settle(nansen.perpScreener(coin), (d) => d.data?.find((r) => r.token_symbol?.toUpperCase() === coin) ?? d.data?.[0]),
    settle(nansen.perpPositions(coin), (d) => d.data),
    mode === "panel" ? settle(nansen.smPerpTrades(coin), (d) => d.data) : Promise.resolve(null),
  ]);
  const markPrice = screener.value?.mark_price ?? positions.value?.[0]?.mark_price ?? null;
  return {
    signals: perpSignals({ side: t.side, screener: screener.value, positions: positions.value, markPrice }),
    panel: {
      coin,
      screener: screener.value,
      positions: positions.value,
      trades: trades?.value ?? null,
      errors: [screener.error, positions.error, trades?.error].filter((e): e is string => !!e),
    },
  };
}
