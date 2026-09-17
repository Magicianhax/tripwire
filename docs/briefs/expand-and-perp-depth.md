# Expand view + perp depth (controller brief)

User request (2026-09-18, screenshot of the Hyperliquid BTC long card): "add expand option so user can view it on like 70/80 of page something bigger and also it does not tell much wtf is happening sure there could be other stats related to that token user will trade, traders pnl, more stats — we are fetching two endpoints rn, it should tell us more things related to future trading, we could add things from other perps venues as well if possible, all kinda of data".

## A. Expand view
- **Toggle:** a Maximize icon button in every card header (popover, dock, block evidence, wallet card, badge card). Expanded = a centered overlay at `min(1280px, 80vw) × min(880px, 80vh)`, 24px radius, backdrop `rgba(0,0,0,.6)` (no blur), Esc and the backdrop close it, focus trapped while expanded, and the collapse button returns to the anchored popover. It remembers the last choice in `browser.storage.local` per card kind.
- **Layout:** expanded mode uses a two-column grid (`minmax(420px, 1fr) 1fr`) with the tab content spread out: charts get real height (280–360px), tables show 10–20 rows instead of 5, and every "+N more" becomes a full list. Same data, more of it; no separate code path for content, just denser layout (a `size: "compact" | "expanded"` prop through the tab bodies).
- **Desktop only:** the user runs this on a PC; do not design or test for phone widths. Handle desktop window sizes down to ~1100px (expanded falls back to 92vw there) and stop; no bottom sheets, no touch affordances, no mobile captures.

## B. Perp card depth (Hyperliquid)
Today: perp-screener + tgm/perp-positions (+ smart-money/perp-trades in panel mode). Add, all cached with sane TTLs, and only fetched for the tab being viewed (lazy per tab):

