# SPIKE: X-account badges for Hyperliquid / Polymarket

Feasibility spike, 2026-09-17. Goal: next to a post author's username on X, show a
Hyperliquid and/or Polymarket badge with stats, when that X account has a known account on
the venue. Question: is there a reliable, non-guessing way to map X handle -> venue
address/wallet? Verified against live endpoints (Nansen CLI v1.44.3, Pro plan; public
Polymarket Gamma/data APIs; public Hyperliquid info API). Total Nansen spend: 19 credits.

This spike reaches the same conclusion the project already reached for person-intel
(`docs/SPIKE.md` ADR-0005): Nansen has no name->address resolver anywhere. What's new here
is checking whether the **venues themselves** expose an X link, and whether Hyperliquid's
ecosystem sites fill that gap. They don't, reliably.

## Recommendation

| Venue | Recommendation |
|---|---|
| Polymarket | **Don't build handle-badge auto-detection.** No public field exists that ties a Polymarket profile to an X account. A name-similarity match is a guess with real false-positive risk (impersonator/fan accounts rank alongside or above the real person). Build only a **manual/curated mapping**: a small hardcoded table of X handle -> Polymarket `proxyWallet`, populated by a human who confirmed the link (e.g. from the person's own bio/pinned post, or Polymarket's in-app rewards-program X verification, which isn't exposed via public API). Stats calls are cheap once you have a confirmed address. |
| Hyperliquid | **Don't build automatic X mapping at all**, curated-only same as above. Hyperliquid has no account-linking concept and Nansen has no entity-name-to-address resolver for HL (confirmed against docs and live calls). Once an address is known (curated), stats are free and rich via Hyperliquid's own public API — no Nansen credits needed for the badge itself. |

