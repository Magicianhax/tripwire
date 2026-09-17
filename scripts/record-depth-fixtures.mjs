// Records the replay fixtures for the card's lazy depth sections: one live call per endpoint.
//
// Nansen (metered, capped below):
//   fixtures/nansen/perpPnlLeaderboard.json   tgm/perp-pnl-leaderboard            (5 credits)
//   fixtures/nansen/tokenPerpTrades.json      hyperliquid/token-perp-trades
//   fixtures/nansen/hyperliquidLeaderboard.json hyperliquid/hyperliquid-leaderboard
//   fixtures/nansen/tokenHolders.json         tgm/holders                         (5 credits)
//   fixtures/nansen/pmOrderbook.json          prediction-market/market-orderbook
//
// Free public APIs (no key, no credit, rate-limited only):
//   fixtures/hyperliquid/metaAndAssetCtxs.json, fundingHistory.json, l2Book.json,
//   candleSnapshot.json, predictedFundings.json
//   fixtures/venues/binance-*.json, bybit-tickers.json, okx-*.json, dydx-perpetualMarkets.json
//
// Usage: node scripts/record-depth-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
// The key is only ever sent as the `apikey` header; it is never printed or written anywhere.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const key =
  process.env.NANSEN_API_KEY?.trim() ||
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".nansen", "config.json"), "utf8")).apiKey?.trim() || null;
    } catch {
      return null;
    }
  })();
if (!key) {
  console.error("No API key (set NANSEN_API_KEY or run `nansen login`).");
  process.exit(1);
}

/** Hard ceiling for this run. The brief's budget is 25; the script refuses to pass it. */
const MAX_CREDITS = 25;

// The coin every perp fixture is recorded against: the one already behind fixtures/nansen/
// perpScreener.json, perpPositions.json and smPerpTrades.json, so replay stays about one market.
const COIN = "ETH";
// The token behind fixtures/nansen/tokenInformation.json, whoBought/whoSold and ohlcv.
const TOKEN = { chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" };

const root = path.resolve(import.meta.dirname, "..");
const nansenDir = path.join(root, "fixtures", "nansen");
const hlDir = path.join(root, "fixtures", "hyperliquid");
const venuesDir = path.join(root, "fixtures", "venues");
for (const d of [nansenDir, hlDir, venuesDir]) fs.mkdirSync(d, { recursive: true });

const write = (dir, name, json) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");

const summary = [];
let spent = 0;

async function nansen(name, p, body) {
  if (spent >= MAX_CREDITS) {
    summary.push({ name, status: "skipped", credits: "-", note: "credit budget reached" });
    return null;
  }
  const t = Date.now();
  const res = await fetch(`https://api.nansen.ai/api/v1/${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const credits = Number(res.headers.get("x-nansen-credits-used") ?? "NaN");
  if (Number.isFinite(credits)) spent += credits;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.ok && json) write(nansenDir, name, json);
  summary.push({ name, status: res.status, credits: Number.isFinite(credits) ? credits : "?", ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 200) });
  return res.ok ? json : null;
}

async function hl(name, body) {
  const t = Date.now();
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = res.ok ? await res.json() : null;
    if (json) write(hlDir, name, json);
    summary.push({ name: `hl/${name}`, status: res.status, credits: 0, ms: Date.now() - t, note: res.ok ? "" : "failed" });
  } catch (e) {
    summary.push({ name: `hl/${name}`, status: "err", credits: 0, ms: Date.now() - t, note: String(e).slice(0, 120) });
  }
}

async function venue(name, url) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const json = res.ok ? await res.json() : null;
    if (json) write(venuesDir, name, json);
    summary.push({ name: `venue/${name}`, status: res.status, credits: 0, ms: Date.now() - t, note: res.ok ? "" : "failed" });
  } catch (e) {
    summary.push({ name: `venue/${name}`, status: "err", credits: 0, ms: Date.now() - t, note: String(e).slice(0, 120) });
  }
}

// ---- Free first, so a Nansen failure never costs us the free fixtures --------------------------

const hourAligned = Math.floor((Date.now() - 48 * 3_600_000) / 3_600_000) * 3_600_000;
const candleEnd = Math.floor(Date.now() / 300_000) * 300_000;

await hl("metaAndAssetCtxs", { type: "metaAndAssetCtxs" });
await hl("fundingHistory", { type: "fundingHistory", coin: COIN, startTime: hourAligned });
await hl("l2Book", { type: "l2Book", coin: COIN });
await hl("candleSnapshot", { type: "candleSnapshot", req: { coin: COIN, interval: "15m", startTime: candleEnd - 24 * 3_600_000, endTime: candleEnd } });
await hl("predictedFundings", { type: "predictedFundings" });

await venue("binance-premiumIndex", `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${COIN}USDT`);
await venue("binance-openInterest", `https://fapi.binance.com/fapi/v1/openInterest?symbol=${COIN}USDT`);
await venue("binance-longShortRatio", `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${COIN}USDT&period=5m&limit=1`);
await venue("bybit-tickers", `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${COIN}USDT`);
await venue("okx-fundingRate", `https://www.okx.com/api/v5/public/funding-rate?instId=${COIN}-USDT-SWAP`);
await venue("okx-openInterest", `https://www.okx.com/api/v5/public/open-interest?instId=${COIN}-USDT-SWAP`);
await venue("okx-ticker", `https://www.okx.com/api/v5/market/ticker?instId=${COIN}-USDT-SWAP`);
await venue("dydx-perpetualMarkets", `https://indexer.dydx.trade/v4/perpetualMarkets?ticker=${COIN}-USD`);

// ---- Then the metered ones ---------------------------------------------------------------------

const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const ymd = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000);

await nansen("tokenPerpTrades", "tgm/perp-trades", {
  token_symbol: COIN,
  date: { from: iso(daysAgo(1)), to: iso(now) },
  pagination: { page: 1, per_page: 20 },
  order_by: [{ field: "value_usd", direction: "DESC" }],
});

await nansen("hyperliquidLeaderboard", "perp-leaderboard", {
  date: { from: ymd(daysAgo(30)), to: ymd(now) },
  pagination: { page: 1, per_page: 50 },
  order_by: [{ field: "total_pnl", direction: "DESC" }],
});

await nansen("perpPnlLeaderboard", "tgm/perp-pnl-leaderboard", {
  token_symbol: COIN,
  date: { from: ymd(daysAgo(30)), to: ymd(now) },
  pagination: { page: 1, per_page: 20 },
  order_by: [{ field: "pnl_usd_realised", direction: "DESC" }],
});

await nansen("tokenHolders", "tgm/holders", {
  chain: TOKEN.chain,
  token_address: TOKEN.address,
  label_type: "all_holders",
  pagination: { page: 1, per_page: 20 },
  order_by: [{ field: "value_usd", direction: "DESC" }],
});

// The market id already in fixtures/nansen/pmTopHolders.json, so the book is about that market.
const marketId = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(nansenDir, "pmTopHolders.json"), "utf8")).data?.[0]?.market_id ?? null;
  } catch {
    return null;
  }
})();
if (marketId) await nansen("pmOrderbook", "prediction-market/orderbook", { market_id: marketId, pagination: { page: 1, per_page: 40 } });
else summary.push({ name: "pmOrderbook", status: "skipped", credits: "-", note: "no market_id in pmTopHolders.json" });

console.table(summary);
console.log(`Nansen credits spent: ${spent} (cap ${MAX_CREDITS})`);
