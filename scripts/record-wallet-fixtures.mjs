// Records the wallet-lens replay fixtures: one live call per endpoint, and nothing else.
//   fixtures/nansen/addressBalances.json   profiler/address/current-balance by address (1 credit)
//   fixtures/nansen/addressPnlSummary.json profiler/address/pnl-summary by address   (1 credit)
//   fixtures/nansen/search_any.json        search/general, result_type "any"          (0 credits)
//
// `profiler/labels` is NOT recorded: it costs 100 credits, and the wallet card only reaches it
// behind an explicit button and the NANSEN_ALLOW_PREMIUM env gate.
//
// Hyperliquid and Polymarket fixtures already exist (scripts/record-badge-fixtures.mjs) and are
// reused as-is, so nothing here re-records them.
//
// Usage: node scripts/record-wallet-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
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

const MAX_CREDITS = 6;
// A Nansen-labeled Hyperliquid fund already present in recorded public Nansen data
// (fixtures/nansen/perpPositions.json, and the address behind fixtures/hyperliquid/*). Using it
// keeps every wallet-lens fixture about one wallet. No identity claim is made about it.
const ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "fixtures", "nansen");
fs.mkdirSync(dir, { recursive: true });

const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const now = new Date();
const daysAgo = (n) => iso(new Date(now.getTime() - n * 86_400_000));

const summary = [];
let spent = 0;

async function nansen(name, p, body) {
  if (spent >= MAX_CREDITS) {
    summary.push({ name, status: "skipped", credits: "-", note: "credit budget reached" });
    return;
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
  if (res.ok && json) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({ name, status: res.status, credits: Number.isFinite(credits) ? credits : "?", ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 200) });
}

await nansen("addressBalances", "profiler/address/current-balance", {
  address: ADDRESS,
  chain: "all",
  hide_spam_token: true,
  pagination: { page: 1, per_page: 200 },
});

await nansen("addressPnlSummary", "profiler/address/pnl-summary", {
  address: ADDRESS,
  chain: "all",
  date: { from: daysAgo(90), to: iso(now) },
});

await nansen("search_any", "search/general", { search_query: ADDRESS, result_type: "any", limit: 10 });

console.table(summary);
console.log(`Nansen credits spent: ${spent} (cap ${MAX_CREDITS})`);