**Nansen**
- `tgm/perp-pnl-leaderboard` (docs: https://docs.nansen.ai/api/token-god-mode/perp-pnl-leaderboard.md) — top traders by PnL in this coin: address/label, realized+unrealized PnL, side. 5 credits, cache 5 min.
- `hyperliquid/token-perp-trades` and/or `hyperliquid/smart-money-perp-trades` — recent large trades in this coin with labels. Cache 2 min.
- `hyperliquid/hyperliquid-leaderboard` (or `profiler/hyperliquid-address-leaderboard`) — the top HL accounts overall, to mark whether any of them are in this coin right now.
- `tgm/perp-screener` extended fields already fetched: buy/sell pressure, trader count, volume, funding, OI, SM long/short USD and counts — surface all of them, not just long/short.

**Hyperliquid public API (free, backend-only, https://api.hyperliquid.xyz/info)**
- `metaAndAssetCtxs`: mark, oracle, funding rate (current + 8h), open interest, 24h volume, premium, max leverage.
- `fundingHistory` for the coin: last 24–72h funding, charted.
- `l2Book`: top-of-book depth and imbalance (bid/ask sizes within ±0.5%).
- `candleSnapshot`: price candles for the card's chart (reuse the lightweight-charts component; perps currently have no chart — add one).
- `openInterest`/`predictedFundings` if available in the same payload.

**Other perp venues (free public APIs, backend-only, best-effort, each independently failable)**
- Binance USD-M futures: `fapi/v1/premiumIndex` (funding, mark), `futures/data/globalLongShortAccountRatio` (long/short account ratio), `fapi/v1/openInterest`.
- Bybit v5 `market/tickers?category=linear` (funding, OI, 24h volume).
- OKX `api/v5/public/funding-rate` + `open-interest`.
- dYdX v4 indexer `perpetualMarkets` (funding, OI) if the coin exists there.
Map our coin symbol to each venue's symbol (BTC → BTCUSDT etc.) with a small table; unknown symbol = venue omitted. Show them as a "Funding & OI across venues" table: venue logo, funding (8h, annualised), OI, 24h volume, long/short ratio where available. Add venue logos (Binance, Bybit, OKX, dYdX) to the bundled logo set with provenance, or a monogram if no official mark is obtainable.

**New tab layout for perps** (compact keeps 3 tabs; expanded shows all):
- **Positioning:** SM long vs short (existing), trader counts, buy/sell pressure, the cross-venue funding/OI table, and a funding history sparkline.
- **Liquidations:** the existing ladder, plus a list of the largest SM positions with entry/liq/uPnL and distance-to-liquidation, and total USD within ±3%/±5%/±10% bands.
- **Traders:** NEW — top PnL traders in this coin (Nansen leaderboard) with labels and side, plus SM recent trades, plus "top HL accounts active in this coin".
- **Chart:** NEW — price candles from the HL public API with the same crosshair tooltip, funding overlaid as a second series where it fits.

Credits: keep chip mode unchanged (no new calls). Panel compact adds at most the free HL calls; the Nansen leaderboard (5 credits) loads only when the Traders tab or expanded view is opened. State per-tab credit cost in the footer.

## C. Spot and prediction cards get the same treatment where cheap
- **Spot:** expanded view shows the full buyer/seller lists (20 rows), the holder-concentration block if `tgm/holders` is affordable (5 credits, lazy, only in expanded), and the existing gauges at larger scale.
- **Prediction:** expanded view shows the full top-holder table with PnL, the order book snapshot (`prediction-market/market-orderbook`), and recent trades.

## Constraints
- Lazy per tab and per size: opening a card must not fire every endpoint. Anything ≥ 5 credits waits for an explicit tab/expand.
- Replay fixtures for every new endpoint so the demo and tests work offline; ONE live recording run (≤ 25 credits) via a script, never printing the key.
- Keep the Nansen theme, Lucide icons, bundled logos, a11y floors, anchor-fit rules, and the UNCHECKED/never-block semantics.
- The extension never calls Binance/Bybit/OKX/dYdX/Hyperliquid directly — always through the local backend.
- Don't edit tasks/todo.md or docs/DECISIONS.md (ADR text in the report).

## Tests
- core/web: per-venue symbol mapping, funding normalisation (per-8h vs per-hour vs annualised — get the units right per venue and label them), each venue client failing independently, lazy-tab fetch policy
- extension: expand toggle (open/close/Esc/persisted), focus trap, compact vs expanded row counts, tab lazy-load fires exactly one request
- e2e: expand a perp card, switch to Traders, assert rows render from fixtures

## Verify
`pnpm verify`, both builds, e2e, captures `perp-expanded.png`, `perp-traders.png`, `perp-funding-venues.png`, `spot-expanded.png`, detect once.

## D. Instant card with skeletons (user, 2026-09-18)
"when i click details it takes sometime to load since data is loading — what i want: show popup with skeleton loading until data loads".
- Clicking a chip, Details, Evidence, a badge or a wallet marker mounts the card IMMEDIATELY (same frame, before any fetch): header with what is already known (symbol/coin/address, verdict chip if already computed, timeframe control), then skeleton blocks for each section — shimmering rows sized like the real content (gauge rows, table rows, chart box), with `aria-busy="true"` and a visually-hidden "Loading …" live region.
- Sections fill in independently as their promises resolve (flow first, then chart, then tables); never block the whole card on the slowest call, and never collapse-then-expand (reserve each section's height so nothing jumps).
- A section that fails swaps its skeleton for the named-endpoint reason line, not a spinner that never ends.
- Skeleton style per the theme: `--tw-raised` blocks, 8px radius, 1.2s shimmer, disabled under `prefers-reduced-motion` (static blocks instead).
- Applies to compact and expanded, and to tab switches (a tab's first open shows its own skeletons).
- Tests: the card element exists synchronously on click (no await), `aria-busy` flips to false when a section resolves, a failed section shows the reason, reduced-motion path renders without animation. Capture `card-skeleton.png` (card mid-load).

## E. Desktop-only (user, 2026-09-18)
"dont target mobileview it will be pc only" — drop mobile/narrow work across the project: no mobile captures in the review set, no bottom-sheet variants, and the existing sub-720px dock sheet can stay but is not a requirement to maintain. Keep keyboard and pointer support; tests target desktop widths (1280/1440/1920).
