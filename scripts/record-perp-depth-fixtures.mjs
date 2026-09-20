// Records the fixtures Round 2.5 (perp depth) needs and the repo does not already carry.
//
// Free public APIs (no key, no credit, rate-limited only):
//   fixtures/venues/binance-openInterestHist.json      futures/data/openInterestHist (weight 0)
//   fixtures/hyperliquid/perpsAtOpenInterestCap.json   info { type: perpsAtOpenInterestCap }
//
// Nansen (metered, capped below — the round's whole budget is one run):
//   fixtures/nansen/perpPositionsCohort.json   tgm/perp-positions, label_type all_traders  (5)
//   fixtures/nansen/perpScreenerAll.json       perp-screener, trader_type all              (1)
//
// Usage:
//   node scripts/record-perp-depth-fixtures.mjs --free      free sources only, no key needed
//   node scripts/record-perp-depth-fixtures.mjs             everything, up to MAX_CREDITS
//
// The key is only ever sent as the `apikey` header; it is never printed or written anywhere.
//
// Why `perpScreenerAll` is recorded but not wired: `perp-screener` returns a *different shape*
// per `trader_type`, the docs and our recorded `sm` response already disagree about which
// fields come back, and the brief's own sequencing says to probe the shape before building a
// discriminated union on top of it. One credit buys that answer for the round that wires it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const freeOnly = process.argv.includes("--free");

const key =
  process.env.NANSEN_API_KEY?.trim() ||
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".nansen", "config.json"), "utf8")).apiKey?.trim() || null;
    } catch {
      return null;
    }
  })();
if (!key && !freeOnly) {
  console.error("No API key (set NANSEN_API_KEY or run `nansen login`), or pass --free.");
  process.exit(1);
}

/** Hard ceiling for this run. The round's budget is 10; the script refuses to pass it. */
const MAX_CREDITS = 10;

// The coin every other perp fixture is recorded against, so replay stays about one market.
const COIN = "ETH";

const root = path.resolve(import.meta.dirname, "..");
const nansenDir = path.join(root, "fixtures", "nansen");
const venuesDir = path.join(root, "fixtures", "venues");
const hlDir = path.join(root, "fixtures", "hyperliquid");
for (const d of [nansenDir, venuesDir, hlDir]) fs.mkdirSync(d, { recursive: true });

const write = (dir, name, json) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");

const summary = [];
let spent = 0;

async function nansen(name, p, body, cost) {
  if (spent + cost > MAX_CREDITS) {
    summary.push({ name, status: "skipped", credits: "-", note: `would pass the ${MAX_CREDITS}-credit cap` });
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
  spent += Number.isFinite(credits) ? credits : cost;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.ok && json) write(nansenDir, name, json);
  summary.push({ name, status: res.status, credits: Number.isFinite(credits) ? credits : `~${cost}`, ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 300) });
  return res.ok ? json : null;
}

async function get(dir, name, url) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const json = res.ok ? await res.json() : null;
    if (json) write(dir, name, json);
    summary.push({ name, status: res.status, credits: 0, ms: Date.now() - t, note: res.ok ? "" : "failed" });
    return json;
  } catch (e) {
    summary.push({ name, status: "err", credits: 0, ms: Date.now() - t, note: String(e).slice(0, 120) });
    return null;
  }
}

async function hlInfo(name, body) {
  const t = Date.now();
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = res.ok ? await res.json() : null;
    if (json) write(hlDir, name, json);
    summary.push({ name, status: res.status, credits: 0, ms: Date.now() - t, note: res.ok ? "" : "failed" });
    return json;
  } catch (e) {
    summary.push({ name, status: "err", credits: 0, ms: Date.now() - t, note: String(e).slice(0, 120) });
    return null;
  }
}

// ---- Free first, so a Nansen failure never costs us the free fixtures -------------------------

// 288 five-minute buckets is 24 hours, the span the card labels. Always symbol-scoped: the
// statistics host shares a 500-per-5-minute IP budget with the long/short ratio call the venue
// table already makes.
const oiHist = await get(venuesDir, "binance-openInterestHist", `https://fapi.binance.com/futures/data/openInterestHist?symbol=${COIN}USDT&period=5m&limit=288`);
if (Array.isArray(oiHist)) console.log(`openInterestHist: ${oiHist.length} buckets, keys ${Object.keys(oiHist[0] ?? {}).join(", ")}`);

// A bare array of coin names. Cached under one key for every coin, because the answer is the
// whole list either way.
const capped = await hlInfo("perpsAtOpenInterestCap", { type: "perpsAtOpenInterestCap" });
if (Array.isArray(capped)) console.log(`perpsAtOpenInterestCap: ${capped.length} coins — ${capped.join(", ")}`);

// ---- Then the metered ones ---------------------------------------------------------------------

if (!freeOnly) {
  // 5 credits. The same call the card already makes for Smart Money, asked for the whole
  // population instead, so the liquidation ladder can be read per cohort.
  const ladder = await nansen(
    "perpPositionsCohort",
    "tgm/perp-positions",
    { token_symbol: COIN, label_type: "all_traders", pagination: { page: 1, per_page: 50 }, order_by: [{ field: "position_value_usd", direction: "DESC" }] },
    5,
  );
  if (ladder) {
    const rows = Array.isArray(ladder.data) ? ladder.data : [];
    console.log(`all_traders ladder: ${rows.length} rows, is_last_page ${ladder.pagination?.is_last_page}, keys ${Object.keys(rows[0] ?? {}).join(", ")}`);
  }

  // 1 credit. Probe only: the response shape varies by trader_type and this is the one we have
  // never seen. Recorded, reported, and deliberately not wired this round.
  const to = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const from = new Date(to.getTime() - 24 * 3_600_000);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const all = await nansen(
    "perpScreenerAll",
    "perp-screener",
    { date: { from: iso(from), to: iso(to) }, filters: { trader_type: "all", token_symbol: COIN }, pagination: { page: 1, per_page: 1 } },
    1,
  );
  if (all) {
    const row = Array.isArray(all.data) ? all.data[0] : null;
    console.log(`perp-screener trader_type=all keys: ${row ? Object.keys(row).join(", ") : "no rows"}`);
  }
}

console.table(summary);
console.log(`Nansen credits spent: ${spent} (cap ${MAX_CREDITS})`);
