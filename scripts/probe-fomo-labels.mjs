// Probe: does Nansen expose fomo wallets in a way Tripwire can use?
//   1. `search/general` for "fomo" (free per the credits guide).
//   2. `profiler/labels` for one address, only with --labels (100 credits — off by default).
// Prints shapes and label strings, never the key.
//
// Usage: node scripts/probe-fomo-labels.mjs [address] [--labels]
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

const BASE = "https://api.nansen.ai/api/v1";
let spent = 0;

async function call(name, path_, body) {
  const res = await fetch(`${BASE}/${path_}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });
  const credits = Number(res.headers.get("x-nansen-credits-used") ?? 0);
  spent += Number.isFinite(credits) ? credits : 0;
  const json = await res.json().catch(() => null);
  console.log(`\n=== ${name}  status=${res.status} credits=${credits || 0}`);
  return json;
}

const address = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;

const search = await call("search/general 'fomo'", "search/general", { search_query: "fomo", result_type: "any", limit: 20 });
console.log("top-level keys:", search ? Object.keys(search).join(", ") : "(none)");
const entities = search?.entities ?? search?.data?.entities ?? [];
const tokens = search?.tokens ?? search?.data?.tokens ?? [];
console.log("entities:", entities.length, "tokens:", tokens.length);
for (const e of entities.slice(0, 15)) console.log("  entity:", JSON.stringify(e).slice(0, 200));
for (const t of tokens.slice(0, 5)) console.log("  token:", JSON.stringify(t).slice(0, 160));

// Do trader labels on a token traded through fomo carry a fomo marker? Those rows already come
// back with the card's existing calls, so a label here would be free to show.
const MINT = "5tCju6YNxHq5zrA6tGndr6F7TK42mpUFmeE31cSFpump";
const to = new Date().toISOString().slice(0, 19) + "Z";
const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19) + "Z";
const who = await call("tgm/who-bought-sold (swordcat, BUY)", "tgm/who-bought-sold", {
  chain: "solana", token_address: MINT, buy_or_sell: "BUY", date: { from, to },
  pagination: { page: 1, per_page: 20 }, order_by: [{ field: "bought_volume_usd", direction: "DESC" }],
});
const rows2 = who?.data ?? [];
console.log("who rows:", rows2.length, "keys:", rows2[0] ? Object.keys(rows2[0]).join(", ") : "(none)");
const labels = [...new Set(rows2.flatMap((r) => [r.address_label, r.label, r.trader_address_label, ...(Array.isArray(r.labels) ? r.labels : [])]).filter(Boolean))];
console.log("distinct labels:", labels.slice(0, 25));
console.log("any mentioning fomo:", labels.filter((l) => /fomo/i.test(String(l))).slice(0, 10));

// Does the Nansen entity "fomo" hold the user wallets the announcement describes?
const ent = await call("entity fomo balances", "profiler/address/current-balance", {
  entity_name: "fomo", chain: "all", hide_spam_token: true, pagination: { page: 1, per_page: 20 },
});
const erows = ent?.data ?? [];
console.log("entity rows:", erows.length, "keys:", erows[0] ? Object.keys(erows[0]).join(", ") : "(none)");
for (const r of erows.slice(0, 5)) console.log("  ", JSON.stringify(r).slice(0, 200));

// Free: is a fomo wallet (or a fomo username) indexed as a Nansen entity?
for (const q of [process.env.PROBE_ADDR, process.env.PROBE_HANDLE].filter(Boolean)) {
  const r = await call(`search/general '${q}'`, "search/general", { search_query: q, result_type: "any", limit: 10 });
  console.log("  entities:", JSON.stringify(r?.entities ?? []).slice(0, 300));
  console.log("  tokens:", (r?.tokens ?? []).length);
}

if (address) {
  const bal = await call("profiler/address/current-balance", "profiler/address/current-balance", { address, chain: "solana" });
  const first = Array.isArray(bal?.data) ? bal.data[0] : null;
  console.log("balance row keys:", first ? Object.keys(first).join(", ") : "(none)");
  const labelish = JSON.stringify(bal ?? {}).match(/"[^"]*label[^"]*":\s*("[^"]*"|\[[^\]]*\])/gi);
  console.log("label-ish fields:", labelish ? labelish.slice(0, 6) : "(none)");

  if (process.argv.includes("--labels")) {
    const labels = await call("profiler/labels (100 credits)", "profiler/labels", { address });
    console.log(JSON.stringify(labels).slice(0, 600));
  }
}

console.log(`\ntotal credits spent: ${spent}`);
