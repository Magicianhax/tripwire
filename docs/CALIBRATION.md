# Tripwire spot calibration (2026-09-17)

Calibration spike, not product code. It answers one report — *"literally everything — HYPE, ZEC, WIF — is marking as exit liquidity"* — with live Nansen data on a 37-token sample, and proposes replacement signals and preset thresholds. Nothing under `packages/` or `apps/` was changed.

Sources: `tgm/flow-intelligence` (1d) per token, `token-screener` (24h and 7d) per chain for market cap / volume / liquidity / price change, `smart-money/netflow` filtered to the sample per chain, `tgm/indicators` for five tokens, `tgm/token-information` + `tgm/token-ohlcv` for four gaps. Raw JSON and the scripts live in the session scratchpad (`scratchpad/cal/`), not in the repo.

## 1. The report reproduces

Verdicts recomputed with today's `spotSignals` + `PRESETS` over the 37-token sample:

| Preset | CLEAR | CAUTION | TRIPWIRE | UNCHECKED |
|---|---|---|---|---|
| Degen (current) | 13 | 21 | 1 | 2 |
| Balanced (current) | 6 | 24 | 5 | 2 |
| Paranoid (current) | 1 | 0 | **35** | 1 |

Paranoid blocks 35 of 37 tokens including LINK, AAVE, PEPE, JUP and TRUMP. Balanced leaves only 6 tokens CLEAR and blocks PUMP, HYPE, UNI, USELESS and FARTCOIN. The user's three examples are all spot-tradable on a supported chain — HYPE (`98sMhv…zcjm`, Solana, $33.4M 24h volume, $64M mcap) and ZEC (`A7bdiY…QXaS`, Solana, $27.8M volume) are the bridged Solana spot markets a Jupiter page would resolve to, so all three were in range of the extension.

## 2. Four root causes

**(a) `fresh_buy_share` is ~100% by construction.** It is `fresh_positive / (fresh_positive + Σ positive labeled segments)`. Whenever every labeled segment is net negative — the normal state for a token being rotated out of — the denominator collapses to the fresh term and the share is exactly 100%. Sample median 97.0% (35 tokens where it is defined); it is above the Paranoid threshold (50%) for 31 of 37 tokens and above the Balanced threshold (70%) for 29. It reads as "fresh wallets are 100% of buying" even for AAVE, where *no labeled wallet traded at all* (0 wallets, $0 net).

**(b) Fresh-wallet net flow is not a share of DEX buying.** `fresh_wallets_net_flow_usd` exceeds the token's entire 24h DEX volume for AAVE (153%) and LAPTOP (322%), so it counts inbound transfers, bridge/claim receipts and CEX withdrawals into new wallets, not just swaps. Nansen also warns that `fresh_wallets_wallet_count` is always 0, so the segment cannot even be activity-gated. A number that big cannot be a denominator or a percentage of "buying".

**(c) Absolute USD thresholds scale with market cap, not with risk.** `-$100k` of labeled net flow is 0.28% of PUMP's 24h volume and 0.011% of its market cap — and 100% more than the entire 24h volume of a day-old pump.fun token. In the sample, Balanced's `-$100k` block fires on PUMP (−0.59% of volume), HYPE (−0.53%), UNI (−2.4%), USELESS (−0.62%) and FARTCOIN (−14.5%) — four of those five are ordinary rotation. Paranoid's `-$25k` additionally blocks ZEC (−0.11% of volume), RAY (−0.63%) and AERO (−0.18%).

**(d) Paranoid's `sm_netflow_24h < 0` is a coin flip, and the risk rule never fires.** Any negative Smart Money 24h number blocks, and 15 of 37 sample tokens are negative by amounts as small as −$174 (LOCKINU) or −$573 (WIF). Meanwhile `risk_high_count` scored 0 on all five tokens where indicators were pulled (WIF, LINK, PENGU, PAID, LOOM): the only `high` indicators returned were `cex-flows` and `btc-reflexivity`, both outside `TOKEN_RISKS`, so even Paranoid's `>= 1` rule contributes nothing. One preset rule is firing on everything and another on nothing.

Secondary: quiet tokens go UNCHECKED rather than CLEAR (BRETT, SPIRAL) because `fresh_buy_share` is `null` when no segment has positive flow — "no one is trading this" is rendered as "we couldn't check".

## 3. What the data actually looks like

