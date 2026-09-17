# Evidence card v2 (controller brief)

User feedback (2026-09-17, screenshot on Jupiter HYPE):
1. "I see contract instead of token name": the card header shows `98sM…Mh5g`.
2. "Add the link see on Nansen".
3. "The smart money should be clickable and I can change timeline to days, week or else".
4. "The chart is static, I cannot hover it".
5. "Literally everything (HYPE, ZEC, WIF) is marking as exit liquidity": handled separately by the calibration work (`docs/CALIBRATION.md`). Integrate the recalibrated signals and presets when that doc exists; don't invent thresholds here.

## Build
### A. Token identity in the header
- **Backend:** `buildSpotIntel` resolves name, symbol and logo via Nansen `tgm/token-information` (confirm the path and cost from the docs: https://docs.nansen.ai/api/token-god-mode/token-information.md). Fall back to the resolve/search cache when available, then the netflow row's `token_symbol`. Cache 24h in both chip and panel mode (one call per token per day).
  - Add `panel.token = {name, symbol, logoUrl, marketCapUsd, volume24hUsd, priceUsd}`.
  - Replay: record one fixture for WIF with the existing record script pattern (≤ 2 credits) so the stubbed demo shows "dogwifhat · WIF".
- **Header:** token logo (or monogram), then **$SYMBOL** in Sora, then the token name in secondary text, then the chain logo. The address goes to a second line as a short mono form with a copy icon button. Apply this to the X popover, block-screen evidence and dock cards, and use the symbol in the chip and strip text too.

### B. "View on Nansen" link
- **Link:** `https://app.nansen.ai/token-god-mode?chain=<nansenChain>&tokenAddress=<address>` for spot. Perps use the Nansen Hyperliquid perp page if a stable URL pattern exists (verify with a web search); otherwise omit it. Prediction markets use a Nansen prediction market page if verifiable; otherwise omit it.
- **Placement:** a secondary pill button in the card header row, or first in the footer: Nansen mark, then "View on Nansen", then a Lucide ExternalLink icon. `target=_blank rel=noopener noreferrer`.

### C. Timeframe control
- **Control:** one segmented control per card, `5m · 1h · 6h · 1d · 7d`. It drives the Flow tab gauges (flow-intelligence timeframe) and the price chart window.
  - **Default:** 1d for venues; for X, the smallest window covering the post age, floored at 1d as now.
  - **Netflow tiles:** 1h / 24h / 7d / 30d are buttons that set the control to the nearest supported window. 30d maps to 7d for flows with a note "flows max 7d". The selected tile is highlighted.
- **Backend:** new `mode:"panel"` parameter `timeframe` on `/api/post-intel` and `/api/guard`, validated with zod. Verdict signals keep their rule window; changing the view timeframe must not change the verdict. State this in the UI: "Verdict uses 1d · viewing 7d".
- **Fetching:** cached per token and timeframe. Show a loading skeleton per section, not a full-card reload.

### D. Interactive price chart
- **Library:** use TradingView lightweight-charts (skill: `lightweight-charts`; v5 API) inside the shadow root. Check the bundle size and that WXT builds it; it's acceptable around 50KB.
- **Chart:** an area or line series in mint (red when the window change is negative), crosshair hover tooltip (price, time, % change from window start), the post-time marker kept as a series marker, no watermark, theme-token colours, and resize with the card.
- **Candles:** ohlcv timeframe by window: 5m → 1m candles, 1h → 1m, 6h → 5m, 1d → 15m, 7d → 1h. Cache TTLs accordingly.
- **Accessibility:** keep a text summary for screen readers (open, close, change).

## Constraints
- Replay for tests and e2e. Record at most the WIF token-information fixture live (≤ 2 credits) via script, and never print the key.
- Keep the theme and a11y floors: Lucide icons, bundled logos, no emoji, text ≥ 11px, contrast ≥ 4.5, targets ≥ 24px.
- Don't change the origin/Host guard or blocker semantics.

## Tests
- core/web: token identity fallback chain, timeframe validation, and that the verdict is unchanged across view timeframes
- extension: header rendering with name and symbol, Nansen link URL builder per chain (map our chain ids to Nansen's: `solana, ethereum, base, arbitrum, bnb, polygon, optimism, avalanche`), timeframe control keyboard access, tile click sets timeframe, chart mounts and unmounts cleanly (mock lightweight-charts in happy-dom)
- e2e: hovering the chart shows the tooltip; clicking the 7d tile changes the gauges' label

## Verify
`pnpm verify`, both builds, e2e, recaptures `x-popover.png`, `x-popover-7d.png`, `x-popover-chart-hover.png`, `block-evidence.png`, detect once.

## E. Signal recalibration (from docs/CALIBRATION.md — binding)
Implement the proposal in `docs/CALIBRATION.md` exactly (read it; it carries the formulas, guards, thresholds per preset and the 37-token verdict table):
- New/changed signals in `packages/core/src/signals/spot.ts`: `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct`, `drawdown_pct`; drop `fresh_buy_share` as a rule signal (keep the absorption ratio as evidence copy in the panel/hits).
- Guards (vol24 >= $250k, labeled gross >= 0.5% of volume, >= 3 wallets to warn / >= 5 to block, >= 3 SM traders): a failed guard yields 0 (CLEAR), not null.
- `risk_high_count`: re-check which indicator types can ever score "high" (calibration found only cex-flows / btc-reflexivity did, and both are excluded) — either widen TOKEN_RISKS with a documented rationale or drop the rule from presets; say which you chose and why.
- Presets updated per the doc (Balanced/Degen/Paranoid), rule text rewritten in the doc's UI phrasing ("Labeled wallets sold 4.2% of 24h volume").
- Inputs needed: 24h volume and market cap per token (token-information, already fetched for section A) and 7d price change (ohlcv, already fetched). Thread them into `spotSignals`.
- Tests: table-driven cases from the calibration doc (at least 8 tokens across tiers) asserting the proposed verdict under Balanced and Paranoid; guard tests; migration test that a stored custom rule set referencing a removed signal still loads (ignore unknown signals, don't crash).
- Migration: stored rules in SQLite may reference `fresh_buy_share`; on load, drop unknown-signal rules and log once.
