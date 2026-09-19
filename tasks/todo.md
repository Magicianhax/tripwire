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
