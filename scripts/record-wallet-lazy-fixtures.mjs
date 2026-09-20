// Records the Round 1.5 lazy-view fixtures. Gap-filling: a fixture that already exists **and
// carries rows** is never re-bought, so re-running this costs nothing for what is already on
// disk. Hard cap: 10 Nansen credits per invocation.
//
//   fixtures/nansen/addressPnl.json        profiler/address/pnl      (1 credit)
//   fixtures/nansen/defiHoldings.json      portfolio/defi-holdings   (1 credit)
//   fixtures/nansen/dexTrades.json         profiler/dex-trades       (1 credit)
//
// It also answers the open question in docs/IMPROVEMENT-PLAN.md 1.5.7: **is `chain: "all"`
// accepted by `profiler/address/pnl`?** The first call asks with `"all"` and the run prints the
// status either way, so the answer is measured rather than assumed. (Measured 2026-09-20: YES.)
//
// Usage: node scripts/record-wallet-lazy-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
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

// The wallet every other wallet-lens fixture was recorded against, so replay keeps describing
// one wallet (scripts/record-wallet-fixtures.mjs). No identity claim is made about any address
// here; all four are public and already appear in Nansen's own public data.
const ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
/** A high-frequency public Ethereum DEX trader, so `profiler/dex-trades` has rows and a label. */
const DEX_TRADER = "0xae2fc483527b8ef99eb5d9b44875f005ba1fae13";
/** Public addresses known for large lending/staking positions, tried in order for 1.5.6. */
const DEFI_WALLETS = ["0x3ddfa8ec3052539b6c9549f12cea2c295cff5296", "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"];

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "fixtures", "nansen");
fs.mkdirSync(dir, { recursive: true });

const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const now = new Date();
const daysAgo = (n) => iso(new Date(now.getTime() - n * 86_400_000));
/** The date-only form the profiler trade endpoints want ("YYYY-MM-DD"), N days back. */
const ymd = (n) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const summary = [];
let spent = 0;

/** Rows on disk already: `data` for the paged shapes, `protocols` for defi-holdings. */
function onDisk(name) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    const rows = json.data ?? json.protocols;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return -1;
  }
}

async function nansen(name, p, body, { write = true } = {}) {
  if (spent >= MAX_CREDITS) {
    summary.push({ name, path: p, status: "skipped", credits: "-", rows: "-", note: "credit budget reached" });
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
  const rows = Array.isArray(json?.data ?? json?.protocols) ? (json.data ?? json.protocols).length : json ? "obj" : "-";
  if (res.ok && json && write) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({ name, path: p, status: res.status, credits: Number.isFinite(credits) ? credits : "?", rows, ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 160) });
  return res.ok ? json : null;
}

// ---- 1.5.7: unrealized PnL, and the chain:"all" probe ---------------------------------------
let chainAll = "not re-probed (fixture already on disk)";
if (onDisk("addressPnl") <= 0) {
  const pnlBody = (address, chain) => ({ address, chain, date: { from: daysAgo(90), to: iso(now) }, pagination: { page: 1, per_page: 50 } });
  const accepted = (await nansen("addressPnl", "profiler/address/pnl", pnlBody(ADDRESS, "all"))) !== null;
  chainAll = accepted ? "ACCEPTED" : "REJECTED";
  if (!accepted) await nansen("addressPnl", "profiler/address/pnl", pnlBody(ADDRESS, "ethereum"));
}

// ---- 1.5.6: DeFi holdings ---------------------------------------------------------------------
// Measured 2026-09-20: three public wallets (the lens fixture's, plus the two in DEFI_WALLETS)
// all answered `{summary: all zeros, protocols: []}` at 1 credit each. The zero answer is the
// one on disk and it is the one the card has to survive; a populated `protocols[]` has never
// been observed, so nothing renders per protocol. Set RECORD_DEFI_POPULATED=1 with another
// address to try again rather than re-buying the same empty answer.
if (onDisk("defiHoldings") < 0) await nansen("defiHoldings", "portfolio/defi-holdings", { wallet_address: ADDRESS });
if (process.env.RECORD_DEFI_POPULATED === "1" && onDisk("defiHoldings") === 0) {
  for (const wallet of [process.env.RECORD_DEFI_WALLET, ...DEFI_WALLETS].filter(Boolean)) {
    const json = await nansen("defiHoldings", "portfolio/defi-holdings", { wallet_address: wallet });
    if ((json?.protocols ?? []).length > 0) break;
  }
}

// ---- 1.5.1: the DEX-trades label -------------------------------------------------------------
// The date range is **date-only** here, as the Nansen CLI itself sends it (`buildDateRange`).
// A full ISO timestamp is accepted by `profiler/address/pnl` but returns an empty page here.
if (onDisk("dexTrades") <= 0) {
  const dexBody = (address) => ({
    address,
    chain: "ethereum",
    date: { from: ymd(30), to: ymd(0) },
    filters: {},
    pagination: { page: 1, per_page: 25 },
    order_by: [{ field: "block_timestamp", direction: "DESC" }],
  });
  await nansen("dexTrades", "profiler/dex-trades", dexBody(DEX_TRADER));
}

console.table(summary);
console.log(`Nansen credits spent this run: ${spent} (cap ${MAX_CREDITS})`);
console.log(`1.5.7 probe — profiler/address/pnl accepts chain:"all": ${chainAll}`);
