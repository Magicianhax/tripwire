# Author badges: Nansen, Hyperliquid, Polymarket (controller brief)

## User decision (2026-09-17)
"Nansen badge + linked HL/PM":
- **Nansen badge:** automatic for X accounts Nansen labels (exact normalized match of display name or handle to a Nansen entity, which exists already in `apps/web/lib/intel/person.ts`).
- **Hyperliquid and Polymarket badges:** only for handles that are either
  - (a) on a small curated list, each entry with a public source URL where the owner disclosed the wallet, or
  - (b) linked by the user from the popup.

Never guess by fuzzy names. Background is in `docs/SPIKE-badges.md` (read it).

## Data
- **Nansen badge:**
  - `profiler/address/pnl-summary` with `entity_name`
  - `profiler/address/current-balance` with `entity_name` (already used)

  Confirm the request and response shapes in the docs (https://docs.nansen.ai/api/profiler/address-pnl-and-trade-performance.md). Show: entity name, tags (as icons plus text), total holdings USD, top 3 holdings (token logo/monogram + chain logo), realized PnL, win rate if present. Cache 30 min.
- **Hyperliquid badge** (address known), from the public API `POST https://api.hyperliquid.xyz/info`, called from the backend only and never from the extension:
  - `{type:"clearinghouseState", user}`: account value, margin used, open positions (coin, side, size, entry, mark, liquidation price, unrealized PnL, leverage)
  - `{type:"userFills", user}`: last 10 fills, realized PnL sum over the fills window

  Cache 60 s. Also call Nansen `profiler/address/perp-positions` or the Hyperliquid perp PnL summary (docs: `profiler/perp-pnl-summary`) for Nansen-side PnL/win rate if it costs ≤ 1 credit. Mark data sources in the card footer.
- **Polymarket badge** (proxy wallet known), via Nansen:
  - `prediction-market/address-summary`
  - `pnl-by-address` (top open positions by unrealized value)
  - `trades-by-address` (last 5)

  1 credit each, cached 10 min. Show: total PnL, win rate/volume if present, open positions (market question, side Yes/No, size, avg price, current price, unrealized PnL).
- **Replay mode:** add fixtures so the whole feature works offline:
  - `fixtures/nansen/entityPnlSummary.json`
  - `fixtures/nansen/pmAddressSummary.json`, `pmPnlByAddress` (exists), `pmTradesByAddress.json`
  - `fixtures/hyperliquid/clearinghouseState.json`, `userFills.json`

  Record these fixtures with ONE live call each via a script like `scripts/record-fixtures.mjs` (a separate `scripts/record-badge-fixtures.mjs`; ≤ 10 Nansen credits total). The Hyperliquid public API costs nothing. Record against a public address from `docs/SPIKE-badges.md` samples. The key is read by the script only; never print it.

## Links storage
- **Table:** a `wallet_links` table in `apps/web/lib/db.ts`: handle (lowercase) plus venue (`hyperliquid|polymarket`), address, source (`user|curated`), created_at.
- **Routes:**
  - `GET/PUT/DELETE /api/links` behind the existing `route()` origin/Host guard, with zod validation. Hyperliquid address = 0x plus 40 hex; Polymarket = 0x plus 40 hex; handle regex as in `PersonIntelRequestSchema`.
  - `POST /api/author-badges {handle, displayName}` → `{nansen?: {...}, hyperliquid?: {...}, polymarket?: {...}}`
- **Curated list:** `packages/core/src/curated-wallets.ts`, as `[{handle, venue, address, sourceUrl, verifiedOn}]`. Include ONLY entries whose sourceUrl you fetched and saw state the address, posted by that account, or on an official profile. If none can be verified, ship the list empty and say so. Don't invent entries.

## UI (extension, X content script; Nansen theme from the re-theme build)
- **Badges row:** small logo badges right after the username in the tweet header, placed in the `[data-testid="User-Name"]` area without breaking X's layout (inline-flex, 18px tall, gap 4px). Show the Nansen mark badge when an entity matches, and the Hyperliquid/Polymarket logo badges when linked.
  - Fetch once per handle per page session, using the existing result cache (ok:false evicted) and a 4-concurrency queue.
- **Badge card:** clicking a badge opens the same body-level floating popover card (440px) with a stats card for that venue, with tabs if more than one badge (Nansen · Hyperliquid · Polymarket). Figures use signed colors (mint/red).
- **Link wallet:** in the author section of the post popover (and in the badge card), a "Link wallet" action (Lucide Link icon) opens an inline form: venue select (Hyperliquid/Polymarket with logos), address input, Save/Cancel. It calls PUT `/api/links` and refreshes badges. Linked entries show "Linked by you" with Unlink; curated ones show "Source" with an external-link icon to sourceUrl.
- **Empty states:** "No Nansen label for @handle" and "Link a Hyperliquid or Polymarket wallet to see positions."
- **Hard rules:**
  - Icons: Lucide only.
  - Logos: bundled SVGs only.
  - No emoji.
  - Text ≥ 11px.
  - Contrast ≥ 4.5.
  - Never show another account's stats without an exact link.

## Tests
- core: curated list validation, address validators
- web: links routes (validation, origin guard, upsert/delete), author-badges route in replay (Nansen match, HL linked, PM linked, none), HL client caching and error → partial result (never throws the whole route)
- extension: badge row parser/mount placement against X fixtures (`fixtures/html/x-tweet-*.html`), link form validation, popover tabs
- e2e: X stub with a linked handle shows the badges and the card opens

## Verify
`pnpm verify`, both builds, e2e (TRIPWIRE_E2E_PORT if 3000 busy), captures `x-badges.png` and `x-badge-card-hyperliquid.png`, `x-badge-card-polymarket.png`, `x-link-wallet.png` in `.impeccable/review/`, and detect once. Update the README (feature, data sources, credits, privacy note: links stored locally). Add ADR-0009 text in the report for the controller, and don't edit `docs/DECISIONS.md`.
