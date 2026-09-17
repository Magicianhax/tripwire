# SPIKE: Nansen live checks

Results from live calls against the Nansen API during development (Nansen CLI v1.44.3, Pro
plan). These findings drove ADR-0004, ADR-0005 and ADR-0006 in `docs/DECISIONS.md` and the
fixtures in `fixtures/nansen/`. This is a record, not a script to re-run before every demo —
re-run only the specific checks below if you want to verify one against your own key.

## Credits per call

Credit cost is read from the `x-nansen-credits-used` response header on each call.

| Credits | Endpoints |
|---|---|
| 1 | `tgm/flow-intelligence`, `tgm/who-bought-sold`, `tgm/token-ohlcv`, `profiler/address/current-balance`, `perp-screener`, `prediction-market/market-screener`, `prediction-market/trades-by-market`, `prediction-market/pnl-by-address` |
| 5 | `tgm/indicators`, `smart-money/netflow`, `tgm/perp-positions`, `smart-money/perp-trades`, `prediction-market/top-holders` |
| 0 (no header) | `search/general` |

A single spot chip therefore costs roughly 1 (flow) + 5 (netflow) + 5 (indicators) = 11
credits on a cold cache; `apps/web/lib/nansen/client.ts` caches per-endpoint (TTLs in
`apps/web/lib/nansen/endpoints.ts`) so a warm chip costs 0.

## Quirks found against live data

- **Null segment flows when `wallet_count` is 0.** `tgm/flow-intelligence` returns
  `null` for a segment's net flow when that segment had zero wallets in the window, not `0`.
  `packages/core/src/signals/spot.ts`'s `seg()` treats a `null` value with `wallet_count: 0`
  as a real `0`, and a `null` value with a `null`/nonzero count as missing data.
- **`fresh_wallets` is null under 1 day.** For `timeframe` windows shorter than `1d`,
  `fresh_wallets` is `null` and `fresh_wallets_wallet_count` is always `0` regardless of the
  window. `fresh_buy_share` reports "unavailable" rather than a false `0%`.
- **Risk and reward indicator arrays are mixed.** `tgm/indicators` does not reliably file an
  indicator under the array its name implies; `risk_high_count` (ADR-0006) scans both
  `risk_indicators` and `reward_indicators` and counts only `concentration-risk`,
  `liquidity-risk` and `token-supply-inflation` at `score: "high"`. `btc-reflexivity` is
  excluded — it reads "high" for large-cap majors such as WIF, which is market beta, not a
  token-specific risk.
- **`search/general` returns Hyperliquid pseudo-tokens.** A token search can return synthetic
  entries for Hyperliquid perp markets alongside real spot tokens; callers filter by chain/
  address shape before treating a result as a spot target.
- **`owner_address` is `"0x"` when there is no proxy owner.** `prediction-market/top-holders`
  always includes the field; a Polymarket position held directly (no SAFE proxy) has
  `owner_address: "0x"` rather than an absent field. `holderKey()`
  (`packages/core/src/signals/prediction.ts`) falls back to `address` in that case.
- **`market_id` is numeric and matches Polymarket's Gamma `id`.** Nansen's
  `prediction-market/*` endpoints take the same numeric id Polymarket's public Gamma API
  (`gamma-api.polymarket.com`) returns as `id` for a market. A `market-screener` query by
  slug returns nothing — slug-to-id resolution has to go through Gamma
  (`apps/web/lib/intel/prediction.ts:resolveMarket`), which is why Tripwire calls Gamma
  directly (not a Nansen endpoint, no credits) before calling any `prediction-market/*`
  endpoint.

## Re-run a check yourself

These use the Nansen CLI (`npm i -g nansen-cli && nansen login`), which reads the same
`apikey` header Tripwire's backend uses (ADR-0004).

**Entity-name search for a known KOL:**
```
nansen research search --query "Vitalik" --type entity
```
Expect a `tags` array per match and no wallet address in the response — this is why
Tripwire's person-intel matches an X display name/handle to an entity name and shows current
holdings (`profiler/address/current-balance`), never a guessed wallet (ADR-0005).

**Credit cost for one endpoint** (watch the response headers, or use `--verbose` if your CLI
version prints them):
```
nansen research token flow-intelligence --chain solana --token EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --timeframe 1d
```

**Polymarket slug to market_id:**
```
curl -s "https://gamma-api.polymarket.com/markets?slug=bitcoin-above-72k-on-september-17-2026" | jq '.[0].id, .[0].slug'
nansen research prediction-market top-holders --market-id <id-from-above>
```

**Risk indicators (mixed array check):**
```
nansen research token indicators --chain solana --token EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
```
Confirm entries with `"score": "high"` can appear under either `risk_indicators` or
`reward_indicators`.
