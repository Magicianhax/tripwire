// Records the two fixtures Round 1.3 needs that the repo does not already carry.
//
// Nansen (metered, capped below):
//   fixtures/nansen/positionIntelligence.json   tgm/position-intelligence   (1 credit)
//
// Free public APIs (no key, no credit, rate-limited only):
//   fixtures/venues/binance-ticker24hr.json     fapi/v1/ticker/24hr?symbol=ETHUSDT
//
// Usage: node scripts/record-perp-fixtures.mjs   (key from NANSEN_API_KEY or `nansen login`)
// The key is only ever sent as the `apikey` header; it is never printed or written anywhere.
//
// `tgm/position-intelligence` is keyed by *symbol* even though the body field is spelled
// `token_address` — address validation is skipped for perps, and the CLI exposes it as
// `--symbol`. The recorder tries that spelling first and falls back to `token_symbol`, so a
// rename costs a second request rather than the fixture.
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

/** Hard ceiling for this run. The brief's budget is 5; the script refuses to pass it. */
const MAX_CREDITS = 5;

// The coin every other perp fixture is recorded against, so replay stays about one market.
const COIN = "ETH";

const root = path.resolve(import.meta.dirname, "..");
const nansenDir = path.join(root, "fixtures", "nansen");
const venuesDir = path.join(root, "fixtures", "venues");
for (const d of [nansenDir, venuesDir]) fs.mkdirSync(d, { recursive: true });

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
  summary.push({ name, status: res.status, credits: Number.isFinite(credits) ? credits : "?", ms: Date.now() - t, note: res.ok ? "" : text.slice(0, 300) });
  return res.ok ? json : null;
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

// ---- Free first, so a Nansen failure never costs us the free fixture ---------------------------

// Always with `symbol`: the unfiltered form of this endpoint costs request weight 80 against a
// shared IP, the filtered one costs 1.
await venue("binance-ticker24hr", `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${COIN}USDT`);

// ---- Then the metered one ----------------------------------------------------------------------

let intel = await nansen("positionIntelligence", "tgm/position-intelligence", { token_address: COIN });
if (!intel) intel = await nansen("positionIntelligence", "tgm/position-intelligence", { token_symbol: COIN });

if (intel) {
  const first = Array.isArray(intel.data) ? intel.data[0] : intel.data;
  console.log("position-intelligence keys:", first && typeof first === "object" ? Object.keys(first).join(", ") : typeof first);
}

console.table(summary);
console.log(`Nansen credits spent: ${spent} (cap ${MAX_CREDITS})`);
