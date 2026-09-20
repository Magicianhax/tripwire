// Records the two *free* prediction fixtures: the full Polymarket Gamma market object and the
// CLOB order book for each of its outcome tokens.
//
// Neither API is Nansen's, so this spends **0 credits** and needs no key. It exists because the
// committed `gammaMarket.json` was hand-trimmed to the 9 fields the old mapper read, which made
// replay useless for proving that the other ~75 fields survive the panel DTO (Round 1.2.1), and
// because the Book tab now reads the free two-sided CLOB book instead of the 1-credit Nansen
// one-sided page (Round 1.2.7).
//
// Usage:
//   node scripts/record-prediction-fixtures.mjs [slug]
//
// The default slug is the successor of the market every other prediction fixture was recorded
// against ("Will the price of Bitcoin be above $72,000 on September 17?", market 4441305): Gamma
// drops a settled daily market from both `?slug=` and `?id=`, so that exact market can no longer
// be re-recorded. The default below is the same daily series, live and Yes/No, which keeps the
// recorded question, outcomes and shape consistent with pmTopHolders and pmTrades.
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SLUG = "bitcoin-above-80k-on-september-20-2026";
const slug = process.argv[2]?.trim() || DEFAULT_SLUG;

const out = path.resolve("fixtures/nansen");
fs.mkdirSync(out, { recursive: true });

/** Fixed public origin, bounded timeout, no redirects — the same discipline as resolve-pair.ts. */
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const markets = await getJson(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
const market = Array.isArray(markets) ? markets[0] : null;
if (!market) {
  console.error(`No Gamma market for slug "${slug}". Pass a live slug as the first argument.`);
  process.exit(1);
}

let outcomes;
try {
  outcomes = JSON.parse(market.outcomes ?? "null");
} catch {
  outcomes = null;
}
if (!Array.isArray(outcomes) || outcomes.length !== 2 || String(outcomes[0]).toLowerCase() !== "yes") {
  console.error(`"${slug}" is not a Yes/No market (outcomes: ${market.outcomes}). Replay needs one.`);
  process.exit(1);
}
if (market.closed || !market.active) console.warn(`Warning: "${slug}" is not live (active=${market.active}, closed=${market.closed}).`);

fs.writeFileSync(path.join(out, "gammaMarket.json"), `${JSON.stringify(market, null, 2)}\n`);
console.log(`gammaMarket.json  market ${market.id}  ${Object.keys(market).length} fields  "${market.question}"`);

// The CLOB book is per outcome token, not per market: one unauthenticated GET each.
let tokenIds = [];
try {
  tokenIds = JSON.parse(market.clobTokenIds ?? "[]");
} catch {
  tokenIds = [];
}
if (tokenIds.length === 0) {
  console.error("The market carries no clobTokenIds, so no book can be recorded.");
  process.exit(1);
}

const books = {};
for (const tokenId of tokenIds) {
  books[String(tokenId)] = await getJson(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(String(tokenId))}`);
}
fs.writeFileSync(path.join(out, "clobBook.json"), `${JSON.stringify(books, null, 2)}\n`);
for (const [id, book] of Object.entries(books)) {
  console.log(`clobBook.json     ${id.slice(0, 10)}…  ${book.bids?.length ?? 0} bids / ${book.asks?.length ?? 0} asks`);
}
console.log("0 Nansen credits spent.");
