# Tripwire

Nansen onchain intelligence at the moment of decision: on the post that shills a token and on
the button that buys it.

Built for the Nansen Meridian Buildathon.

## Demo

Demo video: (link added at submission)

A short GIF walkthrough, if added, lives in `docs/media/`.

## What it does

- **On X:** every post that mentions a token gets a verdict chip (TRIPWIRE / CAUTION / CLEAR /
  UNCHECKED; when a post has both a cashtag and a contract address, the address is checked),
  and a slide-out panel with buyer/seller flow, Smart Money netflow, risk
  indicators and whether the post's author (matched by Nansen entity name) holds the token.
- **On trading venues:** tier-1 venues (Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid,
  Polymarket) get a block screen over the trade/buy/long/short/yes-no button when a rule
  fires, with the Nansen evidence that triggered it and a typed-phrase override. Tier-2
  venues get a docked panel instead of a block (URL-derived target only, nothing to block).
- **User-owned rules:** three presets (Degen, Balanced, Paranoid) or a custom rule set,
  editable at `/rules`, evaluated locally against the signals below.

**What it never does:** it never reads, derives or stores a wallet address for an unlabeled X
account; it never signs, sends or intercepts a transaction, and never connects to a wallet;
the Nansen API key never reaches the extension.

## Quick start (under 10 minutes)

