# Tripwire: Design Spec

**Date:** 2026-09-17
**Event:** Nansen Meridian Buildathon (Sep 14–27, 2026)
**Status:** Approved in brainstorming, pending spec review

## 1. Summary

Tripwire is a Chrome extension with a local Next.js backend. It puts Nansen onchain intelligence on the pages where people talk about trades and make them:

- **X:** every post that mentions a token gets a verdict chip. The chip opens a panel showing who bought and who sold since the post, and, where Nansen has a label for the author, what the author's own wallet did.
- **Trading venues:** before you trade, Tripwire checks your own rules against live Nansen data. It either blocks the trade button with the evidence behind the block or shows a warning.

Tripwire never touches wallets or signing. It only adds informed friction.

### Why it can win
| Judging criterion (25% each) | How Tripwire addresses it |
|---|---|
| Data integration | Nansen data drives every verdict and block decision; each warning cites endpoint, field and value |
| Creativity | Not a dashboard; Nansen intelligence appears on X and inside the trade flow |
| Functionality | Live data, caching, a credit budget, and states for missing data (UNCHECKED, never a false CLEAR) |
| Documentation | Setup in under 10 min, a demo with no narration, a `/ledger` page proving calls |

### Out of scope
- Automated trading, transaction signing or interception, wallet connection.
- Guessing wallets for unlabeled X accounts (no OSINT).
- Nansen Agent endpoints (200–750 credits per call).
- Deploying to production. The backend runs locally.

## 2. Architecture

```
apps/web        Next.js (App Router): API routes, /rules, /ledger, /history
apps/extension  WXT + React + Manifest V3: content scripts, background worker, Shadow DOM UI
packages/core   shared types, zod schemas, signals, rules engine (pure, no I/O)
fixtures/       recorded Nansen responses + venue HTML snapshots (tests only)
```

Monorepo using pnpm workspaces. SQLite via Drizzle for rules, cache, ledger and overrides (local file).

### 2.1 Extension

**Background service worker:** the only component that talks to the backend (default `http://127.0.0.1:3000`, configurable). It merges identical requests coming from many tabs or posts.

**X content script** (`x.com`)
- A MutationObserver on `article[data-testid="tweet"]` extracts:
  - cashtags
  - Solana base58 and 0x contract addresses
  - the author's handle
  - `time[datetime]`
  - the post ID
- It adds a verdict chip under each post that mentions a token. Clicking the chip opens a slide-out panel rendered in the page.
- On profile pages, it shows a person card, only when Nansen has a label for the author.
- When a cashtag matches several tokens, the most liquid match is used and the chip shows "N matches" with a switcher.
- Page reading is isolated in one module with fallback selectors.

**Venue adapters**, one small module each, sharing this interface:
```ts
interface VenueAdapter {
  id: string;
  tier: 1 | 2;
  match(url: URL): boolean;
  readTarget(doc: Document, url: URL): Target | null;
  anchor(doc: Document): HTMLElement | null; // tier 1: trade button to cover
}
type Target =
  | { kind: "spot"; chain: Chain; tokenAddress: string }
  | { kind: "perp"; coin: string; side?: "long" | "short" }
  | { kind: "prediction"; marketId?: string; slug: string; outcome?: "yes" | "no" };
```

| Tier | Venues | Treatment |
|---|---|---|
| 1 | X, Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket | Full block screen over the trade button, or a warning strip |
| 2 | Raydium, Aerodrome, PancakeSwap, 1inch, Matcha, CoW Swap, Axiom, Photon, GMGN, BullX, Dexscreener, Birdeye | Floating panel docked to the screen edge, reading only the URL, no button blocking |

The target is re-checked when it changes (token, side or outcome), with 400ms debounce.

All UI renders inside Shadow DOM. Page text is never inserted as HTML. Addresses are validated before any request.

Extension permissions: the listed venue domains and `127.0.0.1` only. No `<all_urls>`.

### 2.2 Backend routes
| Route | Input | Output |
|---|---|---|
| `POST /api/post-intel` | token ref, post timestamp | signals, verdict, panel data |
| `POST /api/person-intel` | X handle, token, post timestamp | entity, trades and balances around the post (see §6 spike) |
| `POST /api/guard` | Target | signals, rule evaluation, verdict |
| `GET/PUT /api/rules` | preset or rules | rules |
| `GET /api/ledger` | none | call count, credits, per-endpoint breakdown |
| `POST /api/override` | target, verdict, rule hits | logged override |

API routes reject any request that doesn't come from the extension's `chrome-extension://<id>` origin. The server binds to `127.0.0.1`.

