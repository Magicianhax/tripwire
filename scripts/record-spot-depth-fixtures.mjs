// Records the Round 1.6 / 2.1 spot fixtures. Gap-filling: a fixture that already exists **and
// carries rows** is never re-bought, so re-running this costs nothing for what is on disk.
// Hard cap: 10 Nansen credits per invocation.
//
//   fixtures/nansen/tokenScreener.json        token-screener        (1 credit)   1.6.2
//   fixtures/nansen/tokenDexTrades.json       tgm/dex-trades        (1 credit)   2.1 tape
//   fixtures/nansen/tokenTransfers.json       tgm/transfers         (1 credit)   2.1 transfers
//   fixtures/nansen/jupDca.json               tgm/jup-dca           (1 credit)   2.1 DCA
//   fixtures/nansen/tokenPnlLeaderboard.json  tgm/pnl-leaderboard   (5 credits)  2.1 winners
//   fixtures/dexscreener/token.json           Dexscreener public    (0 credits)  1.6.1
//
// Four questions are **measured** here rather than assumed, and the run prints each answer:
//   A. token-screener: does `filters.token_address` take an array, and does it need a `date`
//      whose `to` is within five minutes of now? (docs/IMPROVEMENT-PLAN.md 1.6.2)
//   B. tgm/pnl-leaderboard: is `order_by: realized_pnl` accepted? An invalid field is a 400 in
//      production, so the ordered body is sent once for real rather than guessed later.
//   C. tgm/dex-trades: is `order_by: block_timestamp` accepted?
//   D. tgm/jup-dca: does a large Solana token have open DCA vaults at all? (Expected: often not.)
//
// Usage: node scripts/record-spot-depth-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
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

const MAX_CREDITS = 10;

/** The token every other spot fixture was recorded against, so replay keeps describing one
 * token: dogwifhat on Solana. Solana also makes the jup-dca probe possible at all. */
const CHAIN = "solana";
const TOKEN = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "fixtures", "nansen");
const dexDir = path.join(root, "fixtures", "dexscreener");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(dexDir, { recursive: true });

const now = new Date();
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/** The date-only form the tgm trade endpoints want ("YYYY-MM-DD"), N days back. */
const ymd = (n) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const summary = [];
let spent = 0;

function onDisk(name) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    return Array.isArray(json.data) ? json.data.length : 0;
  } catch {
    return -1;
  }
}

