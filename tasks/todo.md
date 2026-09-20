# CHUMP Dexscreener identity and liquidation readability (2026-09-20)

- [x] Trace Robinhood pool resolution; preserve the exact returned base-token contract for standard and v4 pools.
- [x] Replace the unlabelled liquidation sketch with responsive price-axis clusters and inspectable position values.
- [x] Repair Polymarket leaderboard badge placement and pointer handling around stretched profile links; enlarge to a real 28px target.
- [x] Preserve main leaderboard badges when the wallet appears again in lower-page cards.
- [x] Run unit/browser regressions, review the scoped changes, build and restart the local backend.

Review: exact CHUMP contract returned live for Robinhood v3 and v4 pools. Liquidation chart has price labels, adaptive precision, inspectable aggregated values and a responsive 240/320px chart; summary/table grouped together. PM live DOM inspection identified stretched-link interception; a browser reproduction proves name alignment, 28px button target and mouse/keyboard opening without navigation. Scope reviews approved. All typechecks and 859 unit tests passed (core200/web182/extension477); production builds passed. Local backend PID21472 running live on3000. Reload the unpacked extension and affected pages to use the build.

---

# Cross-market exploration on X and DEXes (2026-09-20)

- [x] Preserve selected trade chain/contract; eliminate cross-chain symbol substitution.
- [x] Return spot and perp search markets with identity, chain, price, volume and explicit supported-detail status.
- [x] Add Markets view to X/DEX spot cards, with lazy same-market evidence and perp detail navigation; keep Hyperliquid perps-only.
- [x] Exercise ZEC/SPCX-style results, strict identity, paid-tab boundaries and isolated failures; build, capture and review.

Result: ticker-only X posts now open a market catalog rather than an arbitrary chain's verdict. Contract posts and supported DEX trades keep scoped evidence with a Markets tab; identified unsupported DEX assets can browse available markets too. Search results keep exact addresses/chains, distinguish related tickers, separate spot/perp volumes, paginate, show market snapshots and link to Nansen. Supported detail targets drill into the existing charts/flows/holders or perp sections lazily; Near and namespaced perps remain snapshot+external-detail entries. Robinhood spot checks are supported and strict chain hints never fall back elsewhere. UI designed directly for this session; no Impeccable used.

Live validation: ZEC returned7 spot/perp/related results including Near; SPCX returned17. Robinhood SPCX resolved exactly to0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea and returned20buyers/20sellers/noerrors. Units: core200/web179/extension466 and typechecks passed. Backend/extension builds passed; final reviewer approved after unsupported-DEX entry and numeric ticker-prefix corrections.

---

# Track native ETH rather than exclude it (2026-09-20)

- [x] Verify Nansen native ETH identity using live search and Arbitrum guard panel.
- [x] Normalize venue ETH/NATIVE/zero markers to Nansen's same-chain 0xeeee identifier on Ethereum, Arbitrum, Base and Optimism.
- [x] Verify the full chip and evidence request path with a browser regression.

Live result: Ethereum name/logo/price, populated flow intelligence,20 buyers,20 sellers, no errors. This supersedes the earlier unsupported-native ETH ruling; avoiding the zero burn-address request did not require disabling tracking.

---

# X badge tooltip clipping (2026-09-20)

- [x] Lift hover/focus labels into the native popover top layer, retaining their accessible naming association.
- [x] Clamp tooltip placement to the viewport and clean up scroll/resize listeners on close.
- [x] Reproduce clipping with overflow-hidden post and profile headers; verify both labels remain visible above the header.

Verified:51 focused unit tests,2 browser tests,typecheck/build; scoped review approved. Badge/card behavior unchanged. Reload extension and page for the new tooltip implementation.

---

# Native ETH correction (2026-09-20)

- [x] Recognize zero-address and NATIVE markers as native coins, preserving the selection and skipping contract evidence requests.
- [x] Use the selected chain's native symbol, and keep raw upstream JSON/request IDs out of popup errors.
- [x] Verify60 focused adapter tests,168 web tests, production builds and scoped code review (approved).

---

# Badge recovery after backend shutdown (2026-09-20)

- [x] Confirm actual backend status before changing identity parsing: port3000 was offline, and restarting it restored Vitalik's successful live entity response.
- [x] Start the local server as a detached hidden process with logs under scratch/local-server.*.log.
- [x] Retry offline author lookups after a shared health probe, with a bounded batch and no overlapping recovery loop.
- [x] Catch rejected wallet-link save/unlink operations and recognize invalidation errors across realms.
- [x] Verify recovery regression tests, browser badges and review.

