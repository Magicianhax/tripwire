# Tripwire handoff

## Faster horizontal carousel + genuine exit-liquidity capture — 2026-09-21

User complained ofslow/stalledslider andmissingexitliquidityexample. SiteShowcase now3s cadence with450ms horizontaltransform, workingedgearrows andendclones; noimagehoverpause. Keyboard/reducedmotion/visibility safeguardsremain. First of6slides is actual Uniswap GIZA/Base block screenshot public/showcase/exit-liquidity.jpg:49%7ddrawdown triggered existing30%rule, I AM EXIT LIQUIDITY input empty/Override disabled. CapturedviaCUA, nofinancialaction orrulechanges. ProvenanceREADMEupdated.

355webtests/typecheck/buildpassed;2browser tests coverautoadvanceunderhover,edgearrows,forward/backwardwrap/rapidclicks,reducedmotion/mobile;codereviewapproved. ActualuserbrowseralsoobservedExit→Hyperliquid;bothlocalhosttabsrefreshed. LocalserverPID5888. No commit/deploy.

## Minimal autoplay + first-screen hero — 2026-09-20

User rejected showcase chrome and tiny centered screenshots. SiteShowcase now fullwidth16:9 captures with only small dots/pause underneath; removed all visible heading/site-tab/caption/date/fullsize text.7sautoplay,240msopacitycrossfade, manualinstant, hover/focus/pagevisibility/intersectionpause, reducedmotionpauseddefault. Hydration cached-image readiness check prevents onLoad-beforeReact deadlock. New hero.css +page first-screen hero; screenshot section immediatelybelow.2browser regressions coveractualcycling/pause/resume/layout/reducedmotion; build/typecheck/review passed. CUA refreshed bothlocaltabs, firstatroothero andsecondslideshowwithPlayactivated. ServerPID19032 port3000. This supersedes prior manual/compact-stage guidance. No commit/deploy.

## User correction: screenshots, not a market dashboard — 2026-09-20

Homepage now SiteShowcase manual slider with five actual screenshots captured through CUA from user's updated extension: HyperliquidETH positioning, XVitalik entitycard, JumperWBTC check, Polymarket publicSPCEXBUYER wallet and DexscreenerCHUMP Robinhood. Assets apps/web/public/showcase/*.jpg with provenanceREADME. They are rawJPEGviewport captures (not PNG despite screenshotAPI name), public/loggedout pages, no walletsconnected/transactions. Data is labelledpoint-in-time.

Removed MarketBrief frompage/navigation/copy and allhomepagepolling. Existingcollectorcode retainedprivate; publicproxy blocksallAPI inclpublicbrief and allows/showcase assets. Startuprefreshflag nowoff. Productshowcase340pxdesktop/220pxmobilewithsitebuttons,prevnext,fullsize.18focusedunit tests/typechecks,3browser tests,build and codereview passed. Both user's pre-existing localhost tabs refreshed throughCUA (they previouslycontainedstaleversions). FinalserverPID3928 at3000. Finalslidercapture scratch/review/site-showcase-final.jpg. This direction supersedes previous standalonebrief public-productdirection below.

## Original logo + real market brief — 2026-09-20

Original generated Tripwire mintT with diagonal cut now supplies site/nav/footer, popup, favicon and Chrome16/32/48/128 icons. Source/prompts assets/brand; deterministic resizing script scripts/export-tripwire-logo.mjs. Provider and token marks unchanged.

Public site no longer contains ProductDemo mock figures. It is a research-led layout with MarketBrief client and /api/public-brief. Fixed WETH/WBTC Ethereum and WSOL Solana; actual hourly closes and24hchange (26h request, last25points), exactcontracttokeninformation volume/cap, flowsegments and deterministic commentary. Price explicitly labelled recordedclose. Live verified all3 populated; cache repeat preservedasOf. Snapshot file apps/web/data/public-brief.json ignored in git. Local service runs TRIPWIRE_PUBLIC_BRIEF_REFRESH=1; public mode can only read sanitizedartifact with no paidrefresh. Publish artifact separately per docs/public-site-deployment.md; no hosting/publisher provisioned.

Latest gates:1,523 unit tests/alltypechecks,4browser tests inclactual live capture, builds passed. Code/security reviews approved. Local serverPID19484 on3000. Screenshots scratch/review/product-live-desktop.png/product-live-mobile.png/tripwire-logo-popup.png. Newpublicbrief tracing warnings removed; pre-existingpredictionfixture warnings remain. No commit/deploy done.

## Product website — 2026-09-20

