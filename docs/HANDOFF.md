# Tripwire handoff

Written 2026-09-18 so another agent (Codex, a fresh Claude session, or a human) can take over without this conversation. Everything here is checked into the repo.

## What Tripwire is

A Chrome MV3 extension plus a local Next.js backend, built for the Nansen Meridian Buildathon (submissions close 2026-09-27). It puts Nansen onchain intelligence where trading decisions happen:

- **On X:** a verdict chip under any post that mentions a token; clicking it opens a floating card (Flow / Wallets / Risk) with who bought and sold since the post. Author badges sit next to the username (Nansen entity, and Hyperliquid/Polymarket for linked wallets).
- **On venues:** Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket get a verdict strip above the trade button, and a block screen over the button when the user's rules fire (typed phrase to override). Twelve more venues get a docked card.
- **Anywhere:** the wallet lens marks addresses, ENS names and profile links on the page and opens a wallet card (holdings, PnL, Hyperliquid positions, Polymarket activity). Non-venue sites need a per-site permission granted from the popup.
- **Local pages:** `/` status, `/rules` editor, `/ledger` (Nansen call count toward the buildathon's 1,000-call rule), `/history`.

Product brief: `PRODUCT.md`. Architecture: `docs/ARCHITECTURE.md`. Decisions: `docs/DECISIONS.md` (ADR-0001..0008; later ADR text lives in `docs/BUILD-LOG.md`, not yet merged into DECISIONS.md).

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

Branch `feat/cockpit-ui` (not pushed; `master` is at the earlier `2e59a4b`). Shipped on the branch:

- Nansen-brand re-theme across extension, popup and web; Lucide icons; 28 official logos with provenance (`apps/extension/public/logos/SOURCES.md`).
- Floating popover cards (replacing inline expansion), tabs, block-screen composition fixes.
- Author badges + `/api/links` + `/api/author-badges`.
- Evidence card v2: token identity header, View on Nansen, 5m–7d window control, interactive lightweight-charts price chart.
- Signal recalibration to volume-normalised signals (`docs/CALIBRATION.md`): `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct`, `drawdown_pct`; `fresh_buy_share` and the USD-denominated signals are gone.
- Wallet lens: detection, `/api/wallet`, wallet card, per-site consent, token-logo proxy.
- Venue adapter fixes against real captured DOM (`docs/VENUE-CHECK.md`), strip placement, out-of-coverage and native-asset copy.

In flight when this was written: **expand view + instant skeletons + perp depth** (`docs/briefs/expand-and-perp-depth.md`). If that build did not finish, its brief is the spec; check `git log` on the branch and `docs/BUILD-LOG.md` for how far it got.

## What is left

1. Finish the in-flight brief above if incomplete.
2. **Finish review + documentation pass:** the visual world changed twice, so `DESIGN.md` still describes the retired "Hazard" world. Rewrite it from the built UI (tokens + prose), then re-run `impeccable detect` — most of its ~80 advisory findings are drift against that stale file.
3. **Fold later ADR text into `docs/DECISIONS.md`** (badges ADR-0009, recalibration ADR-0010, wallet lens, expand/perp): the text is in `docs/BUILD-LOG.md`.
4. **Merge `feat/cockpit-ui` into `master`** (fast-forward; the user decides) and update `tasks/todo.md`.
5. **Buildathon submission:** ≥1,000 Nansen API calls logged on `/ledger` (check the count; the CLI under-reports per-call credits, see `docs/CALIBRATION.md`), a demo recording with no narration, an X post tagging @nansen_ai, and the entry form (email + X link + GitHub repo). The repo has no git remote yet — one must be added to submit.
6. **Known gaps:** `.sol` names don't resolve (no working free resolver); the curated wallet list ships empty; Polymarket open positions lack size/price fields from Nansen; `profiler/labels` (100 credits) has no fixture; lightweight-charts is loaded eagerly (~52KB gzip) and should be lazy; calibration thresholds rest on a single day's sample.

## How to work on it

- Read `docs/briefs/*.md` before touching a feature; they carry the binding requirements and the reasons.
- Follow TDD: the suites are `pnpm -F @tripwire/core test`, `-F web test`, `-F extension test`; e2e loads the real built extension against stubbed X/Jupiter pages in `apps/extension/e2e`.
- Record new fixtures with a script and one live run, never ad hoc, and keep the credit cost in the report.
- Quote command output before claiming anything passes.
- `.impeccable/` and `.superpowers/` are gitignored scratch; durable copies live in `docs/`.
