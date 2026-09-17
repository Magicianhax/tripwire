// Records the author-badge replay fixtures: one live call per endpoint.
//   Nansen (<= 10 credits total, 1 credit each per the credits guide; perp-pnl-summary is unlisted
//   and is recorded last so its real cost can be read from x-nansen-credits-used):
//     fixtures/nansen/entityPnlSummary.json, pmAddressSummary.json, pmTradesByAddress.json, perpPnlSummary.json
//   Hyperliquid public info API (free, no auth):
//     fixtures/hyperliquid/clearinghouseState.json, userFills.json
// fixtures/nansen/pmPnlByAddress.json already exists and is not re-recorded.
//
// Usage: node scripts/record-badge-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
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
// Public addresses already present in recorded Nansen data (no identity claim is made about them):
// the Nansen entity from fixtures/nansen/search_entity.json, the Polymarket trader from
// fixtures/nansen/pmPnlByAddress.json, and a Nansen-labeled Hyperliquid fund from perpPositions.json.
const ENTITY = "Vitalik Buterin";
const PM_ADDRESS = "0x1963eabad7eb7499fb049ddebb96a8fd22179bfd";
const HL_ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

const root = path.resolve(import.meta.dirname, "..");
const nansenDir = path.join(root, "fixtures", "nansen");
const hlDir = path.join(root, "fixtures", "hyperliquid");
fs.mkdirSync(nansenDir, { recursive: true });
fs.mkdirSync(hlDir, { recursive: true });

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
  if (res.ok && json) fs.writeFileSync(path.join(nansenDir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({ name, status: res.status, credits: Number.isFinite(credits) ? credits : "?", ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 160) });
}

async function hyperliquid(name, body) {
  const t = Date.now();
  const res = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  // userFills can be up to 2000 rows: keep the newest 50, which is all the badge reads.
  if (Array.isArray(json)) json = json.slice(0, 50);
  if (res.ok && json) fs.writeFileSync(path.join(hlDir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  summary.push({ name: `hl:${name}`, status: res.status, credits: 0, ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 160) });
}

await hyperliquid("clearinghouseState", { type: "clearinghouseState", user: HL_ADDRESS });
await hyperliquid("userFills", { type: "userFills", user: HL_ADDRESS });

await nansen("entityPnlSummary", "profiler/address/pnl-summary", { entity_name: ENTITY, chain: "all", date: { from: daysAgo(90), to: iso(now) } });
await nansen("pmAddressSummary", "prediction-market/address-summary", { address: PM_ADDRESS });
await nansen("pmTradesByAddress", "prediction-market/trades-by-address", {
  address: PM_ADDRESS,
  pagination: { page: 1, per_page: 5 },
  order_by: [{ field: "timestamp", direction: "DESC" }],
});
await nansen("perpPnlSummary", "profiler/perp-pnl-summary", { address: HL_ADDRESS, date: { from: daysAgo(30), to: iso(now) } });

console.table(summary);
console.log(`Nansen credits spent: ${spent}`);