Homepage now public-facing Tripwire landing page with responsive mint/dark design, interactive illustrative token/wallet/perp preview, supported sites, product context, packaged-release install steps and native details FAQs. No backend/key/replay/usage/history imports in homepage/layout. Download is unavailable until TRIPWIRE_REPOSITORY_URL names the actual GitHub owner/repo, then links to releases/latest. Toolbar popup no longer requests ledger or shows usage tiles/key provenance; honest Sample data status remains for replay evidence.

Set TRIPWIRE_PUBLIC_SITE=1 for public deployment; it denies private API/admin routes and write methods regardless Host, preserving normal local backend behavior when unset. See docs/public-site-deployment.md. This is not a hosted multi-user data service. All1,497 tests and typechecks passed; both builds and production desktop/mobile product browser regression passed; scoped review approved. Local live server PID6640 on3000. No deployment or commit performed. Existing prediction fixture tracing build warnings remain outside this scope.

## Polymarket badges, CHUMP discovery and liquidation chart — 2026-09-20

PM leaderboard badges now mount beside the visible name outside its clipping wrapper, not after the screen-reader-only stretched link. Same-shadow pointer-events override and 28px button fix click interception; profile markers have duplicate priority under the unchanged40-marker cap. Browser regression reproduces live site's z-index/pointer structure and tests mouse/keyboard opening without navigation.

Dexscreener now has a dedicated exhaustive chain map including Robinhood and accepts v4 bytes32 pool IDs. Both live CHUMP pools resolve to Robinhood contract0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B. New liquidation chart groups returned positions into price ranges, adds precise price labels/mark/band/hover+focus details, preserves actual rendered height, and paginates positions with the summary beside the chart. This is a returned-position sample, not a market-wide forecast.

All typechecks and859 unit tests pass; both production builds pass; scoped code reviews approved. Backend restarted detached/live, PID21472, port3000. Changes remain uncommitted. User must reload the unpacked extension and affected tabs; extension-management page is blocked to browser tooling. No Impeccable used.

## Cross-market exploration update — 2026-09-20

X ticker-only posts now start at a Markets view, not a highest-volume spot verdict. Contract posts and DEX spot cards gain Markets; unsupported identified DEX assets can browse available spot/perp markets while their original trade stays unchecked. Hyperliquid remains perps-only. The catalog includes exact chain/address, price/24hvolume/marketcap snapshots, explicit related matches, separate spot/perp charts, pagination, Nansen links and lazy detail drill-in. Unsupported detail targets (e.g. Near, namespaced Hyperliquid) remain visible with external links rather than being dropped or mapped to another market.

Robinhood mainnet4663 is supported for spot evidence. Resolver chain hints are hard filters; ambiguous same-chain contracts are not chosen automatically. Live Robinhood SPCX now returns its own exact contract and evidence with no errors. Latest unit gates core200/web179/extension466, both builds and final review approved. Feature remains in working diff; reload unpacked extension and page to test. No Impeccable was used for this design pass.

## Current repair state — 2026-09-20

The latest working diff adds native top-layer cards, safe invalidation cleanup, nested X profile-header parsing, Dexscreener pair-to-token resolution, a bounded bottom-right Dex dock, verified/versioned token-logo caches, and chart-led Summary/Holdings/Performance views with paginated rows and signed PnL colors. Row-specific Nansen arrows open actual wallets/tokens. Live port3000 is running with replay:false. Reported TIPPED mint and Matt wallet were verified through the guarded backend; no data errors. Free API searches still do not expose Matt's website-only label, and no premium labels were fetched automatically.

Latest gate: core200/web168/extension456 unit tests, production builds,14-test browser smoke suite,3capture specs. Captures show six-row holder pagination/distribution, signed wallet summary, and unobscured overlays. Reviewer approved. A complete historical portfolio curve is not built from incomplete token/day pages; current charts show actual allocation and token PnL. Reload extension + page to replace obsolete content-script instances. Pending changes are not committed.

## Latest local testing update — 2026-09-20

The backend at `http://127.0.0.1:3000` is now running in **live mode**, not replay, for actual entity coverage. Real guarded lookups matched ZachXBT and Vitalik Buterin without errors (four credits total). Existing browser tabs need a refresh after reloading the unpacked extension.

The current working diff also adds X profile-header badges (legacy and semantic layouts), media-only tweet author detection, bounded retries for transient entity-search failures, and richer entity cards: up to20 holdings, chain allocation, 90-day trade/token counts, top PnL tokens, replay indication, and a direct Nansen entity link. Wallet cards expose up to20 holdings as well. No additional endpoints were introduced for the extra fields. Full transaction/counterparty history remains available through View on Nansen. Credit usage is dashboard-only; action prices remain visible before paid calls.

