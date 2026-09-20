import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { toIsoInstant } from "@tripwire/core";

export type PublicBriefMarket = {
  id: string; symbol: string; name: string; chain: string; address: string; nansenUrl: string;
  priceUsd: number | null; change24hPct: number | null; volume24hUsd: number | null; marketCapUsd: number | null;
  flows: { label: string; valueUsd: number | null }[];
  candles: { timestamp: number; close: number }[];
  analysis: { title: string; body: string }; updatedAt: number | null;
};
export type PublicBrief = {
  state: "ready" | "stale" | "unavailable" | "sample";
  asOf: number | null; refreshAfter: number | null; markets: PublicBriefMarket[]; source: "Nansen";
};
export const PUBLIC_BRIEF_TTL = 15 * 60_000;
const BACKOFF = 5 * 60_000;
const MAX_AGE = 24 * 60 * 60_000;
export const PUBLIC_MARKETS = [
  { id: "weth-ethereum", symbol: "WETH", name: "Wrapped Ether", chain: "ethereum", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { id: "wbtc-ethereum", symbol: "WBTC", name: "Wrapped Bitcoin", chain: "ethereum", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
  { id: "wsol-solana", symbol: "WSOL", name: "Wrapped SOL", chain: "solana", address: "So11111111111111111111111111111111111111112" },
] as const;
const FLOW_FIELDS = [
  ["Smart traders", "smart_trader_net_flow_usd"], ["Whales", "whale_net_flow_usd"],
  ["Public figures", "public_figure_net_flow_usd"], ["Fresh wallets", "fresh_wallets_net_flow_usd"],
] as const;
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const positive = (v: unknown): number | null => { const n = number(v); return n !== null && n >= 0 ? n : null; };
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n));
function analysis(flows: PublicBriefMarket["flows"]): PublicBriefMarket["analysis"] {
  const smart = flows[0]?.valueUsd;
  if (smart === 0 || smart === null || smart === undefined) {
    const measured = flows.filter(flow => flow.valueUsd !== null && flow.valueUsd !== 0).sort((a,b)=>Math.abs(b.valueUsd!)-Math.abs(a.valueUsd!))[0];
    if(measured) return { title: `${measured.label}: net ${measured.valueUsd! > 0 ? "inflows" : "outflows"}`, body: `Nansen reports ${usd(measured.valueUsd!)} in net ${measured.valueUsd! > 0 ? "inflows" : "outflows"} for this wallet segment over 24 hours. No non-zero smart-trader flow was reported. These are contract-specific flows, not a forecast or a total across chains.` };
  }
  if (smart === null || smart === undefined) return { title: "Market snapshot", body: "Smart-trader flow was not reported. Prices and volume describe this contract on this chain, not the asset across every market." };
  return { title: smart > 0 ? "Smart traders net buyers" : smart < 0 ? "Smart traders net sellers" : "No net smart-trader flow reported",
    body: `Nansen reports ${usd(smart)} ${smart < 0 ? "net selling" : smart > 0 ? "net buying" : "net flow"} by smart traders over 24 hours. This is one wallet segment for this contract; it is not total market demand or a forecast.` };
}
const nullableNumber = z.number().finite().nullable();
const storedSchema = z.object({ state: z.enum(["ready", "stale", "sample"]), asOf: z.number().finite(), markets: z.array(z.object({
  id: z.string(), updatedAt: z.number().finite(), priceUsd: nullableNumber, change24hPct: nullableNumber,
  volume24hUsd: nullableNumber, marketCapUsd: nullableNumber,
  flows: z.array(z.object({ valueUsd: nullableNumber })).length(4),
  candles: z.array(z.object({ timestamp: z.number().finite(), close: z.number().finite().nonnegative() })).max(48),
})).max(3) });
/** Parse a bounded, sanitized artifact. Never trust its URLs, identity strings, prose or extra keys. */
export function parsePublicBrief(value: unknown, now = Date.now()): PublicBrief | null {
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success || parsed.data.asOf > now + 60_000 || now - parsed.data.asOf > MAX_AGE) return null;
  const seen = new Set<string>();
  const markets: PublicBriefMarket[] = [];
  for (const row of parsed.data.markets) {
    const target = PUBLIC_MARKETS.find((t) => t.id === row.id);
    if (!target || seen.has(row.id) || row.updatedAt > now + 60_000 || now - row.updatedAt > MAX_AGE) continue;
    seen.add(row.id);
    const flows = FLOW_FIELDS.map(([label], i) => ({ label, valueUsd: row.flows[i]!.valueUsd }));
    markets.push({ ...target, nansenUrl: `https://app.nansen.ai/token-god-mode?chain=${target.chain}&tokenAddress=${target.address}&tab=transactions`,
      priceUsd: positive(row.priceUsd), change24hPct: row.change24hPct, volume24hUsd: positive(row.volume24hUsd), marketCapUsd: positive(row.marketCapUsd),
      updatedAt: row.updatedAt, flows, candles: row.candles.filter(c => c.timestamp <= now + 60_000 && c.timestamp >= now - 2 * MAX_AGE).sort((a, b) => a.timestamp - b.timestamp), analysis: analysis(flows) });
  }
  if (!markets.length) return null;
  const asOf = Math.min(parsed.data.asOf, ...markets.map(m => m.updatedAt!));
  return { source: "Nansen", state: parsed.data.state === "sample" ? "sample" : parsed.data.state === "stale" || now - asOf >= PUBLIC_BRIEF_TTL ? "stale" : "ready", asOf, refreshAfter: asOf + PUBLIC_BRIEF_TTL, markets };
}