async function nansen(name, p, body) {
  if (spent >= MAX_CREDITS) {
    summary.push({ name, path: p, status: "skipped", credits: "-", rows: "-", note: "credit budget reached" });
    return { ok: false, json: null, status: 0 };
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
  const rows = Array.isArray(json?.data) ? json.data.length : json ? "obj" : "-";
  if (res.ok && json) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({
    name,
    path: p,
    status: res.status,
    credits: Number.isFinite(credits) ? credits : "?",
    rows,
    ms: Date.now() - t,
    note: res.ok ? "" : text.slice(0, 200),
  });
  return { ok: res.ok, json, status: res.status };
}

const answers = {};

// ---- 1.6.2: token-screener, one call for a whole catalog page -------------------------------
// Probe A. The plan says `filters.token_address` takes an array and `to_date` must be within
// five minutes of now. Both halves are tried in order, cheapest-correct first.
if (onDisk("tokenScreener") <= 0) {
  const base = { chains: [CHAIN], timeframe: "24h", pagination: { page: 1, per_page: 100 } };
  const withArray = { ...base, filters: { token_address: [TOKEN] } };
  let r = await nansen("tokenScreener", "token-screener", withArray);
  answers.screenerArrayFilter = r.ok ? "ACCEPTED" : `REJECTED (${r.status})`;
  if (!r.ok) {
    const dated = { ...withArray, date: { from: iso(new Date(now.getTime() - 86_400_000)), to: iso(now) } };
    r = await nansen("tokenScreener", "token-screener", dated);
    answers.screenerNeedsDate = r.ok ? "YES — a date range is required" : `still rejected (${r.status})`;
  } else {
    answers.screenerNeedsDate = "NO — no date range was needed";
  }
}

// ---- 2.1: the labelled trade tape ------------------------------------------------------------
// Probe C. `per_page` is not priced, so the page is large and the value floor is applied on our
// side: a small page ordered by time is all bots on a liquid token.
if (onDisk("tokenDexTrades") <= 0) {
  const body = (orderBy) => ({
    token_address: TOKEN,
    chain: CHAIN,
    date: { from: ymd(1), to: ymd(0) },
    filters: {},
    ...(orderBy ? { order_by: orderBy } : {}),
    pagination: { page: 1, per_page: 100 },
  });
  let r = await nansen("tokenDexTrades", "tgm/dex-trades", body([{ field: "block_timestamp", direction: "DESC" }]));
  answers.dexTradesOrderBy = r.ok ? "block_timestamp ACCEPTED" : `block_timestamp REJECTED (${r.status})`;
  if (!r.ok) r = await nansen("tokenDexTrades", "tgm/dex-trades", body(null));
}

// ---- 2.1: transfers --------------------------------------------------------------------------
if (onDisk("tokenTransfers") <= 0) {
  const body = (orderBy) => ({
    token_address: TOKEN,
    chain: CHAIN,
    date: { from: ymd(1), to: ymd(0) },
    filters: {},
    ...(orderBy ? { order_by: orderBy } : {}),
    pagination: { page: 1, per_page: 25 },
  });
  let r = await nansen("tokenTransfers", "tgm/transfers", body([{ field: "transfer_value_usd", direction: "DESC" }]));
  answers.transfersOrderBy = r.ok ? "transfer_value_usd ACCEPTED" : `transfer_value_usd REJECTED (${r.status})`;
  if (!r.ok) await nansen("tokenTransfers", "tgm/transfers", body(null));
}

// ---- 2.1: Jupiter DCA (Solana only) ----------------------------------------------------------
// Probe D. An empty answer is the expected normal case and is exactly the fixture the card has
// to survive, so it is recorded either way.
if (onDisk("jupDca") < 0) {
  const r = await nansen("jupDca", "tgm/jup-dca", { token_address: TOKEN, filters: {}, pagination: { page: 1, per_page: 25 } });
  answers.jupDcaRows = r.ok ? `${Array.isArray(r.json?.data) ? r.json.data.length : "obj"} rows` : `failed (${r.status})`;
}

// ---- 2.1: the 5-credit winners leaderboard ---------------------------------------------------
// Probe B, and the most expensive call in the run, so it goes last: if anything above overran
// the budget this is the one that is skipped. `premium_labels: false` is explicit — the default
// is a 150-credit call and that is the worst failure mode in this repo.
if (onDisk("tokenPnlLeaderboard") <= 0) {
  const body = (orderBy) => ({
    token_address: TOKEN,
    chain: CHAIN,
    date: { from: ymd(30), to: ymd(0) },
    filters: {},
    premium_labels: false,
    ...(orderBy ? { order_by: orderBy } : {}),
    pagination: { page: 1, per_page: 20 },
  });
  let r = await nansen("tokenPnlLeaderboard", "tgm/pnl-leaderboard", body([{ field: "realized_pnl", direction: "DESC" }]));
  answers.leaderboardOrderBy = r.ok ? "realized_pnl ACCEPTED" : `realized_pnl REJECTED (${r.status})`;
  if (!r.ok) {
    r = await nansen("tokenPnlLeaderboard", "tgm/pnl-leaderboard", body(null));
    answers.leaderboardOrderBy += r.ok ? " — recorded unordered" : " — unordered also failed";
  }
  if (r.ok && Array.isArray(r.json?.data) && r.json.data[0]) answers.leaderboardRowKeys = Object.keys(r.json.data[0]).join(", ");
}

// ---- 1.6.1: Dexscreener market structure (0 Nansen credits) ----------------------------------
// The token-keyed route, not the pair-keyed one `resolve-pair.ts` already uses. The recorded
// body is the whole 30-pool answer, kept only so the backend parser can be tested against what
// Dexscreener really sends; at runtime it is parsed and discarded on the backend.
if (!fs.existsSync(path.join(dexDir, "token.json"))) {
  const t = Date.now();
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`, { signal: AbortSignal.timeout(15_000) });
  const json = res.ok ? await res.json() : null;
  if (json) fs.writeFileSync(path.join(dexDir, "token.json"), JSON.stringify(json, null, 2) + "\n");
  summary.push({
    name: "dexscreener/token",
    path: "api.dexscreener.com/latest/dex/tokens",
    status: res.status,
    credits: 0,
    rows: Array.isArray(json?.pairs) ? json.pairs.length : "-",
    ms: Date.now() - t,
    note: "",
  });
}

console.table(summary);
console.log(`Nansen credits spent this run: ${spent} (cap ${MAX_CREDITS})`);
for (const [q, a] of Object.entries(answers)) console.log(`probe — ${q}: ${a}`);
