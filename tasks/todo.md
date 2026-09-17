# Tripwire: /ship plan

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
- [ ] T7 API routes: resolve, post-intel, guard, person-intel, rules, ledger, override, health (http.ts done; store.ts, routes, route tests)
- [ ] T8 Web pages in Hazard style: `/` status, `/rules` editor, `/ledger`, `/history`
- [ ] T9 Extension scaffold (WXT MV3 + React), background API bridge, popup
- [ ] T10 UI kit in Shadow DOM: Chip, Panel (spot/perp/prediction), BlockScreen, Strip, Dock, mount
- [ ] T11 X content script and tweet parser with fixture tests
- [ ] T12 Venue adapters (tier 1 + tier 2) and guard runner with URL/anchor tests
- [ ] T13 README, `.env.example`, `docs/SPIKE.md`, record-fixtures docs, end-to-end smoke with the dev server
- [ ] Verify: `pnpm verify` + both builds, quote last 20 lines
- [ ] Secure: security-reviewer on the diff (max 2 fix loops)
- [ ] Design: /impeccable critique (max 2 fix loops)
- [ ] Finish branch; PR only if origin exists
- [ ] Cost logged

## Review
_(filled at the end)_