**Prerequisites:** Node >= 22.13, pnpm >= 9, Chrome, a Nansen API key
(https://app.nansen.ai/api).

1. Clone the repo.
2. `pnpm install`
3. Provide a Nansen key, either way works:
   - `cp .env.example apps/web/.env.local` and set `NANSEN_API_KEY`, or
   - already logged in with the Nansen CLI (`npm i -g nansen-cli && nansen login`) — the
     backend reuses that key automatically, no `.env.local` needed (ADR-0004).
4. `pnpm -F web dev` — backend at http://127.0.0.1:3000.
5. `pnpm -F extension build`
6. In Chrome: `chrome://extensions` -> enable Developer mode -> Load unpacked ->
   `apps/extension/.output/chrome-mv3`.
7. Open x.com and search `$WIF`, or open
   https://jup.ag/swap/SOL-EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm.

**Offline / no key:** `pnpm dev:replay` (any shell) serves recorded real responses
(`fixtures/nansen/`) instead of calling Nansen. By hand: `TRIPWIRE_REPLAY=1 pnpm -F web dev`
(bash) or `$env:TRIPWIRE_REPLAY="1"; pnpm -F web dev` (PowerShell). A grey REPLAY watermark
shows on every web page and on every extension surface (X chip and panel, strip, dock, block
screen).

## How the verdict works

Each target (a token, a perp coin + side, or a prediction market + outcome) produces a set of
signals. A signal's `value` is `null` when the underlying Nansen data is unavailable — a
missing signal never counts toward CLEAR.

| Signal | Meaning | Nansen endpoint(s) | Credits |
|---|---|---|---|
| `exit_pressure` | Net flow of labeled money (smart traders, whales, public figures) since the window opened; negative means labeled wallets are net selling | `tgm/flow-intelligence` | 1 |
| `fresh_buy_share` | Fresh wallets' share of positive inflow | `tgm/flow-intelligence` | 1 |
| `sm_netflow_24h` | Smart Money 24h net flow for the token | `smart-money/netflow` | 5 |
| `risk_high_count` | Count of high-severity token risk indicators (`concentration-risk`, `liquidity-risk`, `token-supply-inflation`) | `tgm/indicators` | 5 |
| `author_holds_token` | Current USD value the matched entity (X post author) holds of the token | `profiler/address/current-balance` | 1 |
| `sm_opposite_side_pct` | Share of Smart Money perp exposure on the side opposite the user's chosen long/short | `perp-screener` | 1 |
| `inside_liq_band` | USD value of Smart Money positions that liquidate within +/-3% of mark price | `tgm/perp-positions` | 5 |
| `smart_side_disagrees` | Share of proven-winner Polymarket money (Yes/No holders only) on the outcome opposite the user's pick | `prediction-market/top-holders`, `prediction-market/pnl-by-address` | 5 + up to 20 × 1 (one PnL call per top holder, each cached 24h) |

Rules compare a signal's value against a threshold and either `warn` or `block`. Three
presets ship in `packages/core/src/rules/presets.ts`:

| Rule | Signal | Degen | Balanced | Paranoid |
|---|---|---|---|---|
| spot-exit | `exit_pressure` | block < -$500,000 | block < -$100,000 | block < -$25,000 |
| spot-fresh | `fresh_buy_share` | warn > 90% | warn > 70% | block > 50% |
| spot-sm24 | `sm_netflow_24h` | warn < -$250,000 | warn < -$50,000 | block < $0 |
| spot-risk | `risk_high_count` | block >= 3 | block >= 2 | block >= 1 |
| perp-opp | `sm_opposite_side_pct` | block > 85% | block > 70% | block > 55% |
| perp-liq | `inside_liq_band` | warn > $5,000,000 | warn > $1,000,000 | block > $250,000 |
| pm-smart | `smart_side_disagrees` | block > 85% | block > 70% | block > 55% |

**Verdict:** `TRIPWIRE` (a `block` rule fired) outranks `CAUTION` (only `warn` rules fired),
which outranks `UNCHECKED` (a rule's signal was unavailable, or no rule applies to this
target kind), which outranks `CLEAR` (every applicable rule ran and none fired). A target
Tripwire couldn't fully check is never reported as `CLEAR`. An `UNCHECKED` result carries a short
reason when there is one ("Nansen credit cap reached", "Pick a market", "Pick Yes or No"), shown
on the chip and strip.

## Venues

| Venue | Tier | URL pattern | What's read |
|---|---|---|---|
| Jupiter | 1 | `jup.ag/swap/<in>-<out>`, or `?sell=&buy=` / `?inputMint=&outputMint=` on `/swap` or the root page | spot, output mint (Solana); anchor: the exact "Swap" / "Place order" button |
| pump.fun | 1 | `pump.fun/coin/<mint>` | spot (Solana); anchor: "Place trade", else an exact "Buy" in the trade form (token-card quick-buys ignored) |
| Uniswap | 1 | `app.uniswap.org?outputCurrency=&chain=` | spot (EVM); no `chain` param -> null target, UNCHECKED dock (no chain to guess) |
| Jumper | 1 | `jumper.exchange?toChain=&toToken=` | spot (EVM or Solana, by chain id); anchor: a whole-label Exchange/Swap/Bridge/Review button, never nav or tab items |
| Hyperliquid | 1 | `app.hyperliquid.xyz/trade/<COIN>` | perp, coin + long/short side read from the selected side toggle; anchor: the order form's submit, never the side toggles; HIP-3 non-crypto markets (e.g. `/trade/xyz:TSLA`) -> null target, UNCHECKED dock |
| Polymarket | 1 | `polymarket.com/event/<event>[/<market>]` | prediction; checked only when the URL names a market or the event has exactly one open market ("Pick a market" otherwise), the market's outcomes are exactly Yes/No, and the outcome is read from the trade form that owns the button ("Pick Yes or No" otherwise) |
| Raydium | 2 | `raydium.io?outputMint=` | spot (Solana), dock only |
| Aerodrome | 2 | `aerodrome.finance?to=` | spot (Base), dock only |
| PancakeSwap | 2 | `pancakeswap.finance?outputCurrency=&chain=` | spot (EVM), dock only; no `chain` param -> null target, UNCHECKED dock |
| 1inch | 2 | `app.1inch.io#/<chainId>/simple/swap/<from>/<to>` | spot (EVM), dock only |
| Matcha | 2 | `matcha.xyz?buyAddress=&chainId=` | spot (EVM), dock only; no `chainId` param -> null target, UNCHECKED dock |
| CoW Swap | 2 | `swap.cow.fi#/<chainId>/swap/<sell>/<buy>` | spot (EVM), dock only |
| Axiom | 2 | `axiom.trade/...` | spot, first address found in the path, dock only |
| Photon | 2 | `photon-sol.tinyastro.io/...` | spot, first address found in the path, dock only |
| BullX | 2 | `neo.bullx.io/...` | spot, first address found in the path, dock only |
| GMGN | 2 | `gmgn.ai/<chainHint>/token/<addr>` | spot, chain hint from the path segment, dock only |
| Dexscreener | 2 | `dexscreener.com/<chain>/<pair>` | none — the URL's pair address is a pool address, not the token; always an UNCHECKED dock |
| Birdeye | 2 | `birdeye.so/token/<addr>?chain=` | spot (default Solana), dock only |

Tier 1 reads the live DOM and can put a block screen over the trade button. Tier 2 is
URL-derived only and never blocks — no button to find, just a docked panel.

## Architecture

```mermaid
flowchart LR
  x[x.com content script] --> bg[Extension background worker]
  v[Venue content script + adapters] --> bg
  bg -->|http://127.0.0.1:3000| api[Next.js API routes]
  api --> core[@tripwire/core signals + rules]
  api --> client[Nansen client: cache, dedupe, ledger, budget]
  client --> db[(node:sqlite .data/tripwire.db)]
  client --> nansen[Nansen API v1]
  api --> gamma[Polymarket Gamma API: slug to market id]
  pages[/rules /ledger /history pages/] --> db
```

Repo layout:

```
packages/core/       pure TS: types, zod schemas, signals, rules engine, presets
apps/web/             Next.js backend on 127.0.0.1:3000: Nansen access, cache, ledger,
                       rules storage, /, /rules, /ledger, /history pages
apps/extension/        WXT Chrome MV3 extension: x.com content script, venue adapters +
                       block/dock UI, popup, background bridge
fixtures/nansen/       live-recorded responses, used by replay mode and tests
docs/                  ARCHITECTURE.md, DECISIONS.md, SPIKE.md
scripts/                record-fixtures.mjs
```

## Nansen usage and the 1,000-call ledger

Every Nansen call is logged (endpoint, status, credits, latency) to the local `ledger` table
and shown at `/ledger` — the buildathon's evidence of real, repeated Nansen integration, not
a handful of demo calls.

Each endpoint wrapper in `apps/web/lib/nansen/endpoints.ts` sets its own cache TTL, so repeat
checks on the same token/coin/market don't re-spend credits inside the window. Dated request
bodies round their `to` down to the TTL (and derive `from` from it), so the cache key holds for
the whole window:

| Endpoint | TTL |
|---|---|
| `tgm/flow-intelligence` | 5 min |
| `tgm/who-bought-sold` | 5 min |
| `tgm/indicators` | 6 hours |
| `tgm/token-ohlcv` | 5 min |
| `smart-money/netflow` | 15 min |
| `search/general` | 24 hours |
| `profiler/address/current-balance` | 30 min |
| `perp-screener` | 2 min |
| `tgm/perp-positions` | 2 min |
| `smart-money/perp-trades` | 5 min |
| `prediction-market/market-screener` | 1 hour |
| `prediction-market/top-holders` | 5 min |
| `prediction-market/pnl-by-address` | 24 hours |
| `prediction-market/trades-by-market` | 2 min |

Polymarket slug lookups (Gamma API, no credits) cache a found market for 1 hour and a
not-found or ambiguous event for 5 minutes; failed lookups are never cached.

`NANSEN_DAILY_CREDIT_CAP` (default 3000, `apps/web/.env.local`) is a hard daily spend cap. A
call that would exceed it returns stale cache if there is one. Otherwise that data is missing:
`/api/guard` and `/api/post-intel` still answer 200 with verdict `UNCHECKED` and headline
"Nansen credit cap reached" (never a block, never CLEAR), and the chip/strip show that
headline. Routes with nothing to fall back on (`/api/resolve`, `/api/person-intel`) answer
HTTP 429 `{ error: "budget" }`, which the extension also shows as "Nansen credit cap reached".

`node scripts/record-fixtures.mjs` re-records the fixtures in `fixtures/nansen/` from live
Nansen calls (needs a working key; costs credits — see the header comment in the script
before running it).

## Nansen CLI and MCP

- The backend reads `NANSEN_API_KEY`, falling back to the key saved by `nansen login`
  (`~/.nansen/config.json`) — see ADR-0004 in `docs/DECISIONS.md`. Anyone already using the
  Nansen CLI needs no extra setup.
- For AI-assisted development, `.mcp.json.example` includes the Nansen MCP server
  (`https://mcp.nansen.ai/ra/mcp`, header `NANSEN-API-KEY: ${NANSEN_API_KEY}`); copy it to
  `.mcp.json` when a task needs it, or run `nansen mcp install claude-code`.
- `docs/SPIKE.md`'s re-run commands use the Nansen CLI directly.

## Development

- `pnpm verify` — typecheck and tests across every workspace.
- Per package: `pnpm -F @tripwire/core test`, `pnpm -F web test`, `pnpm -F extension test`
  (or `typecheck` in place of `test`).
- `pnpm -F web build` / `pnpm -F extension build` — production builds.
- `pnpm dev:replay` — replay mode on any shell (wraps `TRIPWIRE_REPLAY=1 pnpm -F web dev`),
  no network calls, no key needed.
- `pnpm verify:e2e` — Playwright smoke: the built extension in Chromium against a replay
  backend and stubbed X / Jupiter pages (not part of `pnpm verify`; needs port 3000 free and
  `pnpm exec playwright install chromium` once).
- `node scripts/record-fixtures.mjs` — re-record fixtures from live Nansen calls (costs
  credits).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Chip or dock says "backend offline" | `apps/web` isn't running, or the extension's configured backend URL doesn't match it | Run `pnpm -F web dev`; check the URL in the extension popup (default `http://127.0.0.1:3000`) |
| "Nansen credit cap reached" | `NANSEN_DAILY_CREDIT_CAP` hit for the UTC day | Raise the cap in `apps/web/.env.local`, or wait for the next UTC day; cached results still serve |
| A tier-1 venue shows a floating dock instead of a block screen | The venue changed its markup and the adapter's `anchor()` can no longer find the trade button | Tripwire never blocks blind — it falls back to a docked panel rather than guess at a button; file/fix the adapter in `apps/extension/lib/adapters/` |
| Every API call answers 403 "origin not allowed" | The extension was loaded with a different key (a fork), so its ID isn't the pinned one | Set `TRIPWIRE_EXTENSION_ORIGIN=chrome-extension://<your id>` for `apps/web` |
| No chip appears on X posts | X changed its DOM structure and the content-script parser no longer matches | Check `apps/extension/entrypoints/x.content/` against the fixture tests in `apps/extension/test/` |

## Security and privacy

- **Key handling:** `NANSEN_API_KEY` is read only by `apps/web/lib/nansen/key.ts`, used only
  as the `apikey` header to `api.nansen.ai`, and never sent to the extension, logged, or
  written to a fixture.
- **Origin allowlist:** `apps/web/lib/origin.ts` only serves the local pages
  (`http://127.0.0.1:3000`, `http://localhost:3000`) and the Tripwire extension itself. The
  extension ID is pinned by the public `key` in `apps/extension/wxt.config.ts`
  (`TRIPWIRE_EXTENSION_ID` in `packages/core/src/constants.ts`); forks set
  `TRIPWIRE_EXTENSION_ORIGIN`. Other websites and other installed extensions get 403, so they
  can't spend the user's Nansen credits or change their rules. A request without an Origin is
  allowed only from non-browser clients or same-origin/user-initiated requests
  (`Sec-Fetch-Site`).
- **Host allowlist:** every page and API route (`apps/web/proxy.ts`) refuses a Host other than
  `127.0.0.1` / `localhost` on the backend port (`TRIPWIRE_PORT`, default 3000), which defeats
  DNS rebinding.
- **No framing:** every response sends `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  `Referrer-Policy: no-referrer` and `nosniff`. Lowering the preset or removing a block rule in
  `/rules` asks for an inline confirm.
- **Extension messaging:** the background worker only answers messages from its own extension.
- **No page HTML injection:** venue adapters and the X content script read only
  `textContent`/attributes from the host page, never `innerHTML`, and never write arbitrary
  HTML into it.
- **Local data:** everything Tripwire stores (cache, ledger, rules, check history) lives in
  `apps/web/.data/tripwire.db` (SQLite via `node:sqlite`), gitignored, never uploaded.

## License

MIT. See `LICENSE`.
