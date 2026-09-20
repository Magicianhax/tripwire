// Round 2.2. Records the two *free* Gamma fixtures that multi-market and multi-outcome coverage
// needs, and touches nothing that Round 1.2 already recorded.
//
//   gammaEvent.json           the recorded market's own event, exactly as `/events?slug=` answers
//                             it. It is what the event picker draws and what replay's sibling
//                             lookup reads.
//   gammaMarketOutcomes.json  a live market whose outcomes are NOT Yes and No.
//
// The second one is the point of the round. On 2026-09-20, 44 of Polymarket's 100 highest-24h-
// volume open markets had outcomes other than Yes/No, and the default slug below is the NFL
// spread whose second outcome is literally "NO" - New Orleans, not the no side. A fixture that
// only ever showed ["Yes","No"] could not catch a mapper that reads the word.
//
// Neither call is Nansen's, so this spends **0 credits** and needs no key.
//
// Usage:
//   node scripts/record-prediction-event-fixtures.mjs [eventSlug] [nonYesNoMarketSlug]
//
// With no arguments it reads the event slug off the committed gammaMarket.json, so the recorded
// market and its siblings always describe one event.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("fixtures/nansen");
const DEFAULT_OUTCOMES_SLUG = "nfl-no-bal-2026-09-20-spread-home-8pt5";

/** Fixed public origin, bounded timeout, no redirects - the same discipline as resolve-pair.ts. */
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const recorded = JSON.parse(fs.readFileSync(path.join(out, "gammaMarket.json"), "utf8"));
const eventSlug = process.argv[2]?.trim() || recorded.events?.[0]?.slug;
if (!eventSlug) {
  console.error("No event slug on fixtures/nansen/gammaMarket.json. Pass one as the first argument.");
  process.exit(1);
}

const events = await getJson(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`);
const all = events[0]?.markets ?? [];
const open = all.filter((m) => !m.closed);
if (open.length < 2) {
  console.error(`"${eventSlug}" has ${open.length} open market(s). The picker fixture needs an event with at least two.`);
  process.exit(1);
}
fs.writeFileSync(path.join(out, "gammaEvent.json"), `${JSON.stringify(events, null, 2)}\n`);
console.log(`gammaEvent.json           ${eventSlug}  ${open.length} open of ${all.length}  "${events[0]?.title ?? ""}"`);
if (!open.some((m) => m.id === recorded.id)) console.warn(`  Warning: the recorded market ${recorded.id} is not among this event's open markets.`);

const outcomesSlug = process.argv[3]?.trim() || DEFAULT_OUTCOMES_SLUG;
const markets = await getJson(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(outcomesSlug)}`);
const market = Array.isArray(markets) ? markets[0] : null;
if (!market) {
  console.error(`No Gamma market for "${outcomesSlug}". Pass a live non-Yes/No slug as the second argument.`);
  process.exit(1);
}
let outcomes;
try {
  outcomes = JSON.parse(market.outcomes ?? "null");
} catch {
  outcomes = null;
}
if (!Array.isArray(outcomes) || outcomes.length < 2) {
  console.error(`"${outcomesSlug}" carries no usable outcome set (outcomes: ${market.outcomes}).`);
  process.exit(1);
}
if (String(outcomes[0]).toLowerCase() === "yes" && String(outcomes[1]).toLowerCase() === "no") {
  console.error(`"${outcomesSlug}" is a Yes/No market. This fixture exists to be one that is not.`);
  process.exit(1);
}
fs.writeFileSync(path.join(out, "gammaMarketOutcomes.json"), `${JSON.stringify(market, null, 2)}\n`);
console.log(`gammaMarketOutcomes.json  market ${market.id}  outcomes ${market.outcomes}  "${market.question}"`);
if (!outcomes.some((o) => String(o).toLowerCase() === "no")) {
  console.warn('  Note: this market has no outcome literally named "NO", so it does not exercise the New Orleans case.');
}

console.log("0 Nansen credits spent.");