Labeled net flow as a share of 24h volume separates the tiers far better than its dollar value does (T4 below): large caps cluster at |net| < 0.7% of volume, fresh memecoins run positive (labeled wallets are *buying* new launches: +1.5% to +3.5%), and the one genuine distribution event in the sample — FARTCOIN, −14.5% of volume from 17 labeled wallets with fresh wallets taking the other side — is an outlier by an order of magnitude on this scale while being unremarkable in dollars (−$287k, less than UNI's −$574k).

The 1d flow window says nothing about tokens that already dumped: LOOM (−75% in 7d), LAPTOP (−82%), OTC (−57%), USEFUL (−56%) and SPIRAL (−55%) all show labeled wallets *buying* the aftermath. A drawdown signal, not a flow signal, is what flags those.

### T1 — sample, raw (1d flow window, 24h market data)

| Token | Chain | Tier | Age d | Mcap | 24h vol | Liq | 1d % | 7d % | ST net | Whale net | PF net | Labeled net | Lab wallets | Lab gross | Fresh net | SM 24h netflow | SM traders |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WIF | solana | large | 1032 | $187M | $1.4M | $3.5M | 6 | -3 | -$573 | -$5k | -$2k | -$8k | 18 | $32k | $596k | -$573 | 17 |
| BONK | solana | large | 1379 | $240M | $1.7M | $1.4M | 7 | -2 | -$987 | -$2k | -$2k | -$5k | 28 | $85k | $257k | -$988 | 37 |
| JUP | solana | large | 966 | $778M | $5.9M | $3.7M | 11 | 2 | $21k | $13k | -$76 | $34k | 17 | $81k | $416k | $21k | 55 |
| PENGU | solana | large | 657 | $457M | $2.9M | $3.4M | 7 | -3 | -$2k | $7k | -$18 | $5k | 12 | $73k | $217k | -$2k | 45 |
| TRUMP | solana | large | 608 | $533M | $10.1M | $13.5M | 5 | -2 | $0 | $15k | -$45 | $15k | 10 | $112k | $742k | $0 | 37 |
| FARTCOIN | solana | large | 699 | $147M | $2.0M | $6.8M | 9 | 3 | -$224 | -$287k | -$207 | -$287k | 17 | $198k | $792k | -$225 | 60 |
| PUMP | solana | large | 434 | $1.85B | $35.6M | $17.4M | 7 | 0 | $12k | -$213k | -$7k | -$208k | 102 | $4.6M | $27.8M | $12k | 187 |
| HYPE | solana | large | 344 | $64.4M | $33.4M | $7.2M | 6 | 1 | -$31k | -$142k | -$3k | -$175k | 31 | $715k | $3.7M | -$31k | 122 |
| ZEC | solana | large | 342 | $147M | $27.8M | $4.5M | 15 | 21 | $21k | -$79k | $28k | -$30k | 136 | $3.8M | $5.0M | $20k | 262 |
| RAY | solana | large | 2047 | $403M | $14.7M | $9.6M | 8 | 11 | $38k | -$129k | -$2k | -$93k | 28 | $1.0M | $761k | $38k | 75 |
| UNI | ethereum | large | 2194 | $4.78B | $23.5M | $17.1M | 21 | 28 | -$47k | -$527k | -$11 | -$574k | 4 | $377k | $10.6M | -$47k | 12 |
| LINK | ethereum | large | 3288 | $8.54B | $9.3M | $29.8M | 4 | -2 | -$3k | $445k | -$11 | $442k | 3 | $98k | $1.5M | -$3k | 5 |
| AAVE | ethereum | large | 2184 | $1.98B | $6.3M | $22.0M | 10 | 4 | $0 | $0 | $0 | $0 | 0 | $0 | $9.6M | $0 | 6 |
| PEPE | ethereum | large | 1252 | $1.52B | $1.6M | $14.6M | 7 | 8 | $2k | $0 | $0 | $2k | 4 | $26k | $357k | $2k | 91 |
| VIRTUAL | base | large | 917 | $407M | $4.1M | $22.3M | 6 | -4 | $0 | $0 | $0 | $0 | 0 | $0 | $1.5M | $0 | 9 |
| AERO | base | large | 1116 | $585M | $16.5M | $28.7M | 9 | 7 | -$22k | -$8k | $0 | -$30k | 2 | $16k | $14.8M | -$22k | 10 |
| USELESS | solana | mid | 495 | $263M | $16.4M | $4.8M | 14 | 10 | -$2k | -$94k | -$6k | -$102k | 36 | $1.6M | $6.6M | -$1k | 83 |
| ANSEM | solana | mid | 93 | $137M | $3.8M | $2.2M | 11 | -16 | $17k | -$6k | -$363 | $10k | 25 | $365k | $402k | $17k | 150 |
| STONK | solana | mid | 56 | $190M | $41.7M | $9.4M | 33 | 10 | $122k | $9k | $443k | $574k | 133 | $27.4M | $13.2M | $122k | 308 |
| ZCAT | solana | mid | 18 | $160M | $12.4M | $1.3M | 64 | 69 | -$19k | $18k | $44k | $44k | 74 | $4.9M | $4.4M | -$19k | 192 |
| CATE | solana | mid | 53 | $65.8M | $7.6M | $1.7M | -11 | 13 | $32k | -$26k | $32k | $38k | 42 | $2.0M | $957k | $32k | 112 |
| SPX | ethereum | mid | 1128 | $434M | $1.6M | $6.6M | 2 | -4 | $0 | $0 | $0 | $0 | 0 | $0 | $119k | $0 | 6 |
| BRETT | base | mid | 936 | $47.3M | $355k | $1.1M | 2 | -1 | $0 | $0 | $0 | $0 | 0 | $0 | $0 | $0 | 1 |
| PAID | solana | fresh | 2 | $20.9M | $29.5M | $794k | 143 | – | $394k | $67k | $115k | $575k | 78 | $25.4M | $7.0M | $394k | 56 |
| ALLINU | solana | fresh | 6 | $18.1M | $7.9M | $399k | -23 | – | $55k | $312 | $225k | $280k | 67 | $2.5M | $988k | $54k | 84 |
| PILL | solana | fresh | 4 | $2.6M | $2.4M | $117k | 105 | – | $12k | -$2k | $54k | $64k | 24 | $122k | $389k | $12k | 12 |
| BLEND | solana | fresh | 2 | $54k | $1.4M | $11k | 254 | – | $5k | $430 | $2k | $7k | 16 | $45k | $0 | $5k | 7 |
| JUBJUB | solana | fresh | 7 | $3.8M | $1.4M | $115k | 392 | – | $2k | -$403 | $20k | $22k | 13 | $55k | $262k | $2k | 23 |
| EMBER | solana | fresh | 8 | $11.9M | $5.5M | $977k | -2 | 218 | $4k | -$2k | -$9k | -$7k | 20 | $1.9M | $1.5M | $4k | 116 |
| HYPED | solana | dumped | 1 | $11k | $10.7M | $13k | -98 | – | -$13k | $319 | $794 | -$12k | 51 | $197k | $0 | -$13k | 13 |
| LOCKINU | solana | dumped | 1 | $213k | $1.4M | $27k | -67 | – | -$174 | $2k | -$8k | -$7k | 9 | $63k | $0 | -$174 | 5 |
| RICHDEBT | solana | dumped | 14 | $2.0M | $4.4M | $71k | -47 | 66 | $0 | $18 | $0 | $18 | 1 | $0 | $397k | $0 | 2 |
| LOOM | solana | dumped | 37 | $909k | $571k | $75k | – | -75 | -$332 | $0 | $13k | $12k | 7 | $23k | $0 | -$332 | 45 |
| OTC | solana | dumped | 20 | $3.7M | $1.5M | $221k | 50 | -57 | $5k | $1k | $83k | $89k | 9 | $76k | $306k | $5k | 86 |
| USEFUL | solana | dumped | 12 | $1.4M | $886k | $104k | – | -56 | -$733 | -$5k | $0 | -$6k | 7 | $17k | $264k | -$733 | 55 |
| LAPTOP | base | dumped | 143 | $47.6M | $2.1M | $1.1M | -25 | -82 | $4k | $0 | $0 | $4k | 1 | $5k | $6.6M | $4k | 33 |
| SPIRAL | ethereum | dumped | 7 | $77k | $10k | $36k | – | -55 | -$431 | $0 | $0 | -$431 | 1 | $1k | $0 | -$431 | 18 |

Tiers: `large` = top market caps and majors, `mid` = $40M–$270M memecoins/alts, `fresh` = 1–8 day old launches (mostly pump.fun), `dumped` = −47% or worse over the drawdown window. "Lab wallets" = smart_trader + whale + public_figure wallet counts; "Lab gross" = Σ segment `avg_flow_usd × wallet_count` (two-sided turnover, the activity denominator). "SM traders" = `trader_count` from smart-money/netflow.

### T2 — derived metrics

| Token | Tier | labeled net % vol | labeled net % mcap | labeled gross % vol | fresh net % vol | absorption × | SM netflow % vol | fresh_buy_share % (current) | drawdown % |
|---|---|---|---|---|---|---|---|---|---|
| WIF | large | -0.54 | -0.004 | 2.28 | 42.4 | 78.7 | -0.04 | 100.0 | -3 |
| BONK | large | -0.30 | -0.002 | 5.10 | 15.5 | 51.8 | -0.06 | 100.0 | -2 |
| JUP | large | 0.58 | 0.004 | 1.37 | 7.0 | – | 0.36 | 87.8 | 2 |
| PENGU | large | 0.16 | 0.001 | 2.48 | 7.4 | – | -0.06 | 97.0 | -3 |
| TRUMP | large | 0.14 | 0.003 | 1.11 | 7.3 | – | 0.00 | 98.1 | -2 |
| FARTCOIN | large | -14.49 | -0.196 | 10.00 | 39.9 | 2.8 | -0.01 | 100.0 | 3 |
| PUMP | large | -0.59 | -0.011 | 12.86 | 78.2 | 133.5 | 0.03 | 100.0 | 0 |
| HYPE | large | -0.53 | -0.272 | 2.14 | 11.2 | 21.4 | -0.09 | 97.7 | 1 |
| ZEC | large | -0.11 | -0.021 | 13.86 | 18.0 | 164.6 | 0.07 | 88.7 | 21 |
| RAY | large | -0.63 | -0.023 | 7.07 | 5.2 | 8.2 | 0.26 | 84.0 | 11 |
| UNI | large | -2.44 | -0.012 | 1.60 | 45.0 | 18.4 | -0.20 | 100.0 | 28 |
| LINK | large | 4.73 | 0.005 | 1.05 | 15.6 | – | -0.03 | 65.9 | -2 |
| AAVE | large | 0.00 | 0.000 | 0.00 | 153.3 | – | 0.00 | 100.0 | 4 |
| PEPE | large | 0.13 | 0.000 | 1.64 | 22.6 | – | 0.13 | 81.9 | 8 |
| VIRTUAL | large | 0.00 | 0.000 | 0.00 | 36.1 | – | 0.00 | 100.0 | -4 |
| AERO | large | -0.18 | -0.005 | 0.10 | 89.7 | 494.2 | -0.13 | 99.6 | 7 |
| USELESS | mid | -0.62 | -0.039 | 9.67 | 40.2 | 64.4 | -0.01 | 100.0 | 10 |
| ANSEM | mid | 0.26 | 0.007 | 9.65 | 10.6 | – | 0.44 | 91.5 | -16 |
| STONK | mid | 1.38 | 0.302 | 65.87 | 31.6 | – | 0.29 | 94.2 | 10 |
| ZCAT | mid | 0.35 | 0.027 | 38.97 | 35.6 | – | -0.15 | 98.6 | 69 |
| CATE | mid | 0.49 | 0.057 | 26.00 | 12.6 | – | 0.42 | 85.1 | 13 |
| SPX | mid | 0.00 | 0.000 | 0.00 | 7.6 | – | 0.00 | 100.0 | -4 |
| BRETT | mid | 0.00 | 0.000 | 0.00 | 0.0 | – | 0.00 | – | -1 |
| PAID | fresh | 1.95 | 2.755 | 86.23 | 23.9 | – | 1.34 | 90.2 | 143 |
| ALLINU | fresh | 3.53 | 1.544 | 31.84 | 12.5 | – | 0.69 | 66.7 | -23 |
| PILL | fresh | 2.68 | 2.442 | 5.10 | 16.2 | – | 0.49 | 85.5 | 105 |
| BLEND | fresh | 0.46 | 12.085 | 3.17 | 0.0 | – | 0.32 | 0.0 | 254 |
| JUBJUB | fresh | 1.58 | 0.588 | 3.96 | 18.7 | – | 0.17 | 90.5 | 392 |
| EMBER | fresh | -0.12 | -0.058 | 33.92 | 27.4 | 219.2 | 0.08 | 99.7 | 218 |
| HYPED | dumped | -0.11 | -105.530 | 1.84 | 0.0 | – | -0.12 | 0.0 | -98 |
| LOCKINU | dumped | -0.50 | -3.194 | 4.58 | 0.0 | – | -0.01 | 0.0 | -67 |
| RICHDEBT | dumped | 0.00 | 0.001 | 0.00 | 8.9 | – | 0.00 | 100.0 | 66 |
| LOOM | dumped | 2.17 | 1.362 | 4.06 | 0.0 | – | -0.06 | 0.0 | -75 |
| OTC | dumped | 5.99 | 2.421 | 5.13 | 20.5 | – | 0.33 | 77.4 | -57 |
| USEFUL | dumped | -0.63 | -0.403 | 1.93 | 29.7 | 47.5 | -0.08 | 100.0 | -56 |
| LAPTOP | dumped | 0.19 | 0.008 | 0.26 | 321.9 | – | 0.19 | 99.7 | -82 |
| SPIRAL | dumped | -4.53 | -0.562 | 12.29 | 0.0 | – | 0.00 | – | -55 |

`absorption ×` = fresh net inflow ÷ labeled net outflow, only defined when labeled net < 0. `drawdown %` = 7d price change where available, else 24h.

### T4 — tier medians

| Tier | n | median labeled net % vol | median labeled net % mcap | median fresh_buy_share % | median labeled wallets | median SM netflow % vol |
|---|---|---|---|---|---|---|
| large | 16 | -0.18 (min -14.49, max 4.73) | -0.00 (min -0.27, max 0.01) | 98.06 (min 65.93, max 100.00) | 12.00 (min 0.00, max 136.00) | -0.01 (min -0.20, max 0.36) |
| mid | 7 | 0.26 (min -0.62, max 1.38) | 0.01 (min -0.04, max 0.30) | 94.17 (min 85.10, max 100.00) | 36.00 (min 0.00, max 133.00) | 0.00 (min -0.15, max 0.44) |
| fresh | 6 | 1.58 (min -0.12, max 3.53) | 1.54 (min -0.06, max 12.08) | 85.48 (min 0.00, max 99.71) | 20.00 (min 13.00, max 78.00) | 0.32 (min 0.08, max 1.34) |
| dumped | 8 | -0.11 (min -4.53, max 5.99) | -0.40 (min -105.53, max 2.42) | 77.40 (min 0.00, max 100.00) | 7.00 (min 1.00, max 51.00) | -0.01 (min -0.12, max 0.33) |

## 4. Proposal

### 4.1 Signal definitions

All four spot signals become volume-normalized. `vol24` is `volume` from the token screener (or `spot_metrics.volume_total_usd` from `tgm/token-information`, 1 credit either way); `labeled = smart_trader + whale + public_figure` net USD as today, with the same `seg()` null handling; `labeledWallets` is the sum of those three wallet counts; `labeledGross = Σ (avg_flow_usd × wallet_count)` over the same three segments.

```
minActivity      = vol24 >= 250_000
                   && labeledGross >= 0.005 * vol24        // segments moved >= 0.5% of volume
enoughWalletsWarn = labeledWallets >= 3
enoughWalletsBlock= labeledWallets >= 5

labeled_exit_pct  = minActivity && enoughWalletsWarn ? 100 * labeled / vol24 : 0
                    // negative = labeled wallets net sellers, as % of 24h volume

freshAbsorbing    = fresh > 0 && fresh >= 0.005 * vol24
absorption        = labeled < 0 && freshAbsorbing ? fresh / -labeled : null

distribution_pct  = (minActivity && enoughWalletsBlock && labeled_exit_pct < 0
                     && absorption !== null && absorption >= 1)
                    ? labeled_exit_pct : 0
                    // labeled wallets exiting *into* fresh-wallet demand

sm_netflow_pct    = minActivity && smTraderCount >= 3 ? 100 * smNetflow24h / vol24 : 0

drawdown_pct      = 100 * (price_change_7d ?? price_change_24h)   // from the screener/ohlcv already fetched

risk_high_count   = unchanged
```

Three deliberate choices:

- **`fresh_buy_share` is deleted as a rule** and survives only as panel context, re-expressed as the absorption ratio ("fresh wallets bought 2.8× what labeled wallets sold"). It is never a block by itself; it only qualifies `distribution_pct`. All 24 Balanced CAUTIONs in the sample are `fresh_buy_share`-only hits, so that single change clears every one of them.
- **"Too quiet to judge" is 0, not `null`.** A guard that fails yields a real 0 (→ CLEAR), not an unavailable signal (→ UNCHECKED), because "labeled wallets barely traded" is an answer. `null` stays reserved for a failed or missing API response, per the project rule that missing data is never CLEAR. The signal label must say which: *"Not enough labeled trading to judge (3 wallets, 0.2% of volume)"*.
- **A drawdown signal is added** so already-dumped tokens are not CLEAR just because the last 24h of flow looks calm. It costs no extra credits: the panel already fetches ohlcv, and the screener returns `price_change`.

### 4.2 Preset thresholds

| Rule id | Signal | Op | Degen | Balanced | Paranoid | Action |
|---|---|---|---|---|---|---|
| `spot-distribution` | `distribution_pct` | `<` | −6 | **−2** | −0.75 | block |
| `spot-exit-deep` | `labeled_exit_pct` | `<` | −10 | **−5** | −2.5 | block |
| `spot-exit` | `labeled_exit_pct` | `<` | −4 | **−1** | −0.5 | warn |
| `spot-sm24` | `sm_netflow_pct` | `<` | −4 | **−1.5** | −0.75 | warn |
| `spot-risk` | `risk_high_count` | `>=` | 3 | **2** | 1 | block |
| `spot-drawdown` | `drawdown_pct` | `<=` | −80 (warn) | **−50 (warn)** | −30 (block) | see cell |

Perp and prediction rules are unchanged; this spike only sampled spot.

The two block paths are deliberately different questions. `spot-distribution` is the exit-liquidity thesis proper — labeled money leaving *and* fresh money taking the other side; on Balanced it needs ≥5 labeled wallets moving ≥2% of a day's volume. `spot-exit-deep` catches a labeled exit so large (≥5% of volume) that it blocks whether or not fresh wallets are absorbing it. Degen only fires on the extremes (−6% / −10%), Paranoid on ordinary-but-real outflow (−0.75% / −2.5%) — strict, but on this sample it still leaves 23 of 37 CLEAR instead of 1.

`risk_high_count` is kept as-is but is currently inert (§2d). Before the next preset change, either widen `TOKEN_RISKS` to include `cex-flows` or drop the rule from the default presets rather than shipping a rule that never fires.

### 4.3 UI phrasing

Rule sentences carry the denominator, because a percentage of volume is only meaningful with the volume beside it:

| Rule | Preset sentence (rules screen) | Verdict evidence line (chip/panel) |
|---|---|---|
| `spot-distribution` | "Block when labeled wallets sell more than 2% of 24h volume into fresh-wallet buying" | "Smart money, whales and public figures sold **14.5% of 24h volume** ($287k of $2.0M) and fresh wallets bought 2.8× that" |
| `spot-exit-deep` | "Block when labeled wallets sell more than 5% of 24h volume" | "Smart money, whales and public figures sold **14.5% of 24h volume** ($287k of $2.0M), 17 wallets" |
| `spot-exit` | "Warn when labeled wallets sell more than 1% of 24h volume" | "Labeled wallets sold **2.4% of 24h volume** ($574k of $23.5M), 4 wallets" |
| `spot-sm24` | "Warn when Smart Money's 24h net outflow exceeds 1.5% of 24h volume" | "Smart Money sold **1.7% of 24h volume** ($400k of $23.5M), 12 traders" |
| `spot-drawdown` | "Warn when the price is down more than 50% over 7 days" | "Price is **down 75% in 7 days**" |
| guard not met | — | "Not enough labeled trading to judge (2 wallets, 0.1% of 24h volume)" |
| no exit | — | "Labeled wallets net **bought** 0.6% of 24h volume" |

Rules stay one comparison per sentence, so `evaluate()` and the rules editor need no change beyond the new signal ids and a "% of 24h volume" unit formatter alongside the existing `${n}` / `{n}` cases. Absorption belongs in the evidence line, never in a threshold the user has to tune.

## 5. Current vs proposed verdicts

| Token | Tier | Current Balanced | Current Paranoid | Proposed Balanced | Proposed Paranoid | Proposed Degen | Why it changes |
|---|---|---|---|---|---|---|---|
| WIF | large | CAUTION | TRIPWIRE | CLEAR | CAUTION | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50, sm_netflow_24h<0 → labeled_exit_pct<-0.5 |
| BONK | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50, sm_netflow_24h<0 → no hit |
| JUP | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| PENGU | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50, sm_netflow_24h<0 → no hit |
| TRUMP | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| FARTCOIN | large | TRIPWIRE | TRIPWIRE | TRIPWIRE | TRIPWIRE | TRIPWIRE | unchanged |
| PUMP | large | TRIPWIRE | TRIPWIRE | CLEAR | CAUTION | CLEAR | B: exit_pressure<-100000, fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50 → labeled_exit_pct<-0.5 |
| HYPE | large | TRIPWIRE | TRIPWIRE | CLEAR | CAUTION | CLEAR | B: exit_pressure<-100000, fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50, sm_netflow_24h<0 → labeled_exit_pct<-0.5 |
| ZEC | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50 → no hit |
| RAY | large | CAUTION | TRIPWIRE | CLEAR | CAUTION | CLEAR | B: fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50 → labeled_exit_pct<-0.5 |
| UNI | large | TRIPWIRE | TRIPWIRE | CAUTION | CAUTION | CLEAR | B: exit_pressure<-100000, fresh_buy_share>70 → labeled_exit_pct<-1 · P: exit_pressure<-25000, fresh_buy_share>50, sm_netflow_24h<0 → labeled_exit_pct<-0.5 |
| LINK | large | CLEAR | TRIPWIRE | CLEAR | CLEAR | CLEAR | P: fresh_buy_share>50, sm_netflow_24h<0 → no hit |
| AAVE | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| PEPE | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| VIRTUAL | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| AERO | large | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50, sm_netflow_24h<0 → no hit |
| USELESS | mid | TRIPWIRE | TRIPWIRE | CLEAR | CAUTION | CLEAR | B: exit_pressure<-100000, fresh_buy_share>70 → no hit · P: exit_pressure<-25000, fresh_buy_share>50, sm_netflow_24h<0 → labeled_exit_pct<-0.5 |
| ANSEM | mid | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| STONK | mid | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| ZCAT | mid | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50, sm_netflow_24h<0 → no hit |
| CATE | mid | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| SPX | mid | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| BRETT | mid | UNCHECKED | UNCHECKED | CLEAR | CLEAR | CLEAR | B: no hit → no hit · P: no hit → no hit |
| PAID | fresh | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| ALLINU | fresh | CLEAR | TRIPWIRE | CLEAR | CLEAR | CLEAR | P: fresh_buy_share>50 → no hit |
| PILL | fresh | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| BLEND | fresh | CLEAR | CLEAR | CLEAR | CLEAR | CLEAR | unchanged |
| JUBJUB | fresh | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| EMBER | fresh | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| HYPED | dumped | CLEAR | TRIPWIRE | CAUTION | TRIPWIRE | CAUTION | B: no hit → drawdown_pct<=-50 |
| LOCKINU | dumped | CLEAR | TRIPWIRE | CAUTION | TRIPWIRE | CLEAR | B: no hit → drawdown_pct<=-50 |
| RICHDEBT | dumped | CAUTION | TRIPWIRE | CLEAR | CLEAR | CLEAR | B: fresh_buy_share>70 → no hit · P: fresh_buy_share>50 → no hit |
| LOOM | dumped | CLEAR | TRIPWIRE | CAUTION | TRIPWIRE | CLEAR | B: no hit → drawdown_pct<=-50 |
| OTC | dumped | CAUTION | TRIPWIRE | CAUTION | TRIPWIRE | CLEAR | unchanged |
| USEFUL | dumped | CAUTION | TRIPWIRE | CAUTION | TRIPWIRE | CLEAR | unchanged |
| LAPTOP | dumped | CAUTION | TRIPWIRE | CAUTION | TRIPWIRE | CAUTION | unchanged |
| SPIRAL | dumped | UNCHECKED | TRIPWIRE | CAUTION | TRIPWIRE | CLEAR | B: no hit → drawdown_pct<=-50 |

| Preset | CLEAR | CAUTION | TRIPWIRE | UNCHECKED |
|---|---|---|---|---|
| Degen (proposed) | 34 | 2 | 1 | 0 |
| Balanced (proposed) | 28 | 8 | 1 | 0 |
| Paranoid (proposed) | 23 | 6 | 8 | 0 |

30 of 37 tokens change verdict on Balanced and 28 on Paranoid. The changes worth arguing about:

- **PUMP, HYPE, USELESS: TRIPWIRE → CLEAR on Balanced.** All three are labeled wallets shedding ~0.5–0.6% of a day's volume ($208k of $35.6M for PUMP). If any of these should stay blocked, the Balanced `spot-distribution` threshold is wrong, not the normalization — at −0.5% it would catch them and also catch BONK and WIF.
- **UNI: TRIPWIRE → CAUTION.** −$574k looks large, but it is 2.4% of volume from **4 labeled wallets** (one whale at −$527k) on a $4.8B cap. The ≥5-wallet guard denies it a block; the warn path still surfaces it. This is the guard doing exactly what it is for, and it is also the guard most likely to be wrong — a single whale exit is sometimes the whole signal.
- **HYPED, LOCKINU, LOOM, SPIRAL: CLEAR/UNCHECKED → CAUTION on Balanced**, entirely from the new drawdown rule. The current logic calls a token that fell 98% in a day CLEAR.
- **FARTCOIN stays TRIPWIRE on every preset**, now for a stated reason (−14.5% of 24h volume, absorbed 2.8× by fresh wallets) instead of "labeled wallets dumped more than $100k".
- **BRETT and SPIRAL: UNCHECKED → CLEAR / CAUTION.** Quiet tokens stop being reported as unverifiable.

Caveats on these numbers: `risk_high_count` was measured on 5 tokens (all 0) and assumed 0 for the other 32, so both the current and proposed columns understate any preset that depends on it; `sm_netflow_24h` came from one filtered per-chain call rather than 37 single-token calls (same endpoint, same rows); flows are a single 1d snapshot on 2026-09-17, so thresholds are calibrated against one day's market, and the volume denominator comes from the screener's 24h window, which is not bucket-aligned with the flow window.

## 6. Credits

| Call | Count | Credits |
|---|---|---|
| `token screener` (solana/ethereum/base × 24h, 7d) | 6 | 6 |
| `token flow-intelligence` (1d, per token) | 37 | 37 |
| `smart-money netflow` (3 chains address-filtered + 1 unfiltered probe) | 4 | 20 |
| `token indicators` (WIF, LINK, PENGU, PAID, LOOM) | 5 | 25 |
| `token info` (LOOM, USEFUL, SPIRAL) | 3 | 3 |
| `token ohlcv` (WIF 7d) | 1 | 1 |
| **Reported by the CLI** | 56 | **92** |
| **Account meter delta** (128,272 → 128,152) | | **120** |

Budget was 120 and the meter delta is exactly 120, so the per-call "Credits: N" line under-reports by ~30% on some endpoints (most likely the paginated screener/netflow calls). Anything that budgets Nansen credits from the CLI's own per-call number — including `scripts/record-fixtures.mjs` ("about 50 credits") and the server-side ledger — should be re-checked against the account meter.

## 7. If this is adopted

1. `packages/core/src/signals/spot.ts`: add `vol24`, `labeledGross` and wallet counts to `SpotSignalInput`; emit `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct`, `drawdown_pct`; delete `fresh_buy_share` (keep the absorption ratio as panel copy).
2. `packages/core/src/types.ts`: new `SignalId`s, and a unit tag per signal (`usd` | `pct-volume` | `count`) so the rules editor can format thresholds.
3. `packages/core/src/rules/presets.ts`: the table in §4.2; `apps/web/app/rules/rule-text.ts` `NEGATIVE_SIGNALS` becomes `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct`.
4. `apps/web/lib/intel/spot.ts`: pass the screener/token-information volume through (1 extra credit per token, or reuse the panel's existing ohlcv candles for both volume and drawdown at no extra cost).
5. Migration for saved custom rules: old `exit_pressure` / `fresh_buy_share` thresholds are in USD and percent-of-buying and have no honest conversion — map them to the new preset defaults and tell the user in `/history` that the rule was restated.
6. Re-run this spike on a second day before shipping; one snapshot is not a calibration set.

## 8. Open questions — the prediction verdict (opened by Round 1.2, 2026-09-20)

Round 1.2 changed **what a "proven winner" is made of** on the prediction card, and shipped none of the threshold work that change eventually needs. This section is the debt, stated precisely enough to be paid without re-deriving it.

### 8.1 What shipped, and why it is verdict-safe as written

`smart_side_disagrees` (`packages/core/src/signals/prediction.ts`) still maps the same way it did before: `value > 70` → high, `> 50` → warn, else info, and `null` → UNCHECKED. Nothing in the preset table moved. Two inputs to that value changed:

- **1.2.5 — the judged market stopped counting in its own weight.** The record was a sum of `total_pnl_usd` across every `prediction-market/pnl-by-address` row, *including the open position in the market being judged*. On the recorded wallet that all-rows sum is **$14,337.53** against a settled-only **$16,815.68** — a $2,478 swing from open positions alone (`packages/core/test/prediction-record.test.ts`). The shipped record is `realized_pnl_usd`, which excludes every open position by construction.
- **1.2.8 — the record is now bought from `prediction-market/address-summary`**, capped at the 10 largest holders (worst case 15 credits per card, down from 25), and carries `win_rate`, `markets_won`, `markets_traded` and `wallet_age_days` alongside the settled PnL.

Both are data changes under an unchanged mapping, so a card cannot become *less* cautious than before by accident: a holder whose record is missing carries zero weight, and if no holder on either side has a positive settled record the signal is `null` and the verdict is UNCHECKED.

### 8.2 What must be re-measured before any of this becomes a threshold

None of the following is wired into a rule today, and none of it may be without a measurement run of its own.

1. **The direction and size of the 1.2.5 shift, across markets rather than one wallet.** The single recorded wallet moved *up* (14.3k → 16.8k) when its open positions were dropped. That is one sample and the sign is not general: a wallet carrying a large winning open position moves down. Needed: `top-holders` plus `address-summary` for 20–30 live Yes/No markets, and the distribution of `provenWinnerSplit`'s `value` under the old and new record side by side. Until that exists, nobody can say whether the current 50 / 70 boundaries still sit where they were calibrated. Estimated cost: 20 markets × (5 + 10) ≈ **300 credits**.
2. **Whether a win-rate rule is usable at all.** The recorded wallet is **+$13.8K lifetime at a 12.2% win rate across 558 markets** (68 won). A naive `win_rate > 0.5` rule classifies that wallet as a loser while it is one of the largest positive-PnL accounts in the sample — long-shot books produce low win rates by construction. Any `smart_side_disagrees` variant that reads `win_rate` needs its own threshold derived from a real distribution, not carried over from the PnL rule. Not started.
3. **`markets_traded` as a minimum-record gate.** "Proven" currently means "settled PnL above zero" at any sample size, so one lucky settled market weighs the same per dollar as 558. A minimum (`markets_traded >= N`, or a settled-count floor) is the obvious guard and has no measured N.
4. **The residual 1.2.5 case.** `realized_pnl_usd` excludes the judged market only while that market is *open*. On a settled market it is inside the figure — which is harmless today, because a settled market yields `null` and UNCHECKED (1.2.3) and buys no records at all, but it stops being harmless the moment a resolved market is ever scored.
5. **The 10-holder cap's effect on the split.** The cap is on the *record* fan-out, not on the holders: all 20 returned holders render, but only the 10 largest can ever carry weight. Whether truncating at 10 changes the Yes/No ratio materially is unmeasured; the sample is ordered by `position_size`, so the effect should be small, and "should be" is not a measurement.

### 8.3 Ground rule

Until 8.2.1 is run, treat the prediction verdict the way §4 treats the spot one: the **data** may improve freely, the **thresholds** may not move, and no new field may become a rule input. A change to `severity` in `predictionSignals`, or a new prediction entry in `packages/core/src/rules/presets.ts`, is a calibration change and belongs to a measurement run, not to a build round.