Verified: extension461 tests (including3 offline/recovery/disposal regressions), typecheck/build, and3 focused browser tests passed; review approved. Detached node PID8552 remained healthy after subsequent commands, replay:false; guarded Vitalik lookup returned the entity with no errors. New pasted venue log could not be attributed to a remaining current venue mount escape; current async bind callbacks are already guarded. Added catches for two confirmed X link-update paths.

---

# Jumper selector and coverage copy (2026-09-20)

- [x] Suppress the strip, dock and open evidence while a visible Jumper token/network picker is open or no output token is selected.
- [x] Preserve cancellation of pending guards and restore the selected-token strip on picker close.
- [x] Name Stellar and selected token in unsupported coverage copy; remove numeric IDs and the technical no-target message.
- [x] Preserve chain/contract identity instead of substituting cross-chain ticker matches.

Verified: extension458 tests, typecheck and build passed; focused Jumper/coverage browser tests2 passed; reviewer approved with no findings.

---

# Live-data correctness and popup redesign (2026-09-20)

- [x] Fix misleading replay wallet/token identity and repeated logos; verify the reported Matt wallet with live data and improve label resolution.
- [x] Resolve Dexscreener base token from the actual page rather than treating a pair address as a token; bound the dock to its panel/viewport.
- [x] Fix invalidated extension context handling, robust popup layering and real X main-profile badge discovery.
- [x] Replace long holder/wallet tables with compact pagination and data-based distribution charts; apply PnL colors and responsive grid sizing.
- [x] Finish row-specific Nansen links and short accessible tooltips.
- [x] Run browser regressions, inspect captures and review before rebuilding for local testing.

Review: modern-web-guidance used for top-layer promotion and intrinsic responsive grid sizing. Native manual popover wrapper preserves the existing focus/anchor contract with a feature-detected fallback. Context invalidation cancels obsolete async mounts/tasks. X nested identity wrappers are covered. Dex public API resolves the reported pool to the exact TIPPED mint, cached with stale-URL guards; dock is bounded to320px at bottom-right. Wallet/entity details now have Summary/Holdings/Performance views, allocation/PnL charts, and paged lists; the holder tab has a distribution chart and six rows/page. Logo requests validate identity and use versioned live/replay caches, preserving Solana case. Actual Matt wallet returned SOL/BRRR/USDC and +$103566.50 realized PnL; TIPPED returned its actual token info,20buyers,20sellers, no errors.

Verification: core200/web168/extension456 tests passed; production builds passed; final browser smoke suite14 passed; captures3 passed and inspected, with the final wallet/entity capture rerun passing. Reviewer APPROVE. Live server running on port3000 with replay:false. All new work remains uncommitted.

Known API limits: both free address-search methods returned no Matt label though the Nansen website shows one. Premium labels were not silently fetched. Historical balances return paginated token/day rows, so a complete90-day curve was not invented from one incomplete page; charts use real allocation and token PnL. Scroll remains an accessibility fallback for small windows/zoom, not hidden clipping.

---

# Row-specific Nansen links (2026-09-20)

- [x] Add a shared external-link arrow with a View on Nansen tooltip and an accessible row-specific name.
- [x] Link holder/buyer/seller/trader wallet rows, prediction holders, linked wallet addresses, portfolio tokens and top PnL tokens to their exact Nansen destination.
- [x] Keep missing wallet addresses non-interactive and preserve safe new-tab link attributes.

---

# Entity discovery and richer profiles (2026-09-20)

- [x] Add profile-header badge discovery for ordinary X handles and preserve tweet badges.
- [x] Surface additional measured entity data: portfolio breakdown, more holdings, trade activity, top PnL tokens, and direct Nansen entity link.
- [x] Verify exact matching for non-ENS names and make replay status explicit on badge cards.
- [x] Test profile navigation, unknown accounts, card contents, and existing badge behavior; rebuild and review.
- [x] Start the local backend in live mode for real coverage and verify known figures through the guarded API.

