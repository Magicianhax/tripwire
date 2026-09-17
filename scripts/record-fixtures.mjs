// Records one live response per Nansen endpoint Tripwire uses into fixtures/nansen/.
// Usage: node scripts/record-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const key =
  process.env.NANSEN_API_KEY?.trim() ||
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".nansen", "config.json"), "utf8")).apiKey;
    } catch {
      return null;
    }
  })();
if (!key) {
  console.error("No API key (set NANSEN_API_KEY or run `nansen login`).");
  process.exit(1);
}

const out = path.resolve("fixtures/nansen");
fs.mkdirSync(out, { recursive: true });

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const now = new Date();
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const ago = (h) => iso(new Date(now.getTime() - h * 3600_000));

const calls = [
  ["flowIntel", "tgm/flow-intelligence", { chain: "solana", token_address: WIF, timeframe: "1d" }],
  ["whoBought", "tgm/who-bought-sold", { chain: "solana", token_address: WIF, buy_or_sell: "BUY", date: { from: ago(24), to: iso(now) }, pagination: { page: 1, per_page: 8 }, order_by: [{ field: "bought_volume_usd", direction: "DESC" }] }],
  ["whoSold", "tgm/who-bought-sold", { chain: "solana", token_address: WIF, buy_or_sell: "SELL", date: { from: ago(24), to: iso(now) }, pagination: { page: 1, per_page: 8 }, order_by: [{ field: "sold_volume_usd", direction: "DESC" }] }],
  ["indicators", "tgm/indicators", { chain: "solana", token_address: WIF }],
  ["ohlcv", "tgm/token-ohlcv", { chain: "solana", token_address: WIF, timeframe: "1h", date: { from: ago(48), to: iso(now) } }],
  ["smNetflow", "smart-money/netflow", { chains: ["solana"], filters: { token_address: [WIF], include_stablecoins: true, include_native_tokens: true }, pagination: { page: 1, per_page: 1 } }],
  ["search_token", "search/general", { search_query: "WIF", result_type: "token", limit: 10 }],
  ["search_entity", "search/general", { search_query: "Vitalik Buterin", result_type: "entity", limit: 10 }],
  ["entityBalances", "profiler/address/current-balance", { entity_name: "Vitalik Buterin", chain: "all", hide_spam_token: true, pagination: { page: 1, per_page: 200 } }],
  ["perpScreener", "perp-screener", { date: { from: ago(24), to: iso(now) }, filters: { trader_type: "sm", token_symbol: "ETH" }, pagination: { page: 1, per_page: 1 } }],
  ["perpPositions", "tgm/perp-positions", { token_symbol: "ETH", label_type: "smart_money", pagination: { page: 1, per_page: 50 }, order_by: [{ field: "position_value_usd", direction: "DESC" }] }],
  ["smPerpTrades", "smart-money/perp-trades", { filters: { token_symbol: "ETH" }, lookback_hours: 24, only_new_positions: false, pagination: { page: 1, per_page: 12 } }],
  ["pmScreener", "prediction-market/market-screener", { query: "bitcoin", status: "active", pagination: { page: 1, per_page: 25 } }],
];

const summary = [];
async function post(name, p, body) {
  const t = Date.now();
  const res = await fetch(`https://api.nansen.ai/api/v1/${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const rows = Array.isArray(json?.data) ? json.data.length : json?.tokens ? `tokens:${json.tokens.length} entities:${json.entities?.length}` : "-";
  summary.push({ name, status: res.status, credits: res.headers.get("x-nansen-credits-used"), rows, ms: Date.now() - t, err: res.ok ? "" : text.slice(0, 160) });
  if (res.ok && json) fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(json, null, 2));
  return json;
}

for (const [name, p, body] of calls) await post(name, p, body);

// prediction: top holders + pnl for first market
const pm = JSON.parse(fs.readFileSync(path.join(out, "pmScreener.json"), "utf8"));
const market = pm.data?.[0];
if (market) {
  const holders = await post("pmTopHolders", "prediction-market/top-holders", { market_id: market.market_id, pagination: { page: 1, per_page: 20 }, order_by: [{ field: "position_size", direction: "DESC" }] });
  await post("pmTrades", "prediction-market/trades-by-market", { market_id: market.market_id, pagination: { page: 1, per_page: 15 }, order_by: [{ field: "timestamp", direction: "DESC" }] });
  const h = holders?.data?.[0];
  if (h) {
    const addr = h.owner_address && h.owner_address !== "0x" ? h.owner_address : h.address;
    await post("pmPnlByAddress", "prediction-market/pnl-by-address", { address: addr, pagination: { page: 1, per_page: 1000 } });
  }
}
console.table(summary);