## 3. Data

Two layers per surface: a **chip or banner** (cheap, always shown) and a **panel** (complete, loaded on click).

### 3.1 Spot token
| Layer | Endpoint | Use | Cache time |
|---|---|---|---|
| chip | TGM Flow Intelligence (smallest `5m…7d` window covering the post's age) | net flow for Smart Trader, Whale, Public Figure, Top PnL, fresh wallets | 5m |
| panel | TGM Who Bought/Sold (BUY and SELL, since post or last 24h) | top labeled buyers and sellers | 5m |
| panel | Smart Money Netflows (`token_address` filter) | 1h/24h/7d/30d net flow | 15m |
| panel | TGM Nansen Indicators | risk ratings (concentration, liquidity, supply inflation), momentum | 6h |
| panel | TGM Price OHLCV | price since post, with the post's time marked | 5m |
| lookup | Search (general) | cashtag → token address | 24h |

### 3.2 Perp (Hyperliquid)
| Layer | Endpoint | Use | Cache time |
|---|---|---|---|
| banner | Perp Screener (`trader_type: sm`) | Smart Money long vs short USD, trader counts, funding | 2m |
| panel | Token Perp Positions (`label_type: smart_money`, top 50) | side, size, leverage, entry and liquidation prices → liquidation bands | 2m |
| panel | Smart Money Perp Trades (`lookback_hours: 24`) | recent opens and closes | 5m |

### 3.3 Prediction (Polymarket)
| Layer | Endpoint | Use | Cache time |
|---|---|---|---|
| lookup | Market Screener (`query` = slug or question) | slug → market ID | 1h |
| banner | Market Top Holders (top 20 per side) | positions by side | 5m |
| panel | PnL By Address (per top holder) | lifetime profit → "proven winners" weighting | 24h |
| panel | Trades By Market, Market Orderbook | large recent trades, order book depth | 2m |

### 3.4 Person on X
- Handle → Nansen entity search (entity-name costs 0 credits).
- If an entity with addresses is found: Profiler Address DEX Trades and Current Balances for the posted token, from 24h before to 24h after the post.
- If the search doesn't return addresses, this feature is dropped and the panel shows post-level data only (see §6).

### 3.5 Signals
Pure functions in `packages/core/signals`. Each returns:
```ts
{ id: SignalId; severity: "info" | "warn" | "high"; value: number | null;
  evidence: { endpoint: string; field: string; value: string }[] }
```
| Signal | Kind | Fires when |
|---|---|---|
| `exit_pressure` | spot | Smart Trader, Whale and Public Figure net flow is negative while fresh-wallet net flow is positive |
| `sm_netflow_negative` | spot | Smart Money 24h net flow is below the threshold |
| `shill_dump` | spot | the author's wallet net-sold the token within 24h after the post |
| `risk_flags` | spot | any Nansen risk indicator is rated `high` |
| `sm_opposite_side_pct` | perp | Smart Money USD share on the other side of the user's trade exceeds the threshold |
| `inside_liq_band` | perp | mark price is within N% of a cluster of Smart Money liquidation prices |
| `smart_side_disagrees` | prediction | profit-weighted top holders favour the other outcome beyond the threshold |

Missing inputs make the signal return `value: null` (unavailable). It never fires, and it never counts toward CLEAR.

## 4. Rules and verdicts

```ts
type Rule = { id: string; kind: "spot" | "perp" | "prediction"; signal: SignalId;
  op: ">" | "<" | ">=" | "<="; threshold: number; action: "warn" | "block"; enabled: boolean };
evaluate(rules: Rule[], signals: Signal[]): {
  verdict: "CLEAR" | "CAUTION" | "TRIPWIRE" | "UNCHECKED"; hits: RuleHit[] }
```
- **TRIPWIRE:** any `block` rule fires. **CAUTION:** any `warn` rule fires. **UNCHECKED:** no rule fires and a required signal is unavailable. **CLEAR:** otherwise.
- **Presets:** Degen, Balanced (default), Paranoid.
- **`/rules` editor:** each rule reads as a plain-English sentence with inline threshold inputs, an on/off toggle, and a preview showing how many of the last N checks it would have changed.

### Surfaces by verdict
| Verdict | Tier 1 venue | Tier 2 venue | X chip |
|---|---|---|---|
| TRIPWIRE | block screen covers the trade button: verdict, 1–3 rule hits with evidence, "See evidence" link, override | red panel | red |
| CAUTION | warning strip above the button (still clickable) | amber panel | amber |
| UNCHECKED | grey strip "couldn't check: \<reason>", button usable | grey panel | grey |
| CLEAR | small green confirmation strip | green panel | green |

**Override:** the user types a phrase for the trade type (e.g. `I AM EXIT LIQUIDITY`) → 60-second unlock → logged. `/history` lists overrides and later checks alongside the price move since.

## 5. Nansen client, reliability, security

- **Single client** in `apps/web/lib/nansen`:
  - In-memory LRU in front of a SQLite cache, keyed by `endpoint + normalized body`.
  - Cache times per endpoint as in §3.
  - Identical in-flight requests are shared.
- **Ledger:** every real call records endpoint, status, `X-Nansen-Credits-Used`, latency and timestamp.
- **Credit budget:**
  - Daily cap `NANSEN_DAILY_CREDIT_CAP` (default 300).
  - When reached, only cached data is served, labeled "Budget reached, showing cached data from HH:MM."
- **Rate limits:**
  - A token bucket stays under plan limits (Free: 15/s, 300/min; Pro: 75/s, 1,500/min).
  - Stricter per-endpoint buckets where documented.
  - On 429: honor `Retry-After`, retry once.
- **Failure behavior:**
  - Missing data → UNCHECKED, never CLEAR.
  - Partial data → remaining signals still run.
  - Backend unreachable → amber toolbar badge, overlays skipped.
  - Adapter can't find its anchor → falls back to the floating panel and logs `adapter_miss`.
- **Secrets:**
  - `NANSEN_API_KEY` only in `apps/web/.env.local` (gitignored); `.env.example` is committed.
  - The key never reaches the extension.
  - gitleaks pre-commit hook.
- **Replay mode:**
  - `TRIPWIRE_REPLAY=1` serves the recorded fixtures, for tests only.
  - A permanent "REPLAY" watermark shows in all UI.

## 6. Open risk: live check before building the person feature

Before building `/api/person-intel`, run one live test:
1. Does Nansen search return public-figure or KOL entities for X display names or handles?
2. Can an entity be resolved to addresses (via the search response or another endpoint)?

Results go in `docs/SPIKE.md`. If either answer is no, `shill_dump` and the person card are removed and the spec is updated.

Also check live: actual credit cost per endpoint (`X-Nansen-Credits-Cost`), and how well Polymarket slugs resolve to market IDs.

## 7. Visual design

Visual design is a separate pass before building the UI. It uses `rules/design.md`: create DESIGN.md, apply web-design-guidelines, apply craft, then deslop. Mockups of the chip, panel, block screen, Hyperliquid liquidation ladder and Polymarket proven-winners split come first.

**Hard constraints from the user:**
- No terminal or retro aesthetics.
- No editorial styling.
- No AI-generated look: no default gradients, glassmorphism or generic card grids.

## 8. Testing

- **`packages/core`:** Vitest, test-first.
  - Each signal is tested at its edges: zero flows, missing segments, fresh-wallet data that's null for windows under 1 day.
  - Each preset is tested against recorded should-block and should-clear fixtures.
- **Nansen client:**
  - cache hits and in-flight request sharing
  - 429 retries
  - stopping at the credit cap
  - ledger writes, with HTTP mocked
- **Adapters:** a saved HTML snapshot per venue; the test checks `readTarget` and `anchor`.
- **End to end:** Playwright with the unpacked extension and local backend.
  - X chip → panel
  - Jupiter memecoin → block screen → override
  - Hyperliquid long → warning strip
- **Before recording:** refresh the venue snapshots and run the live checks.

## 9. Demo and submission

**Recording** (about 90s, captions only):
1. X timeline: chips appear; a shilled memecoin shows red; the panel shows the flow split.
2. Click through to Jupiter: the block screen with evidence.
3. Hyperliquid long: Smart Money is mostly short and the entry is inside their liquidation band.
4. Polymarket YES: proven winners hold NO.
5. Jumper: the destination token is flagged.
6. `/rules` preset switch, then `/ledger` past 1,000 calls.

**README:**
- GIF and video at the top.
- Setup: clone → `pnpm i` → `.env.local` → `pnpm dev` → load `apps/extension/.output/chrome-mv3` unpacked. Target: under 10 minutes.
- A venue tier table.
- A signal → endpoint table.

**Submission:** email, X post tagging @nansen_ai, GitHub repo. The user posts and submits.

**Credits:**
- The free plan's 100 credits can't reach 1,000 calls; the Pro plan (2,000 credits) or a top-up is needed.
- Prefer 1-credit endpoints and caching.