Results: core 200 / web 161 tests passed; extension final suite 447 passed. Production builds succeeded; full replay smoke 13 passed, 3 capture-only skipped. Final semantic-layout profile and author-badge smoke tests passed. Captures passed 3, with profile/header and expanded entity images inspected. Review approved after lookup-failure retry and truncated-count wording fixes. Live backend on port3000 now reports replay:false. Guarded lookups returned ZachXBT (20 holdings/11 chains) and Vitalik Buterin (20 holdings/10 chains), no errors, using four credits total. Reload the unpacked extension and refresh X to load new content scripts and clear page-session replay caches.

---

# Card credit-usage cleanup (2026-09-20)

- [x] Remove credits-used totals from evidence and wallet card footers; preserve dashboard accounting and prices before paid actions.
- [x] Update existing wallet and Perp browser assertions to require no usage totals in card footers.

---

# X badge alignment (2026-09-20)

- [x] Keep author badges on the name/verification line with a 4px gap.
- [x] Restore modified name-wrapper styles when the badge mount is removed.
- [x] Verify the actual badge/verification bounding boxes and card interaction in Chromium.

Result: extension typecheck, 24 focused unit tests, production build, and the author-badge browser test pass. Browser coverage asserts a 4px horizontal gap and matching vertical centers beside a verification icon in X's column wrapper.

---

# Jumper live-site repair plan (2026-09-20)

Goal: fix the live Jumper screenshots: Tripwire evidence must render above the host widget in compact and expanded modes, while unsupported Bitcoin/Sui copy stays specific and readable inside the narrow strip.

## Plan

- [x] Trace the Shadow DOM mount host and Jumper adapter/chain-name paths; prove the stacking and copy root causes from source and the live DOM.
- [x] Add regression coverage for a hostile high-z-index Jumper widget, compact/expanded card visibility, supported tokens, and named unsupported chains.
- [x] Implement the smallest host-layer and constrained-strip fixes without weakening host-fit, focus, or paid-call guarantees.
- [x] Run focused tests, extension typecheck/build, full verification, replay E2E, and capture/live-browser inspection.
- [x] Run final code review, address findings, update lessons/patterns and this review record.

## Review

Complete. Live computed styles proved WXT's shadow reset reduced the evidence host to `static / auto / inline`, below Jumper's `z-index: 1110` widget. `mountReact` now restores WXT's floating-host contract with a later same-shadow rule, leaving inline mounts and pointer behavior unchanged. LI.FI's current Sui ID now maps to `Sui`, so the existing two-line strip displays complete copy without a layout workaround.

Verification:

- Focused red/green tests: mount stacking and Sui naming failed before the fix, then passed (28 tests).
- `pnpm verify`: core 200, web 159, extension 436; all typechecks clean.
- Sequential production builds passed; replay E2E passed 12 with 3 capture-only specs skipped.
- Capture run passed 3; compact/expanded Jumper evidence and the Sui strip were visually inspected clean.
- Final independent review: **APPROVE**, zero findings at every severity.
- `git diff --check`: clean.

The built extension must be reloaded from `apps/extension/.output/chrome-mv3` before rechecking the live Jumper tab.

---

# Tripwire: Codex takeover plan (2026-09-19)

Goal: take over the `feat/cockpit-ui` branch from the 2026-09-18 Claude handoff, finish the in-flight expand/skeleton/perp-depth brief, and leave the branch verified and documented.

## Plan

- [x] Audit commits `91f5592`, `4bf5e30`, and `832835d` against every requirement in `docs/briefs/expand-and-perp-depth.md`.
- [x] Establish a clean baseline with `pnpm verify`, both production builds, and the desktop E2E suite.
- [x] Fix only confirmed implementation or test gaps from the audit, preserving lazy paid-call behavior and the never-block-on-missing-data rule.
- [x] Polish the shipped UI from the real desktop captures: strengthen hierarchy, spacing, overflow handling, and expanded-card density without changing the Nansen direction.
- [x] Produce and inspect the required desktop captures; the design detector was attempted but is no longer installed on `PATH`.
- [x] Rewrite stale `DESIGN.md` guidance from the shipped Nansen visual system and fold the post-ADR-0008 decisions from `docs/BUILD-LOG.md` into `docs/DECISIONS.md`.
- [x] Update `docs/BUILD-LOG.md`, `docs/HANDOFF.md`, and this checklist with exact verification results, residual risks, and the next human-only actions.
- [x] Review the final diff for scope, security, accessibility, and avoidable complexity.

## Takeover review

Takeover closure is complete in the working tree on `feat/cockpit-ui` at committed HEAD `832835d`; nothing was committed, merged, or pushed.

