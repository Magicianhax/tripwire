// Records the one missing replay fixture: tgm/token-information for WIF.
//
// It is its own script because it is the only Nansen call the evidence-card-v2 work added to
// the replay set, and because re-running scripts/record-fixtures.mjs would spend ~50 credits to
// refresh data that has not changed. Budget: 2 credits, enforced below.
//
// Usage: node scripts/record-token-info-fixture.mjs   (key from NANSEN_API_KEY or `nansen login`)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUDGET = 2;

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

const started = Date.now();
const res = await fetch("https://api.nansen.ai/api/v1/tgm/token-information", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: key },
  body: JSON.stringify({ chain: "solana", token_address: WIF, timeframe: "1d" }),
});
const text = await res.text();
const credits = res.headers.get("x-nansen-credits-used");
if (!res.ok) {
  console.error(`tokenInformation failed (${res.status}): ${text.slice(0, 200)}`);
  process.exit(1);
}
if (Number(credits) > BUDGET) console.warn(`WARNING: the call reported ${credits} credits, over the ${BUDGET}-credit budget.`);

const json = JSON.parse(text);
fs.writeFileSync(path.join(out, "tokenInformation.json"), JSON.stringify(json, null, 2));
console.table([{ name: "tokenInformation", status: res.status, credits, ms: Date.now() - started, keys: Object.keys(json.data ?? json).join(",") }]);