export function publicCandleMetrics(candles: PublicBriefMarket["candles"]) {
  const rows=candles.filter(c=>Number.isFinite(c.close)&&c.close>0&&Number.isFinite(c.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
  const last=rows.at(-1),first=last?rows.find(c=>Math.abs(last.timestamp-c.timestamp-24*60*60_000)<=60_000):undefined;
  return { priceUsd:last?.close??null, change24hPct:first&&last?(last.close/first.close-1)*100:null };
}

/** Nine bounded calls; no target, time window or endpoint comes from a visitor. */
async function collect(): Promise<PublicBrief> {
  const { nansen } = await import("./nansen/endpoints");
  const { isReplay, nansenPost } = await import("./nansen/client");
  const now = Date.now();
  const to = Math.floor(now / PUBLIC_BRIEF_TTL) * PUBLIC_BRIEF_TTL;
  const markets = await Promise.all(PUBLIC_MARKETS.map(async target => {
    const [flow, chart, info] = await Promise.allSettled([
      nansen.flowIntel(target.chain, target.address, "1d"),
      nansen.ohlcv(target.chain, target.address, "1h", new Date(to - MAX_AGE - 2 * 60 * 60_000).toISOString(), new Date(to).toISOString(), PUBLIC_BRIEF_TTL),
      nansenPost<{data:import("./nansen/endpoints").TokenInformationResponse|null}>({name:"publicTokenInformation",path:"tgm/token-information",body:{chain:target.chain,token_address:target.address,timeframe:"1d"},ttlMs:PUBLIC_BRIEF_TTL}),
    ]);
    const f = flow.status === "fulfilled" ? flow.value.data.data?.[0] : null;
    const c = chart.status === "fulfilled" ? chart.value.data.data : [];
    const candles = (Array.isArray(c) ? c : []).map(c => ({ timestamp: Date.parse(toIsoInstant(c.interval_start) ?? ""), close: c.close })).filter(c => Number.isFinite(c.timestamp) && positive(c.close) !== null).sort((a,b)=>a.timestamp-b.timestamp).slice(-25);
    const flows = FLOW_FIELDS.map(([label, field]) => ({ label, valueUsd: number(f?.[field]) }));
    const token = info.status === "fulfilled" ? info.value.data.data : null;
    const identityMatches = typeof token?.contract_address === "string" && (target.chain === "solana" ? token.contract_address === target.address : token.contract_address.toLowerCase() === target.address.toLowerCase());
    const partial = !identityMatches || !f || !candles.length || [flow,chart,info].some(result=>result.status==="rejected"||(result.status==="fulfilled"&&result.value.stale));
    return { market: { ...target, nansenUrl: "", ...publicCandleMetrics(candles),
      volume24hUsd: identityMatches ? positive(token?.spot_metrics?.volume_total_usd) : null, marketCapUsd: identityMatches ? positive(token?.token_details?.market_cap_usd) : null, flows, candles, analysis: analysis(flows),
      updatedAt: Math.min(...[flow,chart,info].map(result=>result.status==="fulfilled"?result.value.storedAt:now)) }, partial };
  }));
  const result = parsePublicBrief({ state: isReplay() ? "sample" : markets.some(m => m.partial) ? "stale" : "ready", asOf: now, markets: markets.map(m => m.market) }, now);
  if (!result || !result.markets.some(m => m.priceUsd !== null || m.flows.some(f => f.valueUsd !== null))) throw new Error("No public market measurements");
  return result;
}

type Dependencies = { now: () => number; read: () => Promise<unknown>; write: (value: PublicBrief) => Promise<void>; collect: () => Promise<PublicBrief>; canRefresh: () => boolean; replay: () => boolean };
export function createPublicBriefService(deps: Dependencies) {
  let snapshot: PublicBrief | null = null;
  let checkedAt = -Infinity;
  let retryAt = 0;
  let pending: Promise<PublicBrief> | null = null;
  const empty = (): PublicBrief => ({ source: "Nansen", state: "unavailable", asOf: null, refreshAfter: null, markets: [] });
  return async (): Promise<PublicBrief> => {
    if (pending) return pending;
    pending = (async () => {
      const now = deps.now();
      if (now - checkedAt >= 60_000) {
        checkedAt = now;
        try { const disk = parsePublicBrief(await deps.read(), now); if (disk && (!snapshot || disk.asOf! >= snapshot.asOf!)) snapshot = disk; } catch { /* No snapshot is an honest unavailable state. */ }
      }
      snapshot = snapshot ? parsePublicBrief(snapshot, now) : null;
      // A sample artifact can never silently pass as production data.
      if (snapshot?.state === "sample" && !deps.replay()) snapshot = null;
      if (snapshot?.state === "ready" || !deps.canRefresh() || now < retryAt) return snapshot ?? empty();
      retryAt = now + BACKOFF;
      try {
        let next = parsePublicBrief(await deps.collect(), deps.now());
        if (!next) throw new Error("Invalid snapshot");
        // Preserve a complete older market when a partial refresh loses evidence. Do not
        // combine new prices and old flows beneath a misleading single observation time.
        if (snapshot && next.state !== "sample") {
          let retained = false;
          const markets = next.markets.map(market => {
            const old = snapshot!.markets.find(m => m.id === market.id);
            if (!old) return market;
            const missingMetric = (["priceUsd", "change24hPct", "volume24hUsd", "marketCapUsd"] as const).some(key => old[key] !== null && market[key] === null);
            const missingFlow = old.flows.some((flow, i) => flow.valueUsd !== null && market.flows[i]?.valueUsd === null);
            if (missingMetric || missingFlow || (old.candles.length > 0 && market.candles.length === 0)) { retained = true; return old; }
            return market;
          });
          if (retained) next = { ...next, markets, state: "stale", asOf: Math.min(...markets.map(m => m.updatedAt!)) };
          next.refreshAfter = next.asOf! + PUBLIC_BRIEF_TTL;
        }
        snapshot = next;
        retryAt = now + PUBLIC_BRIEF_TTL;
        if (next.state !== "sample") await deps.write(next).catch(() => {});
      } catch { if (snapshot && snapshot.state !== "sample") snapshot = { ...snapshot, state: "stale" }; }
      return snapshot ?? empty();
    })();
    try { return await pending; } finally { pending = null; }
  };
}
const file = () => process.env.TRIPWIRE_PUBLIC_BRIEF_FILE || path.resolve(process.cwd(), "data", "public-brief.json");
export const getPublicBrief = createPublicBriefService({
  now: Date.now, replay: () => process.env.TRIPWIRE_PUBLIC_SITE !== "1" && process.env.TRIPWIRE_REPLAY === "1",
  canRefresh: () => process.env.TRIPWIRE_PUBLIC_SITE !== "1" && process.env.TRIPWIRE_PUBLIC_BRIEF_REFRESH === "1",
  read: async () => { const filename = file(); if ((await fs.stat(/* turbopackIgnore: true */ filename)).size > 128_000) return null; return JSON.parse(await fs.readFile(/* turbopackIgnore: true */ filename, "utf8")); },
  write: async value => { const filename = file(); await fs.mkdir(path.dirname(filename), { recursive: true }); const temp = `${filename}.${process.pid}.tmp`; await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await fs.rename(temp, filename); },
  collect,
});