- The three post-handoff commits were audited against the brief. The implemented architecture is retained: one shared compact/expanded React tree, an atomic base response, and explicit lazy paid tabs.
- Closed gaps: wallet and author-badge expansion/persistence, shaped wallet loading, state-preserving resize, explicit expanded Spot/Perp layouts, discoverable Traders cohorts, overflow/scroll affordances, compact wallet metadata, and keyboard/pointer-accessible tooltips.
- Capture fixtures now remove temporary author-wallet links in `finally`, check both DELETE responses, and close the page even when a capture fails.
- Documentation now matches the product: current Nansen `DESIGN.md`, ADR-0009..0012, calibrated signal/preset tables, closure log, and refreshed handoff.
- Final review required two accessibility/test-hygiene corrections and then returned **APPROVE** with 0 critical, high, medium, or low findings.

Verification:

- `pnpm verify`: core 200, web 159, extension 435 tests passed; all typechecks clean.
- `$env:TRIPWIRE_E2E_PORT='3217'; pnpm verify:e2e`: both production builds passed; 12 replay E2E passed, 3 capture-only specs skipped.
- Capture run with `TRIPWIRE_CAPTURE=1`: 3 passed. Required brief images plus expanded wallet/badge images were regenerated and visually inspected.
- `git diff --check`: clean. Shadow-DOM source CSS is 59,784 bytes, below the 60,000-byte regression ceiling.

Human-only next actions: load the unpacked extension on the real volatile sites, review/commit this working-tree diff, merge when desired, add a remote if pushing, hit the 1,000-call ledger goal, and record/post/submit the buildathon entry.

---

# Historical Tripwire: /ship plan

Goal: ship Tripwire per `docs/superpowers/specs/2026-09-17-tripwire-design.md`. The detailed plan is `docs/superpowers/plans/2026-09-17-tripwire.md`; decisions since the plan are in `docs/DECISIONS.md`.
Worktree: `C:/work/Nansen/feat-tripwire` (branch `feat/tripwire`).

## Done before /ship
- [x] T1 Workspace scaffold
- [x] T2 Core types, token extraction, timeframe
- [x] T3 Signals (spot, perp, prediction)
- [x] T4 Rules engine and presets
- [x] T5 Nansen client (cache, dedupe, ledger, budget, 429, replay) and key resolution (env, then CLI config)
- [x] T6 Endpoint wrappers, live-recorded fixtures, intel builders (spot, perp, prediction, person, resolve)
- [x] Live checks via Nansen CLI and API: all 16 endpoints return 200 (see `scratch/findings.md`, ADR-0005/0006)

## /ship phases
- [x] Context docs bootstrapped (PRODUCT, DESIGN, ARCHITECTURE, DECISIONS, CLAUDE, verify.json, CI)
- [x] T7 API routes: resolve, post-intel, guard, person-intel, rules, ledger, override, health (http.ts done; store.ts, routes, route tests)
- [x] T8 Web pages in Hazard style: `/` status, `/rules` editor, `/ledger`, `/history`
- [x] T9 Extension scaffold (WXT MV3 + React), background API bridge, popup
- [x] T10 UI kit in Shadow DOM: Chip, Panel (spot/perp/prediction), BlockScreen, Strip, Dock, mount
- [x] T11 X content script and tweet parser with fixture tests
- [x] T12 Venue adapters (tier 1 + tier 2) and guard runner with URL/anchor tests
- [x] T13 README, `.env.example`, `docs/SPIKE.md`, record-fixtures docs, end-to-end smoke with the dev server
- [x] Verify: pnpm verify exit 0 (core 69, web 81, extension 195); web + extension builds; verify:e2e 4/4 @smoke
- [x] Secure: REJECT (any-extension origin, clickjacking, missing Origin) → fixed → PASS on loop 2
- [x] Design: /impeccable critique 21/40 (P0 popup bypass, P1 block screen/hits/dock) → 2 fix loops; detector 25 → 2 false positives
- [x] Finish: branch kept (no git remote → no PR; no .vercel → no preview deploy)
- [ ] Cost: run /cost in the terminal and append here (the agent cannot run slash commands)

## Review
Shipped on feat/tripwire (worktree C:/work/Nansen/feat-tripwire). Final whole-branch review (opus) found 3 critical + 9 important issues; all fixed and re-reviewed. Security review PASS after one fix loop. Playwright smoke covers X chip/panel, Jupiter block click-through, stale verdict on token change.

