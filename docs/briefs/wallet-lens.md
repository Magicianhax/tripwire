# Wallet lens (controller brief)

User request (2026-09-17): "if someone has shared wallet address anywhere, ens, or something a trade or something on Polymarket, hyperliquid or dex screener or whatever or even on X, or an ens domain, pendle fi — we can get info about that wallet via our extension".

Goal: anywhere an address or ENS name appears, Tripwire can show what Nansen knows about that wallet, plus its Hyperliquid and Polymarket activity.

## Where it runs
- **Already granted:** x.com/twitter.com, the tier-1 and tier-2 venue hosts (includes dexscreener.com, birdeye.so, polymarket.com, app.hyperliquid.xyz).
- **Anywhere else:** `optional_host_permissions: ["*://*/*"]` plus a popup action "Enable Tripwire on this site" that calls `browser.permissions.request({origins:[origin]})` for the current tab's origin, then registers the wallet-lens content script for it (`browser.scripting.registerContentScripts` or dynamic injection). List enabled sites in the popup with a remove action. Never request `<all_urls>` at install time, and never inject without the grant.

## Detection (content script `wallet.content`, shared detector module)
Scan text nodes and anchors (a `TreeWalker`, batched via `requestIdleCallback`, re-run on a debounced MutationObserver; skip inputs, textareas, contenteditable, script/style, and Tripwire's own UI):
- EVM address `0x` + 40 hex, checksum-tolerant.
- Solana base58, 32–44 chars, with a digit and letter mix as in `packages/core/src/addresses.ts`.
- ENS: `*.eth`, and treat `*.sol` as a Solana name (SNS).
- Addresses inside hrefs: etherscan/basescan/arbiscan/bscscan/polygonscan/snowtrace/optimistic.etherscan `/address/0x…`, solscan/solana.fm/xray `/account/…`, `polymarket.com/profile/0x…` or `?address=`, hypurrscan.io/`app.hyperliquid.xyz/explorer/address/…`, debank `/profile/0x…`, dexscreener `/maker/…`, pendle.finance dashboards.
- Skip contract addresses already handled as tokens by the venue adapters (if the page's target token equals the detected address, don't mark it).
- **Marker UI:** a 14px Nansen glyph button appended after the match (inline, `aria-label="Inspect wallet 0x1234…abcd with Tripwire"`), never re-wrapping the host text (wrap the match in a span only when it's a text node we own; otherwise position the marker absolutely next to the link). Max 40 markers per page, oldest recycled; unmount on detach (reuse the sweep from `lib/x/mounts.ts`).
- Clicking a marker opens the existing body-level popover card with the wallet card (below).

## Backend `POST /api/wallet`
Body: `{ query: string, chainHint?: Chain }` where query is an address or a name. Behaviour:
1. **Resolve:**
   - `*.eth` → ENS address. Resolve server-side, no key needed: try `https://api.ensideas.com/ens/resolve/<name>` then an ENS public resolver via a public RPC (`https://cloudflare-eth.com`, `eth_call` to the ENS registry/resolver), first success wins; verify with 2–3 known names (vitalik.eth) and record which source worked in the report. Cache 24h.
   - `*.sol` → SNS: check whether a free public resolver exists (e.g. `https://sns-api.bonfida.com/resolve/<name>`); if none is reliable, return `resolved:false` with a clear message instead of guessing.
   - Raw addresses pass through (validate EVM/Solana shape).
2. **Gather in parallel, `Promise.allSettled`, each block optional:**
   - Nansen `profiler/address/current-balance` (1 credit): total USD and top 6 holdings (token symbol, chain, value, logo when the token-info cache has one).
   - Nansen `profiler/address/pnl-summary` (1 credit; confirm path/cost from docs): realized PnL, win rate, trade count if present.
   - Nansen `search/general` on the address (0 credits) for a label/entity name, plus the existing `cleanLabel` for the label kind. Note: `profiler/labels` costs 100 credits — do NOT call it automatically; expose a "Load Nansen labels (100 credits)" button that calls a separate route `POST /api/wallet/labels` and is disabled unless `NANSEN_ALLOW_PREMIUM=1` in the env; say the cost in the button.
   - Hyperliquid public API (free): `clearinghouseState` + `userFills` — reuse the client from the badges build.
   - Polymarket via Nansen (`prediction-market/address-summary`, `pnl-by-address`) — reuse the badges code; only for EVM addresses.
   - Cache per address: 10 min for positions, 30 min for balances/PnL, 24h for ENS.
3. Response: `{ input, address, chainGuess, ens, label, holdings, pnl, hyperliquid, polymarket, sources: string[], errors: string[] }`. Never throw on one failed block.

## Wallet card (extension UI, Nansen theme)
Tabs: Overview · Hyperliquid · Polymarket (hide a tab with no data, show an empty state when the wallet simply has none).
- **Header:** identity line (ENS or entity name or shortened address), copy button, chain logos where held, "View on Nansen" link (`https://app.nansen.ai/profiler?address=<addr>` — verify this URL pattern with a web search before shipping; omit the link if it can't be verified).
- **Overview:** total portfolio value, top holdings rows (token logo/monogram, symbol, chain logo, value), realized PnL, win rate.
- **Hyperliquid:** account value, open positions table (coin, side chip, size, entry, mark, liquidation, uPnL), last fills.
- **Polymarket:** total PnL, open positions (question, side, value), recent trades.
- **Footer:** "Powered by Nansen" plus the free sources used, and the endpoint/credit count for transparency.
- Reuse the tabs, gauges and formatting from the evidence card; no emoji; Lucide icons; text ≥ 11px; contrast ≥ 4.5; targets ≥ 24px.

## Extras
- **Popup:** "Enabled sites" list, "Enable on this site", and a "Recent wallets" list (last 10 inspected, click to reopen the card).
- **Privacy:** addresses you inspect are sent to your own local backend, then to Nansen/Hyperliquid/Polymarket; nothing is stored beyond the local cache and the recent list. Say this in the README and the popup.
- Also use this card for the author badges' "linked wallet" view instead of a second implementation.

## Tests
- core: detector (EVM/Solana/ENS in text, hrefs of each explorer pattern, false positives such as tx hashes 0x+64, `0x` in prose, Solana-looking words), dedupe, marker cap
- web: `/api/wallet` resolution paths (address, .eth, bad input → 400), partial failure, cache, the labels route gated by env
- extension: marker mount/unmount on a fixture page, card tabs, permission-request flow mocked
- e2e: a stub page with an address and an ENS name — markers appear, the card opens, Hyperliquid tab shows the fixture position

## Verify
`pnpm verify`, both builds, e2e, captures `wallet-marker.png`, `wallet-card-overview.png`, `wallet-card-hyperliquid.png`, `enable-site.png`, detect once. Record fixtures for new endpoints with ONE live run (≤ 6 credits), never printing the key.

## Additional item (from the previous round's report)
- **Token logo proxy:** Nansen's token-information returns a third-party CDN logo URL, which the previous build refused to render because fetching it from the host page would leak which token the user is viewing. Add `GET /api/token-logo?chain=&address=` on the local backend: it fetches the logo server-side (allowlist the URL's host to what Nansen returns, https only, ≤ 200KB, image content-types only, 24h disk/memory cache), and the card renders `<img src="http://127.0.0.1:3000/api/token-logo?...">`. The extension then never talks to a third party, and the monogram stays the fallback. Tests: content-type and size rejection, cache hit, bad params → 400.
