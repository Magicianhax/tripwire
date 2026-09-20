# Buildathon submission checklist

Nansen Meridian Buildathon, entries close 2026-09-27. Four requirements: an API key, 1,000+ API calls, a demo posted on X tagging @nansen_ai, and the entry form (email + X post link + GitHub repo).

## 1. API calls (1,000 minimum)

Current: **616 logged, 568 successful** (`/ledger`, or query `apps/web/.data/tripwire.db`). About 400 short.

Each live token card costs roughly 5 calls, a perp card with the Traders tab about 8, a wallet card about 5. Ways to close the gap, cheapest first:

- Use the extension normally on X for ten minutes with the backend running: chips resolve per token and each panel open adds calls.
- Open ~40 token cards across Jupiter/Uniswap/Dexscreener pages.
- Re-record fixtures deliberately: `node scripts/record-fixtures.mjs` and `node scripts/record-wallet-fixtures.mjs` (each run is a handful of calls and also refreshes the replay data).

`/ledger` shows the running count and is the page to film as proof.

## 2. Demo recording (no narration needed)

Setup before filming:
- `pnpm -F web dev` running, key resolving via the Nansen CLI (check `/` says so).
- Extension loaded from `apps/extension/.output/chrome-mv3`, preset **Balanced** in the popup.
- Browser at 1440px wide, dark mode, no other extensions visible.

Shot list (~90 seconds, captions instead of voice):

1. **X timeline** (~15s) — scroll past two or three posts mentioning tokens; chips appear under them. Click one: the card opens beside the post with skeletons, then fills. Switch the window to 7d; hover the chart.
2. **Author badges** (~10s) — a post by a Nansen-labelled account: badge next to the username, click it for holdings and PnL.
3. **Jupiter block** (~20s) — open a token whose rules fire; the block screen covers the Swap button. Show that the rest of the page still works, click "See who's selling" for the evidence, then type the override phrase and watch it unlock.
4. **Hyperliquid** (~15s) — a perp page: positioning, funding across five venues, the Traders tab, the liquidation ladder. Expand the card to ~80% of the window.
5. **Wallet lens** (~10s) — hover an address on any page; open the wallet card with Hyperliquid and Polymarket tabs.
6. **Proof** (~10s) — `/ledger` showing the call count past 1,000, then `/rules` showing the presets.

Existing stills for the X post or README are in `.impeccable/review/*.png` (47 captures, including `x-popover`, `block-screen`, `perp-expanded`, `perp-funding-venues`, `spot-expanded`, `entity-profile-expanded`, `ledger-desktop`).

## 3. X post

Tag **@nansen_ai**, attach the recording. Draft:

> Tripwire: Nansen intelligence at the moment you trade.
>
> Chips on every X post that mentions a token — who bought and who sold since the post.
> On Jupiter, Hyperliquid, Polymarket and 15 more venues it blocks the trade button when your own rules fire, and shows the Nansen evidence behind it.
> Hover any wallet address anywhere for holdings, PnL and open positions.
>
> Built on the Nansen API for the Meridian Buildathon. @nansen_ai

## 4. Entry form

Needs: email, the X post link, the GitHub repo URL.

**Blocker: the repo has no git remote.** Create a public GitHub repo, then:

```bash
cd F:/Tools/Nansen
git remote add origin https://github.com/<you>/tripwire.git
git push -u origin master
```

Check before pushing that `apps/web/.env.local` is absent or ignored (it is, via `.gitignore`), and that `gitleaks` passes on the history.

## Judging criteria and where Tripwire answers them

| Criterion (25% each) | Evidence |
|---|---|
| Data integration | Verdicts are computed from Nansen flow, netflow, indicators, token info, perp positioning and prediction-market holders; every warning cites the endpoint and value. `docs/CALIBRATION.md` shows thresholds derived from 37 live tokens. |
| Creativity | It isn't a dashboard: the data appears on the X post and over the trade button, with a typed-phrase override and a local rule engine. |
| Functionality | 859 unit tests, Playwright tests against the built extension, adapters verified against real venue DOM (`docs/VENUE-CHECK.md`), replay mode for offline demos. |
| Documentation | README setup under 10 minutes, `docs/HANDOFF.md`, architecture, decisions (ADR-0001..0012), spikes and this checklist. |