Open for the human:
- Merge feat/tripwire into master (or add a GitHub remote and open a PR).
- Manual load-unpacked check on live x.com, jup.ag, app.hyperliquid.xyz, polymarket.com before recording (e2e uses stubbed pages).
- Record demo, post on X tagging @nansen_ai, submit the form.
- Parked: /history shows current rule wording for old overrides; ~1s pushState detection latency; override not bound to a guard token (local audit only); host allowlist case-sensitive, no IPv6.

### Rulings made on your behalf
- Ruling: budget error returns HTTP 429 {error:"budget"} — 429 is the standard "back off" code and the extension treats both as UNCHECKED — costs a trivial status-code change if wrong.
- Ruling: implemented code signatures (apps/web/lib/intel/*) override plan T6 text — they are tested against live-recorded fixtures — costs nothing if wrong beyond doc drift.
- Ruling: DESIGN.md typography wins (Archivo + JetBrains Mono, no Schibsted) — DESIGN.md is the visual contract written after the plan — cheap font swap if wrong.
- Ruling: fonts are bundled (@fontsource-variable/archivo, @fontsource/jetbrains-mono) not fetched from Google on host pages — privacy and CSP on x.com block remote fonts — costs bundle size.
- Ruling: storage node:sqlite without Drizzle (ADR-0003) — no native deps on Windows — costs hand-written SQL.
- Ruling: EVM contract addresses in X posts default to ethereum unless post text mentions "base" — no chain info in a bare 0x address — costs a wrong-chain UNCHECKED on L2 tokens.
- Ruling: Hyperliquid HIP-3 markets (xyz:TSLA) and Dexscreener pair URLs yield null target (UNCHECKED dock) — Nansen perp data covers native coins; pair≠token — costs coverage on those pages.
- Ruling: outflow signals (exit_pressure, sm_netflow_24h) are always non-positive thresholds; fix the sentence wording instead of conditional sign — preset text "below ${n}" reads wrong for a negated value, "net outflow exceeds ${n}" is unambiguous and 0 means "any outflow" — costs a copy change in core presets; if wrong, users can't express "block unless netflow > +$X" (not a spec requirement).
- Ruling: focus rings are #EDEDED on ink surfaces and ink on yellow surfaces (not yellow) across web, popup and extension UI — DESIGN.md reserves yellow for danger and an ink ring is invisible on dark hosts — costs a CSS sweep in the final fix wave; if wrong, only ring color changes.
- Ruling: Uniswap/Matcha/PancakeSwap with no chain param → null target (UNCHECKED dock), not a default chain — the UI uses the wallet's chain, and guarding the wrong chain's token could show a false CLEAR — costs coverage on bare URLs.
- Ruling: pin the extension ID via a fixed public manifest.key (public key only, no private key kept or committed) and default the server allowlist to that ID; TRIPWIRE_EXTENSION_ORIGIN overrides for dev forks — a manifest key is a public identifier, not a credential — costs: forks must regenerate key + env.
- Ruling: security fixes #1-#3 go into the same single fix wave as the final code review findings; #4 (override token) parked as local-audit-only, low impact.
- Ruling: prefer contract address over cashtag when a post has both (supersedes Task 11 choice) — scam posts pair a namesake ticker with the real CA — costs nothing meaningful.
- Ruling: Polymarket target is UNCHECKED unless market unambiguous, outcomes exactly Yes/No, and outcome read from a market-scoped control — false blocks on multi-outcome markets are worse than no check — costs coverage on event pages.
- Ruling: weakening protection in /rules (lower preset or disabling a block rule) requires an inline confirm — clickjacking defence in depth — costs one click.
- Ruling: budget exhaustion surfaces as UNCHECKED with headline "Nansen credit cap reached" on chip/strip — never blocks on missing data — costs nothing.
- Task C4: parked — override not bound to a guard token — Ruling: local audit trail only, no credit spend or rule change; revisit if overrides feed anything.
- Ruling: accept @playwright/test pinned to 1.62.1 (already-installed Chromium) instead of BLOCKED — same bundled Chromium capability, avoids a failing 150MB download — costs a version bump later.
- Ruling: accept Next 16 proxy.ts instead of middleware.ts — framework rename — costs nothing.
- Parked: URL-only token change detected by 1s poll, stale block can persist up to ~1s — Ruling: pre-existing, bounded, "Checking…" appears immediately after detection — costs a sub-second window; could hook history.pushState later.
- Parked: residual A2 race — async onBind mount can land after a target change (ms window) — Ruling: no second fix wave per process; ms-scale and the new verdict replaces it — costs a brief stale strip; fix by key-checking in onBind/renderFrame.
- Parked: X sweep unmount then late update throws React #409 unhandled rejection in console on fast scroll — Ruling: console-only, no UI impact — fix by nulling root in mount.ts onRemove (one line); surface to human.
- Parked: popup shows "No Nansen key… not ready" in replay mode — Ruling: cosmetic, docs describe replay — fix status.ts to treat replay as ready; surface to human.
- Ruling: override phrase check is case-insensitive and whitespace-normalized — mobile auto-capitalization makes exact case a usability failure, the friction is the typing not the case — costs slightly less friction.
- Ruling: block screen initial focus goes to the dialog container (announced via aria-describedby hits), primary visible action "Back off" dismisses nothing but scrolls user to safety? no — "Keep blocked" is implicit; add a reassurance line and put Evidence first — costs nothing.
- Ruling: 11px becomes a documented DESIGN.md type step (label-sm 0.6875rem) and #4a3e00 (ink-on-yellow muted) + #2A2A2A (border-neutral) become tokens; #f4f4f4 replaced by #EDEDED — documents real usage ≥11px floor — costs a DESIGN.md edit.
- Ruling: CAUTION strip and weaken-confirm row use a full 1.5px yellow border per DESIGN.md instead of a 4px side border — spec fidelity over detector exception — costs nothing.
- Parked: /history override sentences use current thresholds (rows store rule ids only) — Ruling: acceptable for v1; store thresholds per row later — costs historical accuracy of wording.

## Round 1.4.9 — Uniswap UI-selected token (wrong instruction)

Reported: swap form with Sell=ETH, Buy=GIZA on Base reads "UNCHECKED — Select a network to
check GIZA". The user has selected the network; the instruction is a confident falsehood.

- [x] 1. Diagnose against the live DOM (Playwright, read-only, no wallet)
- [x] 2. Save the capture to apps/extension/test/fixtures/venues/
- [x] 3. Failing tests first (adapter, gap copy, runner)
- [x] 4. Read the chain from the Buy token's badge when the URL lacks it
- [x] 5. Honest copy for every remaining unknown-chain case
- [x] 6. Audit the other venues' gap copy for the same pattern
- [x] 7. pnpm verify, both builds, verify:e2e on 3231
- [x] 8. Recapture strip-uniswap-native.png + new strip-uniswap-ui-selected.png
- [x] 9. docs/BUILD-LOG.md section

### Review

Root cause was NOT a delayed URL write. Uniswap never writes `chain`/`outputCurrency` for a
picker-chosen token, and the Buy token's chain exists only inside its badge's own
`data-testid="network-logo-<chainId>"` — no `data-chain-id`, `alt=""`, no `title`, no
`aria-label`, which is what the old reader scanned. There is no page-level network selector to
fall back to, so the order is badge -> URL, not badge -> selector -> URL.

Second defect found while fixing the first: `index.tsx` turned ANY chainless symbol gap into
`missing-chain` ("Select a network to check X"), so Jumper had the same wrong instruction. After
this round no adapter produces `missing-chain` at all; the kind survives as evidence-gated.

Third defect found: with the chain now known, an ambiguous resolve would have printed "Tripwire
couldn't find GIZA on Nansen" while holding several GIZA rows. Added `ambiguous-symbol`.

Verified: pnpm verify (core 313 / web 320 / extension 853, 0 failed), both builds, 33 e2e passed
on port 3231, both captures regenerated and opened. 0 Nansen credits (2 free search/general
probes on a throwaway server at 3232; port 3000 untouched).

Rulings made on your behalf:
- Ruling: the badge wins over the URL `chain` param ONLY when the URL names no `outputCurrency` —
  `chain` and `outputCurrency` are written together and describe the same token, so a stale badge
  must never re-chain the URL's address — costs the badge being ignored on a URL-driven page,
  where it agrees anyway.
- Ruling: the token-picker's `tokens-network-filter-trigger` is NOT read as the form's network —
  it is a modal search filter, not page state — costs nothing; reading it would be a guess.
- Ruling: `missing-chain` is kept in the union with no producer rather than deleted — a venue with
  a readable, provably-empty network control can earn it back — costs one dead branch.
