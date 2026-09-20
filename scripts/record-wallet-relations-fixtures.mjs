// Records the Round 2.3 wallet-depth fixtures. Gap-filling: a fixture that already exists **and
// carries rows** is never re-bought, so re-running this costs nothing for what is already on
// disk. Hard cap: 10 Nansen credits per invocation.
//
//   fixtures/nansen/addressTransactions.json   profiler/address/transactions   (1 credit)
//   fixtures/nansen/firstFunder.json           profiler/address/first-funder   (1 credit)
//   fixtures/nansen/relatedWallets.json        profiler/address/related-wallets (1 credit)
//   fixtures/nansen/counterparties.json        profiler/address/counterparties (5 credits)
//
// It also answers the two open questions in docs/IMPROVEMENT-PLAN.md §2 Round 2.3:
//   1. does `profiler/address/transactions` accept `chain: "all"`? ("the published chain enum
//      lists `all`, so confirm on the first live call rather than architecting a fan-out")
//   2. does `profiler/address/counterparties` accept `chain: "all"`? (the brief assumes it does)
// Both are asked with "all" first and the run prints the status either way, so the answer is
// measured. `related-wallets` is documented with no "all", which is probed the same way — a
// rejection is free, so the probe costs nothing when the brief is right.
//
// The cheap calls run first and the 5-credit one last, so a surprise on a 1-credit probe cannot
// eat the budget the expensive call needs.
//
// Usage: node scripts/record-wallet-relations-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
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
// here; it is public and already appears in Nansen's own public data.
const ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
/** The largest chain in `addressBalances.json` is `hyperevm`, which the profiler chain enum does
 *  not carry; `ethereum` is the largest chain the wallet holds that the profiler does cover. */
const CHAIN = "ethereum";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "fixtures", "nansen");
fs.mkdirSync(dir, { recursive: true });

const now = new Date();
/** The date-only form the profiler endpoints want ("YYYY-MM-DD"), N days back. */
const ymd = (n) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const summary = [];
const answers = [];
let spent = 0;

/** Rows on disk already, for the paged shapes. -1 means no file at all. */
function onDisk(name) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    return Array.isArray(json.data) ? json.data.length : 0;
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
  const rows = Array.isArray(json?.data) ? json.data.length : json ? "obj" : "-";
  if (res.ok && json && write) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({ name, path: p, status: res.status, credits: Number.isFinite(credits) ? credits : "?", rows, ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 200) });
  return res.ok ? json : null;
}

// ---- transactions: the chain:"all" probe, then the fixture -----------------------------------
if (onDisk("addressTransactions") <= 0) {
  const body = (chain) => ({
    address: ADDRESS,
    chain,
    date: { from: ymd(30), to: ymd(0) },
    filters: {},
    pagination: { page: 1, per_page: 100 },
  });
  const all = await nansen("addressTransactions", "profiler/address/transactions", body("all"));
  answers.push(`transactions chain:"all" — ${all ? "ACCEPTED" : "REJECTED"}`);
  if (!all) await nansen("addressTransactions", "profiler/address/transactions", body(CHAIN));
} else {
  answers.push("transactions — not re-probed (fixture already on disk)");
}

// ---- first-funder: EVM only, chain fixed to "all" by the endpoint itself ----------------------
// An empty `data: []` is documented as normal, so this fixture is recorded whenever the file is
// absent rather than whenever it is empty: re-buying a known-empty answer teaches nothing.
if (onDisk("firstFunder") < 0) await nansen("firstFunder", "profiler/address/first-funder", { address: ADDRESS, chain: "all" });

// ---- related-wallets: chain-scoped per the published enum, probed for "all" anyway ------------
if (onDisk("relatedWallets") < 0) {
  const body = (chain) => ({ address: ADDRESS, chain, pagination: { page: 1, per_page: 50 } });
  const all = await nansen("relatedWallets", "profiler/address/related-wallets", body("all"));
  answers.push(`related-wallets chain:"all" — ${all ? "ACCEPTED" : "REJECTED"}`);
  if (!all) await nansen("relatedWallets", "profiler/address/related-wallets", body(CHAIN));
} else {
  answers.push("related-wallets — not re-probed (fixture already on disk)");
}

// ---- counterparties: 5 credits, last, and only with the answer the brief assumes -------------
// If `chain: "all"` is refused this does NOT retry per chain: that would be another 5 credits
// for a fixture, and the finding ("one call does not cover every chain") is worth recording on
// its own.
if (onDisk("counterparties") < 0) {
  const all = await nansen("counterparties", "profiler/address/counterparties", {
    address: ADDRESS,
    chain: "all",
    date: { from: ymd(30), to: ymd(0) },
    filters: {},
    pagination: { page: 1, per_page: 50 },
  });
  answers.push(`counterparties chain:"all" — ${all ? "ACCEPTED" : "REJECTED (not retried per chain: 5 credits)"}`);
} else {
  answers.push("counterparties — not re-probed (fixture already on disk)");
}

console.table(summary);
console.log(`Nansen credits spent this run: ${spent} (cap ${MAX_CREDITS})`);
for (const line of answers) console.log(`probe — ${line}`);