Net: badges are feasible as a **curated allowlist product** (ship a short, human-verified
list of public figures' known addresses, refreshed manually), not as a **generic "any X
account" auto-detector**. Auto-detection would require guessing by display-name similarity,
which the project's own ADR-0005 already rejected for the same reason (false matches).

## Polymarket: mapping method

**Checked:** `gamma-api.polymarket.com/public-search?q=<term>&search_profiles=true`,
`gamma-api.polymarket.com/public-profile?address=<wallet>`, `data-api.polymarket.com/value`,
`data-api.polymarket.com/positions`.

**Finding: no X/Twitter field exists in the public profile schema.** The full field set
returned by `public-profile` (`PublicProfileResponse` schema) is: `proxyWallet`, `name`
(display name, user-chosen, unverified), `pseudonym` (Polymarket's auto-assigned handle),
`profileImage`, `bio`, `displayUsernamePublic`, `verifiedBadge`, `takerTier`/`takerTierName`,
`weightedVolume`, `createdAt`, `users[].{id,creator,mod,communityMod}`. No `twitter`, `x`, or
any social-handle field, verified or not.

**False-match risk, demonstrated live:** `public-search?q=elon` returned 5 profiles named
`elon-yaps`, `Elon-Musk`, `Elon-Musk-69420` (bio: "Defending the country of the brave."),
`0xPoni-Elon` (bio: "Love Elon"), `Elon`. All have `displayUsernamePublic: true` and none has
`verifiedBadge: true`. Nothing in the API distinguishes an impersonator/fan account from the
real person — `name` is an arbitrary, unverified, user-chosen string. Same result for
`q=Theo` (5 candidates, no disambiguator). **Exact-match-by-handle is not possible today**;
this venue only supports fuzzy name search, which is a guess, not a match.

`verifiedBadge` exists as a field but was `false` on every profile checked, including the
"Elon-Musk" one — it appears to denote a KYC/compliance tier, not identity verification tied
to X. It is not usable as an X-linkage signal without further, unverified investigation.

**Conclusion:** Polymarket's public API cannot answer "does X handle @foo have a Polymarket
account" reliably. The task's premise ("Polymarket profiles can link X accounts") was not
confirmed by any publicly reachable endpoint. If Polymarket's own web app surfaces a
verified X link (e.g. for its rewards-program identity checks) it is not present in
`public-profile`/`public-search`, and scraping the logged-out app for a client-rendered field
was not attempted (out of scope, ToS risk, and not needed given curated approach below).

## Hyperliquid: mapping method

**Checked:** Nansen `research perp leaderboard` (sampled top 100 by PnL), Nansen `research
search --type entity`, Nansen `research profiler search`, Nansen docs for
`address-perp-positions` and `hyperliquid-address-leaderboard`, `HypurrScan` root page.

**No entity-name -> address resolver exists anywhere in Nansen.** Docs for
`address-perp-positions` confirm the only input is `address` (42-hex), no `entity_name` or
handle param. `research search --query "Cobie" --type entity` returns `{"name":"Cobie",
"tags":["Public Figure"],"rank":10001}` — a label only, no address, same shape as ADR-0005
already found for spot entities. There is no follow-up command in the CLI's schema
(`nansen schema`) that expands an entity to an address.

**Leaderboard labels are not X handles.** Sampled the top 100 rows of `perp leaderboard`
(5 credits): unique `trader_address_label` values were ENS names (`cosmicvision.eth`,
`rjgrant.eth*`, `thankjeff.eth`, ...) and Nansen's own behavioral tags (`HL Perps Whale`,
`Token Millionaire`, `High Activity`, `High Balance`, `Uses "<code>" HL Referral Code`). None
were X handles or public-figure names. Docs describe `trader_address_label` as "derived using
Nansen's multichain label function," i.e. Nansen's own labeling, not a social-media link.

**HypurrScan/Hyperdash:** HypurrScan's root page is a client-rendered SPA shell with no
content reachable by a plain fetch; no public API path for a twitter/handle field was found
(`/twitter`, `/valLabels` guesses both 404). `data.hyperdash.info` doesn't resolve. Neither
was investigated further via authenticated/logged-in scraping (out of scope; would also carry
ToS risk for automated large-scale use even if a page renders a "Twitter" field for a few
known whales in its UI).

**Conclusion:** no reliable X->HL-address mapping exists via Nansen or the checked public
tools. Same curated-list approach as Polymarket is the only sound option.

## Stats: what's available once an address is known

**Polymarket** (Nansen `prediction-market/*`, 1 credit each unless noted):
- `address-summary` -> `first_seen`, `wallet_age_days`, `realized_pnl_usd`,
  `unrealized_pnl_usd`, `total_pnl_usd`, `markets_won`, `markets_traded`, `win_rate`.
  Verified live on a real address: `win_rate: 0.5` (5/10 markets), PnL fields populated.
- `pnl-by-address` -> per-market rows (`market_id`, `question`, `side_held`, costs,
  proceeds, `total_pnl_usd`, `market_resolved`) — filter `market_resolved: false` client-side
  for "open positions."
- `trades-by-address` -> recent trade log (`timestamp`, `side`, `size`, `price`, `usdc_value`,
  `tx_hash`, `market_question`) for a "recent trades" feed.
- `position-detail` (5 credits) is per-market, not needed for a badge summary.
- Badge cost: **3 credits** (address-summary + pnl-by-address + trades-by-address), all 1
  credit each, confirmed live.

**Hyperliquid** — the badge doesn't need Nansen at all for live numbers:
- `api.hyperliquid.xyz/info` `clearinghouseState` (free, public, no auth) ->
  `marginSummary.accountValue`, per-position `positionValue`, `unrealizedPnl`, `leverage`,
  `liquidationPx`, `returnOnEquity` — "open positions" and "account value" directly.
- `api.hyperliquid.xyz/info` `userFills` (free, public) -> per-fill `closedPnl`, `px`, `sz`,
  `side`, `dir`, `time`, `hash` — "recent trades" and realized PnL, verified live on a real
  top-leaderboard address.
- Win rate isn't a native field on either call; it would need to be derived client-side from
  `userFills` (win = fills with positive `closedPnl`) over a chosen lookback window.
- Nansen `profiler perp-positions` / `profiler perp-trades` / `research perp-pnl-summary` (1
  credit each) exist as an alternative/cross-check but add cost with no stat HL's own API
  lacks. Badge cost: **0 Nansen credits** if using HL's public API directly.

## Rate/caching recommendations

- Polymarket: cache `address-summary`/`pnl-by-address`/`trades-by-address` per wallet for
  10-15 min; these are historical aggregates that don't need real-time freshness for a badge.
- Hyperliquid: `clearinghouseState` can be polled more aggressively (it's free and public) but
  still cache 30-60s per address to avoid hammering HL's public infra; it's rate-limited
  per-IP and shared with the rest of the ecosystem. `userFills` cache 5-10 min.
- Because the mapping is curated (a static list), cache/refresh the mapping table itself
  independently of the stats — it changes rarely, stats change often.
- Respect Polymarket/Hyperliquid ToS: both public data APIs are documented/intended for this
  kind of read; nothing above required auth bypass or scraping behind a login. HypurrScan/
  Hyperdash were not scraped (SPA, no accessible public API found) — if a future pass wants
  their data, treat it as a ToS/ownership question to resolve explicitly, not a default.

## Blockers

1. No exact X-handle field on Polymarket profiles (public API) — mapping cannot be automatic
   without unacceptable false-match risk.
2. No entity-name -> address resolver for Hyperliquid anywhere checked (Nansen or HL
   ecosystem sites) — same blocker, worse (Polymarket at least has fuzzy name search to seed
   manual curation from; HL has nothing beyond ENS/behavioral labels on a leaderboard).
3. Both blockers point to the same fix: ship with a small, manually-verified handle->address
   table (a handful of well-known public figures), not a generic detector. This matches the
   project's existing ADR-0005 stance on person-intel.