Latest verification: core200/web161 unit tests, extension447 tests, full replay E2E13 passed, captures3 passed. Final review approved. These changes remain uncommitted on top of `82ad58e`.

Written 2026-09-18 and refreshed by the Codex takeover on 2026-09-19 so another agent or human can continue without either conversation.

## What Tripwire is

A Chrome MV3 extension plus a local Next.js backend, built for the Nansen Meridian Buildathon (submissions close 2026-09-27). It puts Nansen onchain intelligence where trading decisions happen:

- **On X:** a verdict chip under any post that mentions a token; clicking it opens a floating card (Flow / Wallets / Risk) with who bought and sold since the post. Author badges sit next to the username (Nansen entity, and Hyperliquid/Polymarket for linked wallets).
- **On venues:** Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket get a verdict strip above the trade button, and a block screen over the button when the user's rules fire (typed phrase to override). Twelve more venues get a docked card.
- **Anywhere:** the wallet lens marks addresses, ENS names and profile links on the page and opens a wallet card (holdings, PnL, Hyperliquid positions, Polymarket activity). Non-venue sites need a per-site permission granted from the popup.
- **Local pages:** `/` status, `/rules` editor, `/ledger` (Nansen call count toward the buildathon's 1,000-call rule), `/history`.

Product brief: `PRODUCT.md`. Architecture: `docs/ARCHITECTURE.md`. Decisions: `docs/DECISIONS.md` (ADR-0001..0012).

## Repo layout

```
packages/core      types, zod schemas, signals, rules/presets, formatting, wallet detection
apps/web           Next.js backend: Nansen client (cache/ledger/budget/replay), intel builders,
                   API routes, the four local pages
apps/extension     WXT MV3: background bridge, content scripts (x, venues, wallet), UI kit
                   (chip, popover card, block screen, strip, dock, badges), popup, e2e
fixtures/          recorded real API responses for replay mode
docs/              this file, architecture, decisions, calibration, spikes, briefs, build log
```

## Run it

```bash
pnpm install
pnpm -F web dev                 # backend on http://127.0.0.1:3000
pnpm -F extension build         # then load apps/extension/.output/chrome-mv3 unpacked
pnpm dev:replay                 # backend with TRIPWIRE_REPLAY=1 (recorded data, no key, no credits)
pnpm verify                     # typecheck + all unit tests — the only "done" gate
TRIPWIRE_E2E_PORT=3217 pnpm verify:e2e   # Playwright with the built extension
```

The Nansen key comes from `apps/web/.env.local` (`NANSEN_API_KEY`) or, if absent, the Nansen CLI login at `~/.nansen/config.json`. Never print it, never put it in the extension. The extension's ID is pinned (`hocgbioagcfmdpgcnfgnneopohjfkeoj`) and the backend only accepts that origin plus its own pages.

## Non-negotiables (these came from reviews and user feedback; breaking them is a regression)

1. **Never block on missing data.** A missing signal is `null` → verdict UNCHECKED, never CLEAR, never a block.
2. **Never guess wallet ownership.** X→wallet links are exact only: a Nansen entity name match, a curated entry with a fetched source URL, or a link the user typed. See `docs/SPIKE-badges.md`.
3. **The key never leaves `apps/web/lib/nansen`.** The extension talks only to the local backend; the backend talks to Nansen, Hyperliquid, Polymarket and (in the perp work) other venue APIs.
4. **Host pages are hostile:** read `textContent`/attributes only, render through React in a Shadow DOM, never `innerHTML`.
5. **Mounted UI fits its anchor:** never wider than the anchor box, no host-page horizontal scroll, and lift out of row-layout containers before mounting (`liftOutOfRow`) — Jumper and Uniswap broke on this.
6. **Desktop only.** No mobile layouts or captures.
7. **Visual contract:** `docs/DIRECTION-CONTRACT.md` (Nansen brand world: #06080B ground, mint #00FFA7, Inter + Sora, JetBrains Mono for addresses, Lucide icons, bundled logos, 16px pills). No emoji, no gradients beyond the one sheen line, text ≥ 11px, contrast ≥ 4.5, hit targets ≥ 24px.
8. **Credits are real money.** Chip mode stays cheap; anything ≥ 5 credits waits for an explicit tab or the expanded view. Every call goes through `nansenPost` so it lands in the ledger and the cache.

## Where the work stands

Branch `feat/cockpit-ui` (not pushed; `master` is at the earlier `2e59a4b`). HEAD is `82ad58e`, which commits the 2026-09-19 takeover closure. The 2026-09-20 live Jumper stacking/Sui-name repair is currently an uncommitted working-tree diff on top of it. Shipped on the branch:

- Nansen-brand re-theme across extension, popup and web; Lucide icons; 28 official logos with provenance (`apps/extension/public/logos/SOURCES.md`).
- Floating popover cards (replacing inline expansion), tabs, block-screen composition fixes.
- Author badges + `/api/links` + `/api/author-badges`.
- Evidence card v2: token identity header, View on Nansen, 5m–7d window control, interactive lightweight-charts price chart.
- Signal recalibration to volume-normalised signals (`docs/CALIBRATION.md`): `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct`, `drawdown_pct`; `fresh_buy_share` and the USD-denominated signals are gone.
- Wallet lens: detection, `/api/wallet`, wallet card, per-site consent, token-logo proxy.
- Venue adapter fixes against real captured DOM (`docs/VENUE-CHECK.md`), strip placement, out-of-coverage and native-asset copy.

- Expanded evidence, wallet, and author-badge cards with per-kind persistence, focus trapping, and state-preserving collapse back to the anchor.
- Immediate card shells with section-shaped skeletons and `aria-busy`; wallet loading now follows the same treatment.
- Perp depth from Hyperliquid plus Binance, Bybit, OKX, and dYdX, normalized funding/OI, liquidation bands/positions, trader leaderboards/trades, and price/funding charts. Paid depth remains behind explicitly priced tabs.
- Capture-driven UI polish: explicit expanded Spot layout, 4×2 market readouts, discoverable third Traders cohort, Chromium scroll affordance, and compact wallet metadata.
- The stale Hazard `DESIGN.md` and missing ADR-0009..0012 have been reconciled with the built Nansen UI.
- Live Jumper repair: floating Shadow hosts now retain their intended layer above hostile widgets, and LI.FI's current Sui id prints `Tripwire doesn't cover Sui` instead of a clamped numeric fallback.

The per-round build reports and feature briefs that drove this work are kept out of the repository (see `.gitignore`); each round's rationale is in its commit messages, and the durable rulings are in `docs/DECISIONS.md`.

## What is left

1. **Done (2026-09-20):** the working tree was verified (859 tests, both builds) and committed; `master` is fast-forwarded to the branch. No remote is configured, so nothing can be pushed yet.
2. Run a manual load-unpacked pass on live x.com, jup.ag, app.hyperliquid.xyz, and polymarket.com. Automated replay E2E is green, but venue DOMs are the volatile boundary.
3. Re-run `impeccable detect apps/extension apps/web packages/core` against the regenerated `DESIGN.md` (ADR-0013); older counts were measured against the retired document.
4. **Buildathon submission:** see `docs/SUBMISSION.md` — ledger at 616 calls (1,000 needed), demo shot list, X post draft, form requirements. Needs a GitHub remote.
5. **Known gaps:** `.sol` names don't resolve (no working free resolver); the curated wallet list ships empty; Polymarket open positions lack size/price fields from Nansen; `profiler/labels` (100 credits) has no fixture; lightweight-charts is loaded eagerly (~52KB gzip); calibration thresholds rest on a single day's sample; `predictedFundings` is not surfaced.

## Latest verification (2026-09-20)

- `pnpm verify`: typecheck clean; core 200, web 159, extension 436 tests passed.
- Sequential production builds and desktop replay E2E: 12 passed, 3 capture-only specs skipped.
- Capture run: 3 passed; compact/expanded Jumper evidence and the Sui strip were regenerated and visually inspected alongside the existing set.
- `git diff --check`: clean.
- Final code review: **APPROVE**, with zero remaining critical/high/medium/low findings after cleanup and tooltip fixes.

## How to work on it

- Read `docs/DECISIONS.md` and the relevant commit messages before touching a feature; they carry the binding requirements and the reasons.
- Follow TDD: the suites are `pnpm -F @tripwire/core test`, `-F web test`, `-F extension test`; e2e loads the real built extension against stubbed X/Jupiter pages in `apps/extension/e2e`.
- Record new fixtures with a script and one live run, never ad hoc, and keep the credit cost in the report.
- Quote command output before claiming anything passes.
- `.impeccable/`, `.superpowers/`, `tasks/` and the per-round briefs are gitignored scratch; durable copies live in `docs/`.
