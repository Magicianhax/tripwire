# Build report: Glass Cockpit + floating evidence card

Branch `feat/cockpit-ui`, commits `f72e7ca..e270ff6` (6 commits on top of `2e59a4b`). Build path: code-led. The direction contract is `apps/extension/.impeccable/surfaces/apps-extension-lib-ui.md`. DESIGN.md is not updated: it still describes the old Hazard world and is left for the documenter.

## What changed, by surface

### Interaction (extension)
- **`lib/ui/Popover.tsx`, `lib/ui/popover-position.ts`:** one shared floating card.
  - It is a non-modal dialog (`role="dialog"`, `aria-modal="false"`, labelled by its heading).
  - Placement is computed by a pure helper. The card opens below the anchor and flips above when there isn't room. It is clamped 16px inside the viewport, 440px wide (never wider than the viewport minus 32px), and capped at min(70vh, 640px) with internal scroll. With `sheetBelow` set, it becomes a bottom sheet under 720px. With `prefer: "side"`, it opens beside the anchor (right, else left).
  - The card follows scroll and resize, repositioning at most once per animation frame. It also closes when the anchor scrolls out of view.
  - It closes on Escape, on a pointerdown outside, and from its close button. Only one card is open at a time: opening another closes the current one.
  - On open, focus moves to the heading. After Escape or the close button, focus returns to the trigger. An outside click does not pull focus back.
  - Keys pressed inside the card never reach the host page's hotkeys.
- **`lib/ui/Tabs.tsx`:** a real tablist, tab and tabpanel. Arrow keys wrap, Home and End work, and inactive panels stay in the DOM with `hidden`.
- **X (`entrypoints/x.content/index.tsx`):** the chip opens the card in its own shadow root on `<body>` (`position: "modal"`, click-through container). The inline panel inside the tweet is gone.
  - The card is tracked against its article, so the detached-tweet sweep still removes it.
  - The rapid-click sequencing in `createPanelToggle` is unchanged.
  - Person intel stays inside the card as an advisory line.
- **Venues (`entrypoints/venues.content/displays.tsx`):** Strip "Details" and the block screen's evidence button open the same card, anchored to the trigger.
  - From the block screen the card anchors to the whole block and prefers a side placement, so it never hides the warning.
  - The block screen's button opens a kind-specific tab first: Wallets for spot, Positioning for perps, Holders for prediction markets.
  - The tier-2 dock is a verdict chip that opens the card beside it, or a bottom sheet under 720px.
  - These behaviors are unchanged: anchor binding, blocker, override flow, replay tag, UNCHECKED on missing data, the `mountIfCurrent` stale-mount guard, and teardown.
- **Evidence tabs:**
  - Spot: Flow (5 center-zero gauges on a tick scale, a price sparkline with the post time marked, Smart Money netflow readouts), Wallets (top sellers and buyers with labels), Risk (rules that fired, risk indicators).
  - Perp: Positioning, Liquidations, Trades.
  - Prediction: Proven winners, Holders, Trades.
  - Every tab has an empty state.

### Visual world
- **Core:** `verdictPlate()` in `packages/core/src/format.ts` maps each verdict to a lamp tone and a shape mark:

  | Verdict | Tone | Mark |
  |---|---|---|
  | TRIPWIRE | warning | filled |
  | CAUTION | caution | filled |
  | CLEAR | normal | outlined |
  | UNCHECKED and LOADING | unlit | dashed |

  The extension plates and the web verdict chips both render from it.
- **Extension `theme.css`:**
  - Tokens follow the contract: #0A1020, #111A2E, #1B2740, #E6EDF7, #8FA3BF, and #FF4D4F, #FFB020, #22D3EE, #34D399, each lamp with a dim variant.
  - Hairline bezels. Radii are 8px for panels, 4px for plates and 2px for cells.
  - The only gradient is a 1px glass sheen on the card's top edge.
  - Chip: a lit annunciator plate plus a headline in Barlow with tabular figures.
  - Card: the instrument layout described above.
  - Strip: a plate, the finding, a mono rule clause and a cyan Details link.
  - Block screen: a master-warning panel with a lit red TRIPWIRE band ("Trade blocked by your rules"), square lamp marks for hits, a cyan evidence button, a green "Not trading is the safe move." line, and the override input with the phrase in a mono cell. The disabled Override button is a dashed, unlit control.
  - Dock chip: fixed top-right, moving bottom-right under 720px.
  - Advisory cyan is used for Replay, person intel, links, the selected-tab bar and all focus rings.
- **Motion:**
  - Filled and outlined plates light once from their unlit state in 180ms. A TRIPWIRE plate adds one brightness flash (420ms), and the block band does the same.
  - The card scales in from its anchor origin in 160ms. The bottom sheet slides in.
  - The loading lamp pulses.
  - Under `prefers-reduced-motion`, lamps don't animate and the card only fades.
  - Everything is CSS; no motion library was added to the content scripts.
- **Fonts:** @fontsource Barlow (400, 500, 600, 700), Barlow Condensed (600, 700) and JetBrains Mono (400, 700).
  - In content scripts they load through the existing one-time document font injection (`lib/ui/fonts.ts`, `web_accessible_resources` `fonts/*.woff2`, matches unchanged).
  - The popup and web pages import them.
  - Archivo was removed from both packages.
- **Font bug fixed on the way:** WXT injects `:host{all:initial !important}`, which overrode `font-family` set on `:host`, so body text in the old theme was also falling back to Times. Base type now lives on the component roots.
- **Popup:** 360px wide. It has a lamp status line (filled green, filled red or amber outline, dashed while checking), a visible "Rules preset" label, a segmented control with a lit advisory bezel on the selected preset, link buttons, and a mono backend URL field. The offline badge color changed from yellow to amber.
- **Web (`apps/web/app`):**
  - A sticky instrument-bar nav with a cyan current-page bar, and Barlow Condensed headings.
  - Readout strips for the status and ledger numbers, and tables in glass panels with mono figures.
  - Rule groups are bezelled row panels. Save is a cyan button, and the weaken-confirm is a caution panel.
  - Verdicts render as plates from `verdictPlate`. The favicon and the metadata description were updated.

### Tests
- **Unit tests (258 extension, 71 core):**
  - New: popover positioning (flip, clamp, height cap, origin, sheet, side placement), Popover behavior (dialog semantics, focus on open, Escape with focus return, outside click versus anchor or inside, close button, no focus theft on an outside click, single open, hotkey isolation), and Tabs (roles and ids, arrow/Home/End, initial tab).
  - Also new: plate mapping (core, plus a component test that chip, strip and dock never render UNCHECKED or LOADING as green), evidence tabs by kind, and the evidence button passing itself as the anchor.
  - Integration: the evidence card is a body-level dialog, Escape returns focus to the trigger, and an outside click closes it.
  - I confirmed the plate tests catch a regression by temporarily mapping UNCHECKED to green; they failed, and I restored the mapping.
- **e2e (5 passing):**
  - The X chip opens a card whose shadow host is a child of `<body>`: not inside the article, and the article height doesn't change. The card sits beside the chip, 440px wide and inside the margin. Heading focus, arrow-key tabs, Escape with focus back on the chip, and outside-click close are all checked.
  - New Jupiter test: evidence from the block opens on the Wallets tab, Swap stays blocked, and Escape keeps the block with focus on the evidence button.
  - The existing block click-through and stale-verdict tests still pass.
  - `TRIPWIRE_E2E_PORT` lets the replay backend run on another port; the fixtures set the extension's `backendUrl` before any page loads.
  - The X and Jupiter stubs now have dark host-like chrome with the same structure.

## Screenshots (`.impeccable/review/`)
All captures come from a replay backend on :3217 with a temp DB and the paranoid preset, plus the built extension in Playwright Chromium against the e2e stubs. I opened each file after round 2 and it shows what its name says.
- `x-popover.png`: TRIPWIRE chip under the post, with the card open below it on the Flow tab, over a dark X-like timeline.
- `x-popover-wallets.png`, `x-popover-risk.png`: the same card on the Wallets and Risk tabs.
- `x-chip.png`: the chip alone.
- `block-screen.png`: master-warning block over the Jupiter stub's Swap button.
- `block-evidence.png`: the block with its evidence card open beside it on the Wallets tab.
- `dock.png`: the dock chip with its card open (tier-1 no-anchor fallback on the Jupiter stub without a Swap button).
- `dock-mobile.png`: the same at 390px, as a bottom sheet.
- `popup.png`: the extension popup.
- `desktop.png`, `mobile.png`: `/rules` at 1440 and 390.
- `ledger-desktop.png`, `history-desktop.png`, `status-desktop.png`: the other pages at 1440.

Inspection rounds: 2.
- **Round 1 fixes:** the Times fallback for body text, block evidence covering the warning band (now side placement), mono chip headlines, a stray `$` on CA-token titles, a split Post legend, and mono text values on the status page.
- **Round 2:** captured clean.
- **After round 2, not recaptured:** added line-height 1.3 on the chip headline, whose descenders were clipped at line-height 1.

## Detector
`impeccable detect --json apps/web/app apps/extension/lib/ui apps/extension/entrypoints` found 25, all advisory, none mechanical:
- 23 `design-system-font-size`
- 2 `design-system-color` (the badge amber and ink in `background.ts`)

All 25 are drift measured against the old Hazard DESIGN.md, which this build replaces. They should clear once the documenter writes the new DESIGN.md. The edit hook also flagged literal X-like colors in `e2e/pages/x-timeline.html`. That is an intentional test stub imitating the host page, so I left it.

## Verification
- `pnpm verify`: core 71, web 81 and extension 258 tests passed; typecheck clean.
- `pnpm -F web build` and `pnpm -F extension build`: both OK.
- `TRIPWIRE_E2E_PORT=3217 pnpm verify:e2e`: 5 passed. Port 3000 was busy, so I did not run plain `pnpm verify:e2e`.

## Known gaps and concerns
- **Port 3000:** a `next` server I didn't start is listening there in live mode (keySource nansen-cli, replay off). `pnpm -F web build` rewrote `apps/web/.next`, which that server may be serving from, so it probably needs a restart. I never sent it any requests.
- **DESIGN.md:** still the old Hazard world; the documenter still has to write the new one.
- **X loading:** the card opens only after its data arrives. While it loads, the chip shows `aria-expanded="true"` but nothing else, which is the same as before. A loading card would feel faster.
- **Gauges:** there are 5 rows (Top PnL included, because the data has 5 wallet types), where the contract said 4.
- **Stacking:** the venue evidence card stacks above the block screen (z 2147483001). Side placement keeps it off the block on wide viewports. Under 720px it is a bottom sheet over the lower page, and Escape or an outside click closes it. The blocker is a listener on the button, so the trade stays blocked either way.
- **Narrow dock:** under 720px the open sheet covers the dock chip, which sits bottom-right. The card's close button and Escape still close it.
- **Coverage not exercised:** no tier-2 venue page was run (the dock was captured through the tier-1 fallback), no light-mode X host was captured, and web pages other than `/rules` weren't captured at 390px.
- **Design rule:** the design rules name Motion as the default animation library. I used CSS keyframes instead, to keep content-script bundles small and because the contract motions are simple one-shots.
- **Emoji in data:** some Nansen wallet labels contain emoji. That is data, rendered as text.

## Fix round 1 (finish review: fix)
Commits `67b4a00`, `939c8ac`, `6acb42a` (range `e270ff6..6acb42a`). Kept, unchanged: the body-level 440px card on #111a2e, the lit red annunciator plate, and the Barlow Condensed and JetBrains Mono voice.

1. **Gauges.**
   - Rows share a symmetric-log scale (`lib/ui/scales.ts`) with decade ticks, so a $401 seller fills about 45% of its half-track next to a $576K buyer.
   - A new "Exit pressure" row, the value the rule measured, leads the group.
   - Rows that fed a fired rule light in that rule's lamp (red for block, amber for warn): square mark, label, fill and value, and screen readers hear "(rule fired)".
   - A fired rule's threshold is an amber tick. Only fired rules carry a threshold in the response, so rules that didn't fire get no tick.
   - The 24h netflow readout lights for its own rule. Non-lit selling fills are secondary, so red now means "rule tripped" only.
   - Ceiling devices: plates got raised depth (lit top edge, hard drop), the header sits on #1B2740, and the sheen is visible. The unlit annunciator strip was declined: it repeated the lit plate and pushed the Flow tab below the fold.
2. **Price trace.** Drawn in #8FA3BF. The post marker sits on the nearest candle index, with its label under it. The marker had been correct all along: the fixture candles end exactly at the old stub post time. The X stub post moved to 2026-09-16T14:00Z so the marker now lands mid-window.
3. **Block screen.**
   - `computeBlockRect` widens the block to min(440px, viewport − 32px): centred, never narrower than the button, never uncovering it, and still growing upward only. It has new tests.
   - The dead band is gone: it came from a measure taken with the fallback font, and the block now re-measures on ResizeObserver and `document.fonts.ready`.
   - The override prompt is one line above the input.
4. **Fold.** Tighter header, finding, tabs and rows, with a 48px trace. The Flow tab ends above the footer at 1280×860 and in the 390px sheet. A scroll-edge shadow on the footer shows while content continues below.
5. **Age.** Venue cards show "checked now / 20s ago", refreshed every 15s. X keeps the post age.
6. **Ledger.** All readouts use one mono size (1.375rem); the hero readout is removed.
7. **Status page.** Credits today and calls total each get a tick-scale meter (quarter ticks, mono scale figures, lit zero needle, `role="progressbar"`).
8. **Captures.**
   - `x-chip.png` was recaptured.
   - Added `chip-caution.png`, `chip-clear.png`, `chip-unchecked.png`, `card-caution.png`, plus a cropped TRIPWIRE `x-chip-article.png`.
   - CAUTION: every rule set to warn. CLEAR: rules enabled with thresholds they can't reach (with all rules disabled the verdict is correctly UNCHECKED). UNCHECKED: extension pointed at a dead port.
- **Faces.** Web target cells set addresses in mono and words in Barlow. "rule:" clauses set the word in Barlow and the comparison in mono, at one size.

**Found during recapture:** `:host button { color: inherit }` (specificity 0,1,1) outranked `.tw-chip`. Clear and Unchecked chip and dock headlines rendered near-black (sampled at rgb(14,14,9)), and tabs lost the condensed face. The reset is now element-level; re-sampled at rgb(143,163,191).

**Verification:**
- `pnpm verify`: typecheck clean; core 71, web 85 and extension 271 tests passed.
- Web and extension builds: OK.
- `TRIPWIRE_E2E_PORT=3217 pnpm verify:e2e`: 5 passed (port 3000 still busy).
- Detector: 24 findings, all advisory (22 font-size, 2 color), all against the old DESIGN.md.

**Recaptured and validated:** every file listed above plus the new chip and card captures, opened after the final build.

**Remaining concerns:**
- A 16px strip of the stub's host-card padding still shows below the block, because the block never covers page area below the button. The sides are covered.
- At 1280px the wider block leaves no room for a side card, so block evidence falls back to above the block (about 260px tall, with the scroll edge). At 1440px and wider it opens beside the block.
- `history-desktop.png` now shows a "Protection lowered" row, created by the capture's own rule switches (temp DB).

## Nansen re-theme
Commits `20c5927..` on `feat/cockpit-ui` (on top of `6acb42a`). Contract: the rewritten `apps/extension/.impeccable/surfaces/apps-extension-lib-ui.md`. Glass Cockpit visuals, Barlow and Barlow Condensed are gone. Structure and behaviour are unchanged: the floating popovers, tabs, block composition, dock and sheet, anchor binding, blocker, override flow, replay badge and UNCHECKED handling. DESIGN.md is untouched and left for the documenter.

### Per surface
- **Tokens (extension theme, popup, web):**
  - Colours: ground #06080B, panel #0B1016, raised #111821, hairlines at 8% and 16% white, text white with 60% secondary.
  - Signal colours: mint #00FFA7, red #FF5A6E, amber #F5B83D, and ink #03140D on fills.
  - Radii are 16px for pills, 12px for cards and 8px for tiles.
  - Inter 400/500/600 (tnum) for UI and figures, Sora 600/700 for headings and verdict words. JetBrains Mono 400 is used only for addresses, the backend URL and code.
  - The only gradient is the dark-teal glow at the top of the popover card. There is no glass, and no side stripes.
- **Verdict pill (`Plate`):**
  - Each verdict has a Lucide shape icon: TRIPWIRE OctagonX (red fill, ink text), CAUTION TriangleAlert (amber fill), CLEAR ShieldCheck (mint tint), UNCHECKED CircleDashed (dashed neutral).
  - Loading uses a spinner and never shows a verdict word.
- **X chip:** a pill with the Solana logo, the verdict pill, the finding and the Replay tag.
  - Root cause of the unreadable text: nothing text-bearing inherits colour from `:host` any more, because every text element sets its own `color`.
  - `test/chip-contrast.test.tsx` renders the chip for all 5 verdicts, the pill words, and the strip, dock, block and lit rows. It uses the real Chromium cascade (WXT's `:host{all:initial}` plus theme.css) on dark and light host pages and requires 4.5:1 or better.
  - I checked that it fails when the old `:host button` reset comes back: the text rendered rgb(0,0,0) at 1.1:1.
- **Evidence card:**
  - Header: token logo (Nansen `logo` URL, otherwise a monogram), Sora title, chain logo and age, verdict pill, Replay tag, and a Lucide close button.
  - The finding's figure counts in once; the DOM always holds the final text, and reduced motion skips the count.
  - Flow tab: rows are icon, label, a 4px red/mint split bar with log ticks and the amber threshold tick, and the signed value in red or mint. Lit rows get a tint, the rule's icon and the rule's colour.
  - Tabs: mint text and underline. Readouts are 8px tiles.
  - Wallets tab: `cleanLabel` text with a kind icon and a relative bar.
  - Footer: "Powered by [Nansen mark] Nansen" plus the endpoint count.
  - Motion: the card rises 8px over 180ms.
- **Block screen:**
  - A red-bordered card. The header shows OctagonX, TRIPWIRE, "Trade blocked by your rules", Replay and the venue logo.
  - Hits use icons. The evidence pill has Users and ArrowRight icons, and the mint "Not trading is the safe move." line has ShieldCheck.
  - The Override pill is dashed and shows Lock while disabled.
- **Strip and dock:** the venue logo comes first, then the verdict pill. Details is a mint link with ChevronRight.
- **Popup:**
  - Sora wordmark, a status line with an icon, a mint segmented pill, and link pills with icons.
  - New "Works on" list: 18 venue logos grouped into "Blocks trades" and "Evidence dock".
  - "Powered by Nansen" footer.
- **Web pages:**
  - Pill nav with icons and a mint current page.
  - Verdict pills with icons, venue logo and name columns, and targets shown as "EKpQ…zcjm on [Solana logo] Solana".
  - Mint 4px meters, a mint pill for the Save button, the amber confirm row with an icon, and the preset change shown as an arrow icon.
  - "Powered by Nansen" footer and a new favicon.
- **Core:**
  - `cleanLabel(label)` returns `{text, kind}`. Kinds map to icons: smart-trader Brain, fund Landmark, whale Fish, public-figure Megaphone, exchange Building2, bot Bot, other Wallet.
  - A brand logo registry: `VENUE_LOGOS`, `CHAIN_LOGOS`, `NANSEN_LOGO`.
- **Backend:**
  - `tgm/token-information` (24h TTL, panel mode only) now passes `logoUrl` (https only) into the spot panel.
  - Its failure is cosmetic and does not add an error line.
  - No fixture was recorded: no replay data contains a logo, so replay shows the monogram.
- **Runtime origins:**
  - Fonts and logos are `chrome-extension://` web-accessible resources, limited to the content-script matches.
  - The e2e X test asserts that every font and image request is `chrome-extension://`.
  - The token `<img>` is the only remote image. It appears only in the card, with `referrerpolicy=no-referrer` and a monogram fallback.

### Logos
- **Obtained:** all 27, plus Nansen.
  - SVG from owner sites or brand kits: Nansen, Jupiter, Polymarket (mono), Uniswap, Jumper, Aerodrome, 1inch, Matcha, CoW Swap (mono), Base, Arbitrum and Avalanche.
  - SVG from simple-icons 16.31.0: Solana, Ethereum, BNB Chain, Polygon and Optimism.
  - Owner-published PNG or ICO only, re-encoded to 96px PNG: Hyperliquid, pump.fun, Raydium, PancakeSwap, Axiom, Photon, GMGN, BullX, DEX Screener and Birdeye.
- Provenance and processing are in `apps/extension/public/logos/SOURCES.md`.
- `apps/web/public/logos` is a byte-identical copy, enforced by a test.
- **Missing:** none.

### Captures (`.impeccable/review/`, 2 rounds)
- All 18 requested captures were retaken against the replay backend on :3217 with a temp DB, and each was opened and checked.
- **Round 1 fixes:**
  - Web target labels lost the spaces around "on" inside inline-flex.
  - The mobile nav lost its gutter because a padding shorthand overrode the container.
  - Gauge ticks were too tall.
- **Round 2:** clean.
- The dock focus ring on the heading in `dock-mobile.png` is the expected keyboard focus-visible state.

### Detector
32 findings, all advisory: 18 design-system-radius, 12 design-system-font-size, 2 design-system-color. They are drift measured against the old Hazard DESIGN.md. The 2px, 4px, 13px and 20px radii are intentional (bar caps, logo corners, and the segment nested in its track).

### Verification
- `pnpm verify`: typecheck clean; core 81, web 91 and extension 288 tests passed.
- `pnpm -F web build` and `pnpm -F extension build`: OK.
- `TRIPWIRE_E2E_PORT=3217` e2e: 5 passed.

### Concerns
- Ten brand marks are raster, because the owners publish no SVG.
- The Polymarket and CoW marks are recoloured white.
- The token logo is never exercised in replay, since no fixture has a logo.
- The contract says "verdict pill counts in its value". The pill has no value, so the finding's figure counts in instead.
- The text colour is #FFFFFF, following the contract, even though the global rules flag pure white.
- Port 3000 still runs someone else's server, and `pnpm -F web build` rewrote `.next` again.
- The author badges from the contract STORY were not part of this build.

## Author badges
Commits `0f74b2a..` on `feat/cockpit-ui` (on top of `add33a2`). Brief: `.superpowers/briefs/author-badges.md`; background: `docs/SPIKE-badges.md`. Nothing in the security/origin logic, the signal/rule logic or the blocker changed; the only touch to shared HTTP code is adding `DELETE` to the CORS `Access-Control-Allow-Methods` for origins that were already allowed.

### Routes
- **`POST /api/author-badges`** (`apps/web/app/api/author-badges/route.ts`, builder in `lib/intel/badges.ts`) returns `{handle, nansen?, hyperliquid?, polymarket?, errors[]}`. Zod `AuthorBadgesRequestSchema` (X handle rule plus display name), behind the existing `route()` Host/Origin guard. Every venue is settled on its own: a failed call becomes `null` plus an error line on that badge, never a 5xx, and never blocks the other venues.
- **`GET/PUT/DELETE /api/links`** (`apps/web/app/api/links/route.ts`, store in `lib/links.ts`, table `wallet_links(handle, venue, address, source, created_at)` in `lib/db.ts`). `WalletLinkSchema` normalizes the handle to lowercase and requires 0x + 40 hex per venue; `WalletLinkDeleteSchema` for the delete. A user link overrides a curated entry for the same handle and venue.

### Data sources and credits per badge (per handle, per cache window)
| Badge | Calls | Credits | TTL |
|---|---|---|---|
| Nansen (no entity match) | `search/general` | 0 | 24 h |
| Nansen (matched) | `search/general` + `profiler/address/current-balance` + `profiler/address/pnl-summary` (90 d) | 2 | 30 min |
| Hyperliquid (linked) | `api.hyperliquid.xyz/info` `clearinghouseState` + `userFills` (free, public, backend only) + Nansen `profiler/perp-pnl-summary` (30 d) | 1 | 60 s (HL), 10 min (Nansen) |
| Polymarket (linked) | `prediction-market/address-summary` + `pnl-by-address` + `trades-by-address` | 3 | 10 min |

`profiler/perp-pnl-summary` is not in the published credits table; the recording run measured it at **1 credit** (`x-nansen-credits-used: 1`), which is why it is in. The extension never calls Nansen or Hyperliquid: everything goes through the background bridge to the local backend.

### Curated list
`packages/core/src/curated-wallets.ts` ships **empty**. The rule was "only entries whose sourceUrl I fetched and saw the address stated by that account or its official profile". No candidate met it: X status pages are not readable without a login, Polymarket profiles expose no X field and Hyperliquid has no profile concept at all (both confirmed in `docs/SPIKE-badges.md`), and every "known whale wallet" that surfaced was a third-party attribution (news, analytics threads, trackers), which the rule excludes. `validateCuratedWallets()` plus a core test enforce the shape (lowercase handle, lowercase 0x address, https sourceUrl, ISO date, no duplicates) for whenever a verified entry is added.

### Fixtures recorded (`scripts/record-badge-fixtures.mjs`, one live call each)
- `fixtures/nansen/entityPnlSummary.json` (entity "Vitalik Buterin", 90 d) - 1 credit
- `fixtures/nansen/pmAddressSummary.json`, `pmTradesByAddress.json` (address `0x1963...9bfd`, the trader already in `pmPnlByAddress.json`, which was not re-recorded) - 2 credits
- `fixtures/nansen/perpPnlSummary.json` plus `fixtures/hyperliquid/clearinghouseState.json`, `userFills.json` (address `0x7fda...17d1`, a Nansen-labeled fund from `perpPositions.json`) - 1 credit and 0
- **Total spent: 4 Nansen credits** (the script's own cap is 10). The script reads the key the way `lib/nansen/key.ts` does and never prints it. `docs/SPIKE-badges.md` names no sample addresses, so both addresses come from already-recorded public Nansen data.

### UI
- **Badge row** (`lib/ui/BadgeRow.tsx`, anchor in `lib/x/badge-anchor.ts`): 18px logo badges, 4px gap, mounted as a sibling right after the outer tweet's display-name link inside `[data-testid="User-Name"]` - never inside a quoted tweet's header, never when the handle has no name link. The host is `inline-flex; vertical-align: text-bottom`, so X's username row keeps its layout and the post keeps its height (asserted in e2e). The hit target is 24px via a pseudo-element while the mark stays 18px.
- **Badge card** (`lib/ui/BadgeCard.tsx`): the same body-level 440px popover, with a tab per badge (Nansen, Hyperliquid, Polymarket, each with its bundled mark; `TabDef` gained an optional `icon`). Nansen tab: label line, tags as Lucide icon plus text, Holdings / Realized PnL 90d / Win rate tiles, top 3 holdings with monogram and chain logo. Hyperliquid: account value, margin used, Nansen 30 d realized PnL and win rate, open positions (side pill, exact entry/mark/liquidation prices, signed uPnL) and the last 10 fills with the realized sum over the returned window. Polymarket: total/realized/unrealized PnL, win rate, markets won of traded, open positions by unrealized value, last 5 trades. Each tab names its sources; the footer carries "Powered by Nansen" and "Links stay on this machine".
- **Link wallet** (`lib/ui/LinkWallet.tsx`): a Lucide `Link2` action opens an inline form - venue pills with the bundled Hyperliquid/Polymarket marks, an address field, Save/Cancel, and a named error ("That isn't an address: 0x and 40 hex characters."). It sits in the badge card and in the post card's author section (`Panel` gained an optional `author` slot), where a missing label also reads "No Nansen label for @handle." and an unlinked author reads "Link a Hyperliquid or Polymarket wallet to see positions.". A linked venue shows "Linked by you" plus Unlink; a curated one shows "Source" with an external-link icon.
- Lucide icons only, bundled logos only, no emoji (the `nansen-ui` glyph test covers the new files - it caught a multiplication sign in the leverage pill, now `25x`), smallest text 0.75rem/12px, figures in tabular numerals, signed colours mint/red.
- **Fetching**: one `POST /api/author-badges` per handle per page session through the existing result cache (failures evicted) and a 4-concurrency queue; `drop(key)` was added to that cache so saving or removing a link refreshes every badge row for that author on the page, plus the open card.

### Captures (`.impeccable/review/`, replay backend on :3217, temp DB, built extension in Playwright Chromium)
`x-badges.png`, `x-badge-card-hyperliquid.png`, `x-badge-card-polymarket.png`, `x-link-wallet.png` - each opened and checked. Round 1 found three defects, all fixed and recaptured: prices were abbreviated like totals ("$2.3K" for an entry price, now exact "$2,299.4"), the Polymarket position value never got its white right-aligned rule (`:first-of-type` matched nothing, now its own class), and the four-across figure tiles wrapped "Account value" onto two lines (now 2x2).

### Detector
`impeccable detect apps/extension apps/web`: **0 anti-patterns**, 55 advisory notes (radius/font-size/colour drift measured against the old Hazard `DESIGN.md`, plus the e2e and venue HTML stubs, which deliberately imitate X and the venues rather than Tripwire's palette). None are in the new components' own values.

### Verification
- `pnpm verify`: typecheck clean; core 90, web 105 and extension 306 tests passed.
- `pnpm -F web build` and `pnpm -F extension build`: OK.
- `TRIPWIRE_E2E_PORT=3217` e2e: 6 passed, including the new "author badges appear next to the username and open the badge card".

### ADR-0009 (text for `docs/DECISIONS.md`, not written there)
**ADR-0009: Author badges are earned by an exact Nansen entity match or an explicit wallet link, never inferred.**

*Context.* `docs/SPIKE-badges.md` (19 credits) confirmed that neither Polymarket nor Hyperliquid exposes a verified X link, that Nansen has no entity-name to address resolver, and that fuzzy name search returns impersonators alongside owners. ADR-0005 already rejected name-similarity matching for person intel.

*Decision.* The Nansen badge appears only when the post author's display name (emoji stripped) or handle normalizes to exactly a Nansen entity name; it shows that entity's holdings, tags and PnL, never a wallet address. Hyperliquid and Polymarket badges appear only for (a) a wallet the user linked to that handle in `wallet_links`, stored locally and deletable, or (b) an entry in `packages/core/src/curated-wallets.ts`, which requires a fetched `sourceUrl` showing the account itself stating the address. That list ships empty rather than populated from third-party attributions. Hyperliquid's public `info` API is called from the backend only and cached 60s; Nansen adds one credit for the perp PnL summary. `GET/PUT/DELETE /api/links` keeps links local, behind the same origin guard as every other route.

*Consequences.* Most accounts get no venue badge, which is the intended failure mode: showing another person's positions under a wrong name is the one error this feature must never make. The cost is that the feature's reach depends on users linking wallets, and that the curated list can only grow when a source that meets the rule is found.

### Concerns
- Polymarket open positions carry no share size, average price or current price: `prediction-market/pnl-by-address` doesn't return them, and the alternatives are 5 credits per market (`position-detail`) or a second public API not in the brief. The card shows question, side, position value and PnL instead.
- The Nansen badge costs 2 credits per matched author per 30 minutes, and it fires on every timeline post by a labeled account. `search/general` is free, so unlabeled authors cost nothing, but a timeline full of labeled people is the one place this feature can spend.
- Replay always answers the same fixture per endpoint name, so in replay every linked wallet shows the recorded fund's positions; live use is per address.
- The curated list is empty, so the "Source" link path is exercised only by unit tests, not by the captures.
- The Hyperliquid `userFills` fixture was trimmed to the newest 50 rows to keep it small, so `fillsWindow.count` reads 50 in replay.

## Evidence card v2 + recalibration
Commits `2146c05..` on `feat/cockpit-ui` (on top of `adc4e10`). Brief: `.superpowers/briefs/evidence-card-v2.md`; the signal work is `docs/CALIBRATION.md` implemented as written. Unchanged: the origin/Host guard, blocker semantics, popover and badge behaviour, anchor binding, override flow, replay tag, and UNCHECKED-never-CLEAR. `DESIGN.md` and `docs/DECISIONS.md` are untouched.

### What changed, by surface

**Signals (`packages/core/src/signals/spot.ts`).** All four spot rule signals are now shares of the token's own 24h volume, so the same rule reads the same on a $4.8B cap and on a day-old launch.

| Removed | Why | Replaced by |
|---|---|---|
| `exit_pressure` (USD) | −$100k is 0.28% of PUMP's day and 100% of a new launch's: the threshold scaled with market cap, not risk | `labeled_exit_pct` |
| `fresh_buy_share` | ~100% by construction whenever every labeled segment is negative — the normal state of a token being rotated out of. It fired on 29 of 37 sample tokens, including AAVE, where no labeled wallet traded at all | `distribution_pct` (fresh wallets now only *qualify* a labeled exit) |
| `sm_netflow_24h` (USD) | any negative number blocked on Paranoid, down to −$174 | `sm_netflow_pct` |
| — | the 1d flow window says nothing about a token that already fell 75% | `drawdown_pct` (new) |

Formulas as shipped, with `labeled = smart_trader + whale + public_figure` net USD, `labeledGross = sum of (avg_flow_usd x wallet_count)` over the same three, and `vol24` from `tgm/token-information` -> `spot_metrics.volume_total_usd`:

```
minActivity        = vol24 >= 250_000 && labeledGross >= 0.005 * vol24
labeled_exit_pct   = minActivity && labeledWallets >= 3 ? 100 * labeled / vol24 : 0
freshAbsorbing     = fresh > 0 && fresh >= 0.005 * vol24
absorption         = labeled < 0 && freshAbsorbing ? fresh / -labeled : null
distribution_pct   = minActivity && labeledWallets >= 5 && labeled_exit_pct < 0
                     && absorption !== null && absorption >= 1 ? labeled_exit_pct : 0
sm_netflow_pct     = minActivity && smTraderCount >= 3 ? 100 * smNetflow24h / vol24 : 0
drawdown_pct       = priceChange7dPct ?? priceChange24hPct
```

Preset thresholds as shipped:

| Rule id | Signal | Op | Degen | Balanced | Paranoid | Action |
|---|---|---|---|---|---|---|
| `spot-distribution` | `distribution_pct` | `<` | −6 | −2 | −0.75 | block |
| `spot-exit-deep` | `labeled_exit_pct` | `<` | −10 | −5 | −2.5 | block |
| `spot-exit` | `labeled_exit_pct` | `<` | −4 | −1 | −0.5 | warn |
| `spot-sm24` | `sm_netflow_pct` | `<` | −4 | −1.5 | −0.75 | warn |
| `spot-drawdown` | `drawdown_pct` | `<=` | −80 (warn) | −50 (warn) | −30 (block) | per preset |

**`risk_high_count`: dropped from all three presets, `TOKEN_RISKS` left as it was.** The calibration measured it on five tokens and scored 0 on every one: the only `high` indicators Nansen returned were `cex-flows` and `btc-reflexivity`, both outside the set. Widening to `cex-flows` was the alternative and was rejected — it is a flow story `labeled_exit_pct` already tells better, it was never calibrated, and on the replay fixture alone it would have made Paranoid block WIF, which is exactly the over-blocking this work exists to remove. The signal is still emitted and still available in the rules editor for a custom rule.

**Guards yield 0, not null.** A failed guard means "not enough labeled trading to judge", which is an answer, so a quiet token is CLEAR instead of UNCHECKED. `null` is reserved for a call that actually failed, and the label then names the endpoint and the chain ("Nansen flow data unavailable for this token on base"); a token Nansen does not index at all reads "Nansen has no coverage for this token on base". A resolvable target can no longer come back as a bare "no data".

**Verdicts, the calibration doc's sample (section 5).** 18 of the 37 tokens are table-driven tests in `packages/core/test/signals.test.ts`, built from the doc's own derived percentages, asserting all three presets. Every proposed verdict reproduced exactly.

| Token | Tier | Balanced before | Balanced after | Paranoid before | Paranoid after |
|---|---|---|---|---|---|
| WIF | large | CAUTION | **CLEAR** | TRIPWIRE | **CAUTION** |
| HYPE | large | TRIPWIRE | **CLEAR** | TRIPWIRE | **CAUTION** |
| ZEC | large | CAUTION | **CLEAR** | TRIPWIRE | **CLEAR** |
| PUMP | large | TRIPWIRE | **CLEAR** | TRIPWIRE | **CAUTION** |
| UNI | large | TRIPWIRE | **CAUTION** | TRIPWIRE | CAUTION |
| AAVE | large | CAUTION | **CLEAR** | TRIPWIRE | **CLEAR** |
| LINK | large | CLEAR | CLEAR | TRIPWIRE | **CLEAR** |
| FARTCOIN | large | TRIPWIRE | TRIPWIRE | TRIPWIRE | TRIPWIRE |
| USELESS | mid | TRIPWIRE | **CLEAR** | TRIPWIRE | **CAUTION** |
| STONK | mid | CAUTION | **CLEAR** | TRIPWIRE | **CLEAR** |
| BRETT | mid | UNCHECKED | **CLEAR** | UNCHECKED | **CLEAR** |
| PAID | fresh | CAUTION | **CLEAR** | TRIPWIRE | **CLEAR** |
| HYPED | dumped | CLEAR | **CAUTION** | TRIPWIRE | TRIPWIRE |
| LOCKINU | dumped | CLEAR | **CAUTION** | TRIPWIRE | TRIPWIRE |
| LOOM | dumped | CLEAR | **CAUTION** | TRIPWIRE | TRIPWIRE |
| LAPTOP | dumped | CAUTION | CAUTION | TRIPWIRE | TRIPWIRE |
| OTC | dumped | CAUTION | CAUTION | TRIPWIRE | TRIPWIRE |
| SPIRAL | dumped | UNCHECKED | **CAUTION** | TRIPWIRE | TRIPWIRE |

Across the doc's full 37: Balanced goes 6/24/5/2 (CLEAR/CAUTION/TRIPWIRE/UNCHECKED) to 28/8/1/0, Paranoid 1/0/35/1 to 23/6/8/0. The three tokens in the report — HYPE, ZEC, WIF — are CLEAR on Balanced and none of them blocks on Paranoid. FARTCOIN, the one real distribution event in the sample, still blocks on every preset, now for a stated reason.

**Migration.** Saved custom rules naming a removed signal are dropped on load and logged once, rather than reinterpreted: a USD or percent-of-buying threshold has no honest conversion into a percent of volume, and a rule that silently means something else is worse than a rule that is gone. A set that loses every rule falls back to Balanced instead of evaluating to UNCHECKED on everything.

**Backend (`apps/web/lib/intel/spot.ts`).**
- `tgm/token-information` now runs in chip *and* panel mode (24h TTL, **1 credit per token per day**, measured): name, symbol, logo URL, market cap, 24h volume, liquidity. Its volume is a verdict input now, so its failure is a real evidence gap rather than a cosmetic one.
- A new 8-day daily `tgm/token-ohlcv` series (1h TTL) backs `drawdown_pct` in both modes. It is a separate cache key from the chart's window.
- `timeframe` on `/api/post-intel` and `/api/guard` (zod, `5m|1h|6h|1d|7d`, optional). It moves the flow gauges and the chart only; the signals are always built on the verdict window. `intel.test.ts` asserts, per window, that every signal value is identical to the 1d run.
- Chart candles per window: 5m/1h -> 1m, 6h -> 5m, 1d -> 15m, 7d -> 1h, each with its own cache TTL.

**Card (`apps/extension/lib/ui`).**
- Header: monogram, **$SYMBOL** in Sora, the token's full name beside it, chain mark, and the contract demoted to a short mono line with a copy button. Only the address shrinks on a tight header, so the age never rides over it.
- "View on Nansen" pill in the footer (`app.nansen.ai/token-god-mode?chain=...&tokenAddress=...`, new tab, `noopener noreferrer`). Perps and prediction markets get no link: Nansen publishes no documented deep-link pattern for either surface, and a URL that 404s is worse than no button.
- A `5m / 1h / 6h / 1d / 7d` segmented control (radiogroup, arrow keys, Home/End, 24px targets) drives the gauges and the chart. The Smart Money netflow tiles are buttons onto the same control; 30d maps to 7d and says why. The card keeps its verdict across a window change and states "Verdict uses 1d, viewing 7d"; only the affected sections show a skeleton, and a slow earlier window can never overwrite the one the user landed on.
- Price chart: lightweight-charts v5 area series inside the shadow root — crosshair readout (price, change from the window's start, UTC time, clamped inside the chart), the post as a series marker, mint or red by direction, `autoSize`, disposed on unmount, and a text summary for screen readers.
- Gauges read in percent of volume: the lead row is the labeled wallets the rule measures, with the absorption ratio as evidence copy ("Fresh wallets bought 61.4x what labeled wallets sold"). The rule's threshold tick only appears while the verdict window is on screen, since the threshold is a percentage of a different window's volume otherwise.

**Chart library size.** lightweight-charts 5.2.1 adds **174.6 KB raw / ~52 KB gzipped** per content script (x.js 381.6 -> 556.2 KB, venues.js 387.8 -> 562.4 KB; measured by building once with the chart stubbed out). The package's whole production ESM is 184.8 KB raw / 59.2 KB gzipped, so tree-shaking removes little. The brief's "around 50KB" holds for the gzipped figure, which is the number chart libraries are normally quoted at; the raw figure is the one that matters for a locally installed extension, and it is large. Lazy-loading it on first card open is the obvious follow-up.

### Three defects found during the round (jumper.xyz, WBTC)
0. **The strip sat beside the trade button, not above it.** jumper.xyz puts its primary action in a horizontal row next to a wallet button, so inserting the strip before the button made it another item in that row: ~110px wide, the CLEAR pill clipped mid-word, the finding broken over four lines. `liftOutOfRow()` walks up out of any container that lays its children out in a row (flex not in column direction, or a multi-column grid), capped at three levels, and the strip is mounted before that whole row. A venue whose button already sits in a stacking container is unaffected. The e2e stub now reproduces the real shape and asserts the strip is the row's previous sibling, outside it, and above the button.
1. **Overflow.** The strip rendered wider than the venue's card, clipped its own text, and dragged the venue's own button wider with it. An inline mount is a sibling of the venue's element, so in a shrink-to-fit container it took its max-content width; the container grew, the anchor stretched to match, and measuring the anchor back returned the width we had caused. `lib/ui/fit.ts` measures the narrowest content box from the anchor up to the document — immune to any container we inflated — and watches that whole chain. The width travels as a **custom property**, because WXT resets every shadow host with `:host { all: initial !important }`, which beats an ordinary inline style and anything `theme.css` can say about `:host`; `all` is the one thing that does not touch custom properties. Capping the surfaces also caps the host's intrinsic width, which is what leaves the venue's button alone. Strip, chip, dock and badge row truncate with a `title` carrying the full sentence, and the strip stacks under 320px.
2. **"no data".** Covered above: the signals now separate an endpoint that failed from one that answered with nothing.

### Credits
**1 Nansen credit**, for `fixtures/nansen/tokenInformation.json` (WIF), recorded through `scripts/record-token-info-fixture.mjs`, which caps itself at 2 and never prints the key. Every test and e2e run is replay. Per-token running cost rises: chip mode now makes 5 calls where it made 3 (token-information at 1/day/token, the drawdown series at 1/hour/token).

### Verification
- `pnpm verify`: typecheck clean; core 140, web 116, extension 346 tests passed for this work. (A later run reads core 180 / web 120: a concurrent session began adding wallet-profiler and token-logo work to the same tree, and those are its tests, not this build's.)
- `pnpm -F web build` and `pnpm -F extension build`: OK.
- `TRIPWIRE_E2E_PORT=3217` e2e: 8 passed, including the chart hover, the window control, and the jumper test (strip above the action row, then fitted at 640/280/416px). Port 3000 was busy again, so plain `pnpm verify:e2e` was not run.
- Detector: 34 findings, all advisory (19 radius, 12 font-size, 3 colour), **none in any file this build added or rewrote**. All are drift against the old Hazard `DESIGN.md`.

### Captures (`.impeccable/review/`, replay backend on :3217, built extension in Playwright Chromium)
Produced by `apps/extension/e2e/captures.spec.ts`, which is skipped unless `TRIPWIRE_CAPTURE=1`. Each was opened and checked.
- `x-popover.png` — the card with the token's identity in the header, the window control, the percent-of-volume gauges and the absorption line.
- `x-popover-chart-hover.png` — the crosshair readout on the price chart, with the post marker.
- `x-popover-7d.png` — the 7-day window, "Verdict uses 1d, viewing 7d", verdict unchanged.
- `block-evidence.png` — the block screen with its evidence card beside it.
- `strip-narrow.png` — the strip spanning the action row above the trade button, inside a 280px venue card.

Four rounds. Round 4 followed a user screenshot of the live jumper.xyz widget, which showed the strip squeezed beside the button; the stub was corrected to the real horizontal row and recaptured. Round 1 found the chart tooltip overflowing the card, "0.50%" instead of "0.5%", the identity line wrapping across two lines, and Details sitting above the finding in the narrow strip. Round 2 found the tooltip's time at 3.8:1 contrast (now 7.0:1) and the age still overlapping the truncated address. Round 3 captured clean.

### ADR-0010 (text for `docs/DECISIONS.md`, not written there)
**ADR-0010: Spot rule signals are shares of the token's own 24h volume, and a quiet token is CLEAR.**

*Context.* Users reported that "literally everything — HYPE, ZEC, WIF — is marking as exit liquidity". `docs/CALIBRATION.md` (120 credits, 37 tokens) reproduced it: Paranoid blocked 35 of 37 including LINK, AAVE, PEPE, JUP and TRUMP, and Balanced left 6 CLEAR. Three causes were structural rather than a matter of tuning. `fresh_buy_share` is ~100% by construction whenever every labeled segment is net negative, which is the normal state of a token being rotated out of, so it fired on 29 of 37. Absolute USD thresholds scale with market cap, not with risk: −$100k is 0.28% of PUMP's day and more than a new launch's entire volume. And a 1d flow window says nothing about a token that already fell 75%.

*Decision.* The four spot rule signals become volume-normalized: `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct` and a new `drawdown_pct`. `fresh_buy_share` is deleted as a rule and survives only as the absorption ratio in the evidence copy, where it qualifies a labeled exit instead of being one. Activity guards (24h volume >= $250k, labeled turnover >= 0.5% of it, >=3 wallets to warn and >=5 to block, >=3 Smart Money traders) yield a real 0 — and therefore CLEAR — because "labeled wallets barely traded" is an answer. `null`, and therefore UNCHECKED, is reserved for a call that actually failed, and the signal's label then names the endpoint and the chain. `risk_high_count` is dropped from all three presets rather than widened, because with `TOKEN_RISKS` as defined it scored 0 on every token measured. Saved custom rules naming a removed signal are dropped on load and logged once, because their thresholds have no honest conversion.

*Consequences.* 30 of 37 sample tokens change verdict on Balanced and 28 on Paranoid, almost all toward CLEAR; Paranoid goes from blocking 35 to blocking 8. The product now warns rarely enough that a warning means something, which is the whole point, but it also blocks less — PUMP, HYPE and USELESS go from TRIPWIRE to CLEAR on Balanced on ~0.5–0.6% of a day's volume, and if any of those should have stayed blocked the Balanced threshold is wrong rather than the normalization. Tokens that already collapsed are newly caught by the drawdown rule. The guards are a deliberate exception to "missing data is never CLEAR", narrowed to the case where the data arrived and said "nothing happened". The cost is one extra Nansen call per token per day for the volume denominator, which makes `tgm/token-information` load-bearing: if it fails, the spot verdict is UNCHECKED rather than merely logo-less. The whole set is calibrated against a single day's snapshot and should be re-run on a second day.

### Concerns
- **One day's calibration.** The doc says it, and it is still true: the thresholds come from one snapshot on 2026-09-17. A second sample day before this is trusted in anger would be cheap insurance.
- **`tgm/token-information` is now load-bearing.** A failure that used to cost a logo now costs the whole spot verdict (UNCHECKED, with a named reason). That is the honest behaviour — without the denominator nothing can be sized — but it is a new single point of failure.
- **Chip cost.** Chip mode went from 3 Nansen calls to 5. The two additions are cheaply cached (24h and 1h), but a timeline full of distinct tokens costs more than it did.
- **Chart weight.** ~175 KB raw per content script, loaded whether or not a card is ever opened.
- **The token logo is not rendered.** Nansen's `logo` is a third-party CDN URL, and requesting it would tell that host which token the user is looking at on every card. The card shows a monogram and the payload still carries the URL. Serving those bytes from the local backend, which already fetched them, would restore the picture without the leak; that is the follow-up.
- **Replay flattens the timeframe control.** Replay answers one fixture per endpoint name, so every window shows the same flow numbers. The control, the chart window and the gauge labels all change; only the figures cannot.
- **`spot-risk` is absent from the presets**, so `risk_high_count` ships as a signal no default rule reads.
- Port 3000 still runs a server this session did not start; `pnpm -F web build` rewrote `apps/web/.next` again, so that server probably needs a restart. No request was sent to it.

## Expand, instant loading, and perp depth — takeover closure

Audited and closed on 2026-09-19 from `feat/cockpit-ui` at `832835d`, after the implementation commits `91f5592`, `4bf5e30`, and `832835d`. Brief: `docs/briefs/expand-and-perp-depth.md`. The branch was clean before the takeover; the changes described below are the audit fixes and documentation/UI closure pass.

### Data and credit boundary

- `POST /api/depth` is the only extension-facing path for deeper market data. Hyperliquid, Binance, Bybit, OKX, and dYdX are called from the local backend, cached, and settled independently; a failed venue becomes one unavailable row rather than removing the table.
- Funding is normalized to an 8-hour comparable rate and a simple annualized rate from each venue's actual funding interval. Hyperliquid and dYdX hourly schedules are not mislabeled as native 8-hour rates.
- Perp Positioning adds Smart Money long/short exposure, buy/sell pressure, market/OI/volume/funding readouts, L2 depth evidence, funding history, and the five-venue table. Liquidations adds ±3/5/10% bands and the largest positions with entry, liquidation distance, and uPnL. Traders adds the coin PnL leaderboard, large recent trades, and top Hyperliquid accounts active in the coin. Chart uses Hyperliquid candles.
- Paid sections stay explicit: Perp Traders is 11 credits, Spot Holders 5, and prediction Book 1. Their tab labels state the price before selection. Expanding a card never spends those credits by itself. The free market and venue sections remain lazy too.
- Replay fixtures cover every added endpoint. `scripts/record-depth-fixtures.mjs` caps a recording run at 25 Nansen credits and never prints the key.

### Card behavior and UI closure

- Evidence, wallet, and author-badge cards now share compact/expanded behavior, remembered independently per card kind. Expanded is the same React content at a larger desktop size, not a parallel component tree.
- Changing size preserves the selected tab and component state. The visual recapture caught a root-shape remount that reset Wallet Hyperliquid to Overview; `Popover` now keeps a stable fragment/card tree and the unit test selects Traders before resizing to prove it remains selected.
- Wallet loading now uses shaped Overview and Holdings skeletons, `aria-busy`, and one polite live announcement instead of a single waiting sentence. Wallet and badge cards expose the same Maximize/Minimize action as evidence cards.
- The expanded Spot Flow tab has an explicit layout: timeframe full width; gauges over netflow on the left; the 320px chart on the right. This removes the large empty quadrant in the first capture.
- The eight Hyperliquid market metrics use a deliberate 4×2 expanded grid. Expanded Traders shows 12 leaderboard and 12 trade rows initially, keeping the top-account cohort discoverable while staying within the brief's 10–20 range.
- Chromium scrollbars, a stronger continuation edge, and `min-width: 0` containment make clipped/continuing evidence legible without hiding table columns. The wallet footer trust copy is compressed to one metadata line.
- Expand controls use action names (`Expand card` / `Collapse card`) without mixing them with toggle-state `aria-pressed`. A shared tooltip supplies the single accessible name and visible explanation on pointer hover or keyboard focus; header hints open downward inside the clipped card, and reduced-motion mode disables their transition. Wallet markers and author badges use the same pattern instead of mouse-only native titles.
- The retired Hazard `DESIGN.md` was replaced by the shipped Nansen visual contract. ADR-0009 through ADR-0012 are now durable in `docs/DECISIONS.md`, and README signal/preset tables were reconciled with the calibrated implementation.

### Captures

`TRIPWIRE_CAPTURE=1`, replay backend on `:3217`, built extension in Playwright Chromium: **3 capture specs passed**. The five brief captures were regenerated and opened: `perp-expanded.png`, `perp-traders.png`, `perp-funding-venues.png`, `spot-expanded.png`, and `card-skeleton.png`. The audit also added and inspected `wallet-card-expanded.png` and `x-badge-card-expanded.png`, plus refreshed their compact captures.

The final images show the Spot dead zone removed, the Perp 4×2 market grid, the third Traders cohort above the fold, full wallet titles at compact width, and wallet/badge expansion preserving the active Hyperliquid tab. Old `mobile.png` and `dock-mobile.png` remain historical artifacts only; desktop is the supported review target.

### Rulings from the brief audit

- Expanded cards retain tabs rather than rendering every paid section at once. This keeps the cost visible before spending, preserves one content path, and avoids a layout choice becoming permission for an 11-credit call. Four compact Perp tabs are accepted because Chart is a first-class decision view; the strip stays one line and scrolls instead of wrapping.
- The base `/api/guard` or `/api/post-intel` answer is atomic. Its shell still appears immediately, while deeper tab sections have independent loading/failure state. Splitting the base response would add orchestration and duplicate-cache complexity without changing the verdict, so it is not part of this closure pass.
- Funding history is a separate labelled series below the price chart rather than a dual-axis overlay. The separation is more legible and avoids implying that price and funding share a scale.
- The expanded shell is content-sized up to `min(880px, 80vh)` rather than forcing empty height. The maximum geometry and 24px shell match the brief; shorter evidence does not grow a blank lower third.

### Verification

- `pnpm verify`: typecheck clean; core **200**, web **159**, extension **435** tests passed.
- `$env:TRIPWIRE_E2E_PORT='3217'; pnpm verify:e2e`: extension and web production builds passed; desktop E2E **12 passed**, **3 capture-only specs skipped**.
- `$env:TRIPWIRE_CAPTURE='1'; $env:TRIPWIRE_E2E_PORT='3217'; pnpm -F extension exec playwright test -c e2e/playwright.config.ts captures`: **3 passed**.
- `git diff --check`: clean.
- `impeccable detect` could not be rerun because the command is no longer installed on `PATH`. The last durable result remains 83 advisory findings/0 anti-patterns against the then-stale Hazard document; `DESIGN.md` is now reconciled, but no replacement detector count is claimed.

Final code review found one test-data leak risk and one tooltip accessibility gap. Capture-created author links are now deleted from a `finally` block with checked responses and page closure, and the tooltip pattern above replaced native `title` hints. A follow-up review returned **APPROVE** with zero remaining findings.

One tooling note: `pnpm build` (recursive, concurrent) hit a Windows libuv shutdown assertion once under Node 26 after Next had completed. `pnpm -F web build` immediately passed in isolation, and the required sequential build path inside `verify:e2e` passed twice. No product code failed to compile.

### Residual concerns

- The expanded cards still show one selected tab, by decision, so the user explicitly opens paid depth. They do not behave as an all-tabs dashboard.
- Base evidence sections arrive together because the verdict response is atomic; only lazy depth sections settle independently.
- Nansen screener funding/OI have equivalent Hyperliquid public readouts, but are not shown as duplicate figures. `predictedFundings` remains fixture/client groundwork and is not surfaced.
- The design detector is unavailable locally, so the new design document has manual/capture review plus contrast/unit coverage, not a fresh detector count.
- Human work remains: live unpacked checks on real sites, the 1,000-call ledger target, adding a Git remote, merge/push, demo recording, X post, and submission form.

## Live Jumper stacking and Sui-name repair

Closed on 2026-09-20 after testing the built extension on live `jumper.xyz`. Token detection and replay evidence were correct, but Jumper's widget painted over both compact and expanded evidence; a Sui destination also rendered the long fallback `chain 9270000000000000`, which the intentionally two-line strip clamped.

- **Stacking root cause:** WXT requested evidence layer `2147483001` on the body-level `tripwire-ui` host, but its shadow stylesheet starts with `:host { all: initial !important }`. That reset beat WXT's ordinary outer inline positioning, leaving the host at computed `position: static; z-index: auto; display: inline`; Jumper's ordinary `z-index: 1110` widget therefore painted above it.
- **Fix:** `mountReact` passes WXT's `css` option a later same-shadow `:host` rule for non-inline mounts, restoring WXT's zero-size, visible-overflow, positioned host and requested z-index. Inline strips are unchanged, pointer events remain disabled on the full-viewport container, and the existing Popover/focus architecture stays intact. An outer inline `!important` was explicitly rejected because important precedence reverses across Shadow boundaries.
- **Sui copy:** LI.FI's current Sui ID is `9270000000000000`; the obsolete `1001` entry was replaced. Sui remains unsupported and now reads `Tripwire doesn't cover Sui`. No strip breakpoint or clamp was changed—the short correct name already fits.
- **Regression shape:** the Jumper E2E fixture now has `position: relative; z-index: 1110`. Chromium asserts compact overlap and expanded center both resolve to `tripwire-ui`, and asserts computed host `relative / 2147483001 / block / 0px × 0px`. Unit and E2E coverage include the current Sui ID and exact copy.
- **Captures:** `jumper-evidence-compact.png`, `jumper-evidence-expanded.png`, and `strip-jumper-sui.png` were generated and visually inspected. Evidence is fully legible above the widget in both sizes, and the Sui sentence is complete.

Verification: `pnpm verify` passed (core 200, web 159, extension 436); sequential extension/web production builds passed; replay E2E passed 12 with 3 capture-only specs skipped; the capture run passed 3. Final code review returned **APPROVE** with zero findings.

## Wallet lens

Commits `bb87d9d..` on `feat/cockpit-ui` (on top of `c9132e5`). Brief: `.superpowers/briefs/wallet-lens.md`. Unchanged: the origin/Host guard, blocker semantics, the popover and author-badge behaviour, anchor binding, override flow, replay tag and UNCHECKED-never-CLEAR. `DESIGN.md` and `docs/DECISIONS.md` are untouched; the ADR text is at the end of this section.

### Detection rules (`packages/core/src/wallet-detect.ts`)

One pure module, tested on its own, used by both the content script and `WalletQuerySchema`, so the route and the page can never disagree about what counts as a wallet.

**In text** — one regex pass, every branch anchored on both sides so only a whole token matches:

| Shape | Rule | Rejected |
|---|---|---|
| EVM | `0x` + 40 hex, case-insensitive (checksum-tolerant), not followed by more hex | a 32-byte tx hash (`0x` + 64 hex), `0xdead`, an address glued to a word |
| Solana | base58, 32-44 chars, with both a digit and a letter (the `extractTokens` rule) | long plain words |
| ENS / SNS | `(sub.)*name.eth` / `.sol`, not followed by a word character | `docs.ethereum.org`, `0x` in prose |

**In links** — an allowlist of hosts, and within each only a path segment or query parameter that names an *account*, so `etherscan.io/token/0x...` (a contract) is never marked as somebody's wallet: etherscan / optimistic.etherscan / basescan / arbiscan / bscscan / polygonscan / snowtrace `/address/`, solscan / solana.fm / xray `/account/` and `/address/`, `polymarket.com/profile/` and `?address=`, `hypurrscan.io/address/`, `app.hyperliquid.xyz/explorer/address/`, `debank.com/profile/`, `dexscreener.com/maker/`, `pendle.finance` dashboards and `?address=`. Each host carries a chain hint. The most specific host wins (`optimistic.etherscan.io` before `etherscan.io`) — the test caught that ordering bug.

**A contract is not a wallet.** `lib/claimed-tokens.ts` is a set in the extension's shared isolated world: the X chip claims the token it resolved, the venue adapters claim the page's own target, and the lens skips anything claimed — and *retires* a marker whose address is claimed after the fact, which is what makes the chip's asynchronous resolve harmless.

**Marker placement** (`lib/wallet/scan.ts`). Every marker gets an empty `<span>` slot Tripwire owns: after the `<a>` for a link, or between the two halves of a text node **split** at the end of the match. Splitting is not wrapping — no element is introduced around the host's words, the rendered text is byte-identical (asserted in e2e), and the halves re-merge on `normalize()` when the slot goes. The slot, not WXT's shadow host, carries the inline layout: `:host { all: initial !important }` beats an inline style and the container WXT puts inside the host is a block, which was breaking the host page's line (found in capture round 1, fixed, recaptured). Never scanned: form fields, `contenteditable`, `script`/`style`/`noscript`/`code`/`pre`, the text inside an `<a>`, and Tripwire's own hosts and slots. Hits come back in document order. 40 markers per page, one per wallet, oldest recycled (`capMarkers`); scans run on `requestIdleCallback` and rescan on a 700 ms-debounced `MutationObserver`; a marker whose slot the page drops is swept.

### Routes

| Route | What it does | Credits |
|---|---|---|
| `POST /api/wallet` | resolve, then gather in parallel, each block failing on its own | 5 (EVM), 2 (Solana) |
| `POST /api/wallet/labels` | `profiler/labels`, behind `NANSEN_ALLOW_PREMIUM=1` and a button that states the price | 100 |
| `GET /api/token-logo?chain=&address=` | the token's picture, fetched server-side from the URL Nansen already gave this backend | 0 |

`POST /api/wallet` takes `{ query, chainHint? }` and returns `{ input, resolved, address, chainGuess, name, label, portfolio, pnl, hyperliquid, polymarket, nansenUrl, sources, credits, message, errors }`. Blocks: `profiler/address/current-balance` (1 credit, 30 min), `profiler/address/pnl-summary` (1 credit, 90 d window, 30 min), `search/general` (free), Hyperliquid `clearinghouseState` + `userFills` (free, 60 s, backend only), and Polymarket `address-summary` + `pnl-by-address` + `trades-by-address` (3 credits, 10 min). A block whose every call failed comes back `null` — its tab is hidden and its reasons are carried up — rather than as an empty tab.

`lib/intel/badges.ts` grew `hyperliquidProfile(address)` and `polymarketProfile(address)`; the author badges wrap them with the link they came from. The wallet lens passes `nansenPerp: false`, so Hyperliquid costs it nothing.

**Resolution sources that worked**

| Input | Source | Result |
|---|---|---|
| `*.eth` | `api.ensideas.com/ens/resolve/<name>` | works; `vitalik.eth` resolves to `0xd8dA...6045` |
| `*.eth` (fallback) | ENS registry `resolver()` then `addr()` over a public RPC | works, same address, verified live |
| — | `cloudflare-eth.com` (the brief's RPC) | **dead**: `-32046 Cannot fulfill request`. Replaced with `ethereum-rpc.publicnode.com` |
| `*.sol` | `sns-sdk-proxy.bonfida.workers.dev/resolve/...` | **`error code: 1042`** for every name; `sns-api.bonfida.com` and `api.sns.id` 404 |

So `.sol` returns `resolved: false` with a sentence saying why, as the brief instructs, rather than an address that might belong to somebody else. The ENS RPC fallback stands on a hand-written keccak-256 (Node ships SHA3-256, a different padding, and this repo has no hashing dependency); it is checked against the published vectors and against the `vitalik.eth` namehash confirmed live against the registry. Both results are cached 24 h, misses included.

`profiler/labels` is never in the wallet card's own load. The card's label line comes from `search/general`, which — measured — returns `total_results: 0` for a raw address, so the line says so and offers the 100-credit button when the backend allows it.

**Token logo proxy.** `cachedLogoUrl` reads the `tgm/token-information` answer already in the cache (a new `nansenPeek`, cache-only, replay-aware) and never spends a credit: a token nothing has looked up is a 404. The fetch is https only, one request, 5 s timeout, an allowlist of image content types, and a 200 KB cap enforced *while streaming*, not just on the declared length. 24 h cache in the shared `cache` table.

The brief's `<img src="http://127.0.0.1:3000/api/token-logo?...">` does not work from a content script: Chrome's Private Network Access rules refuse an https page reaching into the loopback address space ("Permission was denied for this request to access the `loopback` address space"), which the e2e console-error assertion caught. The background service worker holds the host permission and is not subject to that rule, so it fetches the bytes and hands them to the card as a data URL (`lib/token-logo.ts`, bridge message `tokenLogo`, same 200 KB cap). The route also answers with CORS headers for the extension's own origin, because a backend on a port other than the one in `host_permissions` is an ordinary cross-origin fetch — without that the logo failed silently for anyone who moved the backend off :3000, including every e2e run. `x-popover.png` now shows the real dogwifhat mark: the previous round's last third-party request is gone.

### Permission flow

- Manifest: `permissions: ["storage", "scripting", "activeTab"]`, `optional_host_permissions: ["*://*/*"]`. **No `<all_urls>` at install**, and `host_permissions` is still only the local backend.
- `wallet.content` is declared for X and every venue (the 21 patterns already granted).
- Anywhere else: the popup's "Enable Tripwire on this site" calls `browser.permissions.request({origins:[origin]})` for the current tab's origin (read via `activeTab`), and only on a grant does the background `scripting.registerContentScripts` `content-scripts/wallet.js` for it. "Remove" revokes and unregisters.
- The background re-syncs on install, on startup and on `permissions.onAdded`/`onRemoved`, so a permission revoked from Chrome's own settings — which never tells the extension — stops the injection on the next wake. A test asserts the script is registered for exactly the granted origins, updated rather than re-registered, and unregistered when the last grant goes; another asserts nothing is registered when the user declines.
- The local backend's own host permission is filtered out of the list, so it can never appear as a removable "site" (a test caught that).
- A second `web_accessible_resources` entry exposes the fonts and bundled logos to `*://*/*` with `use_dynamic_url: true`, so an arbitrary site cannot probe a fixed `chrome-extension://` URL to detect Tripwire.

### UI

- **Marker** (`lib/ui/WalletMarker.tsx`): an 18px control holding the 14px Nansen mark, `aria-label="Inspect wallet 0x7f...17d1 with Tripwire"` (the name, not a generic label, so forty of them on a page are still distinguishable), `aria-expanded`, a 24px hit target from a pseudo-element, mint-tinted while its card is open.
- **Card** (`lib/ui/WalletCard.tsx`): the same body-level 440px popover. Header: the identity (the name it was shared as, else a Nansen label, else the short address), the chain mark and a labelled "Copy address" action — the sub-line no longer repeats the heading (capture round 2). Tabs appear only for venues that answered: Overview (label line or the premium button, Portfolio / Realized PnL 90d / Win rate / Trades tiles, top 6 holdings with token and chain marks), Hyperliquid, Polymarket. Footer: "View on Nansen" (`app.nansen.ai/profiler?address=...&chain=...`, pattern verified against live indexed Nansen pages), "Powered by Nansen", the credit count, the sources, and the privacy line. Loading, unresolved, failed and empty states all say something specific.
- The Hyperliquid and Polymarket bodies moved to `lib/ui/VenueBody.tsx`: the badge card and the wallet card now render them from one implementation, and `Readouts`/`Sources`/`Problems`/`price`/`signOf` moved to `panel-parts`. The Nansen perp-PnL tiles are omitted when the caller skipped that paid call, rather than showing two em dashes (capture round 1).
- **Popup:** a "Wallet lens" section with the enable button for the current site, the enabled-site list with Remove, and "Recent wallets" (last 10, in this profile only, each opening that wallet in Nansen Profiler, with Clear). The brief's "click to reopen the card" is not implementable from a popup — there is no page to reopen it on — so the entry opens the Profiler instead.
- Lucide only, bundled logos only, no emoji, smallest text 0.75rem, tabular figures, 24px targets, no `innerHTML`.

### The two user-reported defects, and the two after them

1. **The strip clipped its own sentence.** A one-line ellipsis cut "Tripwire couldn't check this: n..." on a strip that had the width to say it. The finding now wraps to two lines (`-webkit-line-clamp: 2`, `line-height: 1.25`, `overflow-wrap: anywhere`), the strip's height grows with it (vertical padding instead of a fixed height), and the full text stays in `title`. Past two lines it still clips, so a pathological reason can never take over the venue's card. The e2e asserts, at the venue's own 416px card, that the clamp is 2, the text is longer than one line can hold, it renders on exactly two lines, it is not clipped sideways, `title` equals the text, and the host page still gains no horizontal scroll.

2. **"no target on this page" was the answer to three different questions.** `TargetGap` (`lib/adapters/types.ts`) replaces it with three:

   | Gap | Strip reads | Where it comes from |
   |---|---|---|
   | `unsupported-chain` | "Tripwire doesn't cover Bitcoin" | Jumper's `toChain` outside coverage (LI.FI's `20000000000001`, Linea, zkSync Era, ...; unknown ids read "chain 9999999"), Uniswap's `chain` param |
   | `native-asset` | "ETH is the chain's native asset — Tripwire checks tokens" | the `0xeeee...` sentinel, or a Buy selector reading ETH/SOL/BNB/AVAX/POL (MATIC too); WETH stays a token |
   | `symbol` | resolved through `/api/resolve` and checked like any other token | the Buy/Receive selector when the URL names nothing |

   All of them are UNCHECKED severity and none can block. A covered chain where Nansen returned nothing keeps the previous round's named-endpoint reason ("Nansen flow data unavailable for this token on base") — asserted.

3. **Uniswap's default page named no token at all.** `readGap` reads the *Buy* selector (`choose-output-token`, scoped to the output side so the Sell token is never mistaken for it) and the venue content script resolves that symbol through the existing free `search/general` path, cached per symbol per page session, before guarding it. The URL stays the primary source; the DOM only fills the gap. Jumper reads `widget-to-token-button` the same way, and Jupiter — whose `/swap/USDC-SOL` form takes a bare symbol where a mint belongs — now returns a target only for a real mint, so "SOL" is named as the native coin instead of being sent to the backend as an address (that was a live 400).

### Tests

- **core (40 new, 180 total):** the detector — every address and name shape, every explorer href, tx hashes, `0x` in prose, base58 words, `docs.ethereum.org`, contract pages, unlisted hosts, non-http URLs — plus dedupe, the marker cap and `walletKey`.
- **web (24 new, 140 total):** `/api/wallet` for an address, an ENS name, a `.sol` name, a Solana address (no Hyperliquid/Polymarket, 2 credits), a bad input (400), the origin guard, and a partial failure that still answers; the labels route refusing without the gate, validating before it can cost anything, and reporting 100 credits; `extractLabels` against the shapes `profiler/labels` might use; the logo proxy's parameter validation, host guard, CORS for the extension origin, content-type and size rejection (declared and streamed), cache hit, and the no-credit rule. Plus keccak-256 and namehash against published vectors.
- **extension (69 new, 411 total):** the DOM scan (text, links, both together in document order, form fields, `contenteditable`, its own UI, rescans, late content, several hits in one node, the skip rule, the pass limit, healing the text on removal, tx hashes); the permission helpers and `syncWalletScripts`; the recent list; the marker's accessible name; the card's tabs, loading, unresolved, failure, credit line and premium gating; the bridge's sub-path rule and the `tokenLogo` message (data URL, non-image, oversized, malformed parameters); and 21 venue-gap cases (Bitcoin, Linea, zkSync Era, an unnamed chain id, native ETH on Jumper and Uniswap, native SOL on Jupiter, the Receive/Buy selectors, WETH as a token, never reading the Sell side, and the named-endpoint reason for a covered chain).
- **e2e (10 passing, 2 new):** wallet markers appear in document order on a page of wallet mentions, with the transaction hash, the bare `0x`, `docs.ethereum.org` and both form fields untouched, the sentence byte-identical after the split, and no horizontal page scroll; the card opens beside its marker, shows the wallet's identity and credits, switches to Hyperliquid's recorded position, closes on Escape with focus back on the marker, and resolves `vitalik.eth` through the backend. And: a Bitcoin destination reads "Tripwire doesn't cover Bitcoin" with no block, Uniswap's default page reads the native-asset line, picking a token in that form checks it with no URL change, and the reason wraps to two lines rather than clipping.

### Fixtures and credits

**2 Nansen credits**, in one live run: `fixtures/nansen/addressBalances.json` (1), `addressPnlSummary.json` (1) and `search_any.json` (0), recorded by `scripts/record-wallet-fixtures.mjs`, which caps itself at 6 and never prints the key. The address is `0x7fda...17d1`, the Nansen-labeled fund already behind the Hyperliquid fixtures, so every wallet-lens fixture is about one wallet. The Hyperliquid and Polymarket fixtures were reused unchanged. `profiler/labels` has no fixture on purpose: it costs 100 credits, so replay reports it as unavailable and the route's test asserts exactly that.

Two shapes were measured rather than assumed: `profiler/address/pnl-summary` answers **flat** for an address (`realized_pnl_usd`, `win_rate`, `traded_times`, `traded_token_count`), unlike the entity form; and `search/general` returns **nothing** for a raw address, which is why the label line is honest about needing the premium call.

### Captures (`.impeccable/review/`, replay backend on :3217, built extension in Playwright Chromium)

`wallet-marker.png`, `wallet-card-overview.png`, `wallet-card-hyperliquid.png`, `enable-site.png`, `strip-jumper-btc.png`, `strip-uniswap-native.png`, plus recaptured `strip-narrow.png` and the existing `x-popover*` / `block-evidence` set. Each was opened and checked.

- **Round 1** found three defects: the marker wrapped onto its own line (the shadow host's block container under `all: initial`, fixed by moving the inline layout onto the slot); the card's heading and sub-line both printed the short address; and the Hyperliquid tab showed two empty tiles for the paid PnL the wallet lens deliberately skips. The first capture also collided with the venue dock, so the stub's feed now starts below it.
- **Round 2** found the labelled copy action wrapping inside the 24px icon square; it is now a row.
- **Round 3** captured clean — including the token logo, which required the CORS fix above to render at all on a non-3000 port.
- `enable-site.png` is the popup opened as a page with the active tab and the granted origins stubbed, because a popup opened as a tab sees only its own `chrome-extension://` URL.

### Detector

`impeccable detect apps/extension apps/web packages/core`: **83 findings, 0 anti-patterns**, all advisory (40 colour, 29 radius, 14 font-size). They are drift measured against the old Hazard `DESIGN.md` plus the e2e stubs (`wallets.html`, `uniswap.html`, `jumper.html`, `jupiter.html`, `x-timeline.html`), which imitate the host venues' palettes on purpose. None are in the wallet lens's own values.

### Verification

- `pnpm verify`: typecheck clean; core 180, web 140, extension 411 tests passed.
- `pnpm -F web build` and `pnpm -F extension build`: OK.
- `TRIPWIRE_E2E_PORT=3217` e2e: 10 passed, 2 capture specs skipped. Port 3000 is still held by a server this session did not start, so plain `pnpm verify:e2e` was not run.

### ADR-0011 (text for `docs/DECISIONS.md`, not written there)

**ADR-0011: The wallet lens runs on a site only after that site is granted, and everything it fetches goes through the local backend.**

*Context.* The feature has to work "anywhere somebody shares a wallet" — X, Polymarket, Hyperliquid, DEX Screener, Pendle, or a blog. The obvious implementation is `<all_urls>` at install, which is also the permission users refuse and reviewers reject, and which would let a bug inject into their bank. Separately, the card wants two things from outside: ENS resolution and token logos.

*Decision.* The manifest keeps only the hosts Tripwire already had, plus `optional_host_permissions: ["*://*/*"]` that is never requested at install. A site becomes enabled only through the popup's per-origin request, and only then does the background register `content-scripts/wallet.js` for it; the registration is re-synced from `permissions.getAll()` on install, on startup and on every permission change, so the set of injected sites is derived from the grants rather than remembered alongside them. Nothing the extension shows is fetched from a third party: ENS is resolved server-side (ensideas, then an ENS registry call over a public RPC), `.sol` is not resolved at all because no free resolver answered, and a token's logo is fetched by the backend from the URL Nansen gave it and handed to the card as bytes. The card's own `<img>` could not point at the backend directly — Chrome's Private Network Access rules refuse an https page reaching into loopback — so the background does that fetch too.

*Consequences.* Reach depends on the user enabling sites one at a time, which is slower than `<all_urls>` and is the point: the permission prompt names the site they are on, and "Remove" is one click. The lens costs 5 Nansen credits per EVM wallet per cache window (2 for Solana), spent only when a marker is clicked, and the card says so in its footer. `.sol` names are a stated gap rather than a guess. And `profiler/labels` stays behind an env flag and a button that prints "100 credits", because a single accidental click is 5% of a day's default cap.

### Concerns

- **Cost per click.** 5 credits for an EVM wallet is the most expensive thing in Tripwire per user action. It is user-initiated and cached (10-30 min), and the footer states it, but a curious afternoon on a wallet-heavy timeline adds up. Dropping the three Polymarket calls to one would halve it.
- **Text splitting on framework-rendered pages.** Splitting a text node is far less invasive than wrapping it, but a framework that later rewrites that node's text will restore the full string and leave the marker beside a duplicate fragment until the next sweep. It cannot crash the host page; it can look wrong for a second on a very chatty app.
- **`.sol` is unresolved.** Every public SNS resolver tried was down or gone. The card says so, which is honest, but a `.sol` name is the one thing in the brief the lens cannot answer.
- **The premium label path has no fixture,** so its success case is exercised only by unit tests against synthetic shapes: `profiler/labels`' real response shape is read defensively rather than known, and the 100-credit call was never made.
- **`use_dynamic_url` on the second web-accessible-resources entry** is the mitigation for exposing fonts and logos to `*://*/*`; it was verified on the built manifest, not on a granted third-party site.
- **`.gitleaks.toml` changed:** `[allowlist]` became `[[allowlists]]` (8.30 refuses both together) and one AND-scoped entry stops a public ERC-20 contract under a field literally named `token_address`, in a recorded fixture, from reading as a generic API key. It is a security config, so it deserves a human look.
- **The out-of-coverage chain table is hand-written.** It names the chains Jumper and Uniswap route to today; a chain that is not in it reads "chain 59144"-style, which is true but less useful than a name.
- **Uniswap's DOM fallback depends on `data-testid="choose-output-token"`,** captured on 2026-09-17. If Uniswap renames it, the page falls back to the old "no target on this page" rather than breaking.
- Port 3000 still runs a server this session did not start; `pnpm -F web build` rewrote `apps/web/.next` again, so that server probably needs a restart. No request was sent to it.

---

# Round 1.1 — the spot card states a price and stops throwing away the token record

Branch `feat/cockpit-ui`, on top of `a406f9c`. Brief: `docs/IMPROVEMENT-PLAN.md` §2, Round 1.1 (items 1.1.1–1.1.8 plus the indicators TTL). **Zero new Nansen calls.** Everything drawn here comes out of responses the card already fetched and paid for; the one cost change is the indicators TTL, which is credit-negative.

## Per item

### 1.1.1 — Price on the card face

The card now states the price above the chart, outside it. `priceReadout` (`packages/core/src/spot-readout.ts:213`) turns the panel's candles into price / change / low–high; `PriceReadout` (`apps/extension/lib/ui/SpotBody.tsx:98`) renders it in the Flow tab's Price section (`SpotBody.tsx:267`), using `formatPrice`'s significant-digit rule so a memecoin reads `$0.00000424` rather than `$0.00`. A one-candle window still prints a price and a range and dashes the change; no candles falls back to the token record's price; nothing at all is a dash. `priceRange` (`SpotBody.tsx:77`) writes both ends at one precision, so a range never reads `$0.9800–$1.02`.

*Tests:* `packages/core/test/spot-readout.test.ts` "the price readout survives a window the chart refuses to draw" (four cases including a zero first close); `apps/extension/test/spot-round-1-1.test.tsx` "1.1.1 the card states the price" (one candle, zero candles, record fallback, memecoin digits).

### 1.1.2 — Token record block

`TokenInformationResponse` widened (`apps/web/lib/nansen/endpoints.ts:52`) and `toTokenInfo` now maps the whole record (`apps/web/lib/intel/spot.ts:102`): `fdv_usd`, `total_holders`, `token_deployment_date`, `circulating_supply`, `total_supply`. `TokenInfo` gained the matching nullable fields (`packages/core/src/nansen-types.ts:30`). `toIsoInstant` (`spot-readout.ts:134`) reads Nansen's offset-free `"2023-11-20 19:22:43"` as UTC — `new Date()` would have read it as the reader's local time and shifted it by up to a day. The RiskTab "Market" block is now a 4×2 `Readouts` (`SpotBody.tsx:505`) carrying Market cap / FDV / 24h volume / Liquidity / Holders / Token age / Circulating / Total supply, captioned "Holders, supply and age are a daily snapshot and can be up to 24h old" — the as-of window the review asked for, because the whole block is one call on a 24h TTL.

*Tests:* `apps/web/test/intel.test.ts` "the token record survives the mapper" (every fixture field maps; an absent field is null while a reported `0` stays `0`); `spot-round-1-1.test.tsx` "1.1.2 the token record block" (figures, the as-of caption, an empty record renders no block at all, a partial record dashes the rest).

### 1.1.3 — 24h buy/sell split

`buy_volume_usd`, `sell_volume_usd`, `total_buys`, `total_sells`, `unique_buyers`, `unique_sellers` now reach the card. `SplitSection` (`SpotBody.tsx:325`) renders them in the Flow tab under the segment rows, labelled **24h** because `endpoints.ts:204` hardcodes `timeframe: "1d"`. Gated on `splitIsReadable` (`packages/core/src/signals/spot.ts:56`), which reuses `MIN_VOL24_USD`: below the floor every tile is a dash and the card says why. Readout only — nothing here feeds a signal or a verdict in this round.

*Tests:* `packages/core/test/spot-readout.test.ts` "the 24h split is printed only where a percentage of volume means something"; `spot-round-1-1.test.tsx` "1.1.3 the 24h buy/sell split" (figures, dashes below the floor, no section when the split is absent).

### 1.1.4 — Both sides of every wallet

`WalletList` (`SpotBody.tsx:352`) gained a secondary figure per row (`sold $49.8K` under `$49.9K`) and a "both sides" tag.

**Finding:** the two recorded top-20 pages share *no* address, so a tag derived from page overlap would never have fired on the fixture. Every `who-bought-sold` row already carries both of its own volumes, so `tradedBothSides` (`spot-readout.ts:189`) marks a round-trip from the row itself and keeps `bothSidesKeys` page overlap as a second source. A null on either side cannot make the tag fire. The recorded #2 top buyer — bought $49,893.51, sold $49,844.62, net $48.89 — now reads as what it is instead of as a $49.9k buyer.

Copy: "**Both sides** marks a wallet that bought and sold inside this window. Wallets outside the two top-20 lists are not compared." It does not claim only these wallets round-tripped.

*Tests:* `spot-readout.test.ts` "wallets that appear on both recorded pages" (the bot, the empty overlap, a null side); `spot-round-1-1.test.tsx` "1.1.4 both sides of every wallet" (the bot's tag and sell side, `sold $0.00` distinct from `sold —`, the sample copy, the mirrored seller column).

### 1.1.5 — The chip carries the symbol

`chipLabel` (`apps/extension/lib/ui/format.ts:20`) returns the resolved ticker once `tgm/token-information` answers and the short address otherwise; `x.content/index.tsx:142,285` threads it, and `renderChip` *updates* the existing mount rather than remounting, so the anchor cannot move and the post cannot reflow. `Chip` gained `isSymbol` (`Chip.tsx:22`): the cashtag is spoken only for a real ticker, so an unresolved contract chip announces "contract EKpQ…zcjm", never "$EKpQ…zcjm". The card the chip opens is now titled `$WIF` **from its first frame** (`index.tsx:190`) instead of showing a base58 string it replaced a second later.

*Scope note:* the chip's visible pill shows the chain logo, the verdict plate and the finding. The symbol only ever appeared in the loading plate and in the accessible name, and no token logo was added to the chip — so the review's "the logo proxy is cache-only, so the chip needs a monogram fallback" caveat does not apply here. Widening the pill with a logo would have put the anchor-fit rule at risk for no new information.

*Tests:* `spot-round-1-1.test.tsx` "1.1.5 the chip relabels to the token's symbol" (relabel, failed lookup, length cap, aria-label, same-button update); e2e `smoke.spec.ts` "the card is on screen before its data" now asserts the first frame says `$WIF`.

### 1.1.6 — Exchange net flow

`exchangeFlowCopy` (`spot-readout.ts:25`) and `ExchangeFlowLine` (`SpotBody.tsx:126`) put it on its own line below the stack (`SpotBody.tsx:239`), never inside it: a negative figure means **tokens left exchanges**, the opposite polarity to the five cohorts, and it can never carry a wallet count (`exchange_wallet_count` is always 0). Copy is `$127K left exchanges` / `moved onto exchanges` / `No net movement to or from exchanges` / `Exchange flow unavailable for this window`.

*Tests:* `spot-readout.test.ts` "exchange net flow reads at its own polarity" (all four directions, plus `FLOW_STACK_FIELDS` proving the field is not a stack row); `spot-round-1-1.test.tsx` "1.1.6" (the recorded value, six bars in the stack and none of them exchange, the inverted and null cases).

### 1.1.7 — Flow-intelligence warnings

New `warnings` channel on `SpotPanel` (`apps/web/lib/intel/spot.ts:76`, `apps/extension/lib/api-types.ts:116`), filled by `toFlowWarnings` (`spot-readout.ts:66`, capped at 6 × 240 chars) from the envelope the mapper used to discard (`endpoints.ts:168`). It never touches `panel.errors`, so `SectionProblem` and the "Unavailable:" list stay empty and the verdict is untouched. `flowWarningRow` (`spot-readout.ts:53`) places each warning under the row it limits — the fresh-wallets one inside the gauge stack, the exchange one under the exchange line, anything unplaceable under the section. The view window's own warnings merge in without repeats and stay capped.

*Tests:* `apps/web/test/intel.test.ts` "flow-intelligence warnings are their own channel" (populates `warnings`, leaves `errors` empty; the 7d merge); `spot-round-1-1.test.tsx` "1.1.7 warnings render as captions, not as failures".

### 1.1.8 — Indicators

`signal`, `signal_percentile` and `last_trigger_on` now cross the panel DTO (`apps/web/lib/intel/spot.ts:228`). The render splits on the **score vocabulary**, not the array name (`SpotBody.tsx:492`): `scoreVocabulary` (`spot-readout.ts:93`) puts `cex-flows` (a risk row scored `high`) and `concentration-risk` (a reward row scored `low`) on the severity scale and `price-momentum` (`bearish`) on the direction scale, which array-based grouping got wrong. `indicatorTriggerDate` (`spot-readout.ts:118`) returns null for the epoch, so `1970-01-01` renders "last fired unknown" rather than "56 years ago". The percentile is labelled "Nth percentile of comparable tokens" — a peer ranking, not a severity. Directional scores get their own pill colours so `bullish` never wears the alarm amber.

*Tests:* `spot-readout.test.ts` "indicators group by score vocabulary, not by the array they arrived in"; `apps/web/test/intel.test.ts` "indicators carry what the 5 credits already bought"; `spot-round-1-1.test.tsx` "1.1.8" (grouping, unknown trigger, peer-ranking copy, pill colours, the empty state).

### Also in this round — indicators TTL 6h → 24h

`INDICATORS_TTL` (`apps/web/lib/nansen/endpoints.ts:160`). Nansen recomputes indicator scores in a daily batch, so three of every four calls bought the same answer. Verdict-safe: the only signal reading this response is `risk_high_count`, which is in no shipped preset — asserted rather than assumed (`apps/web/test/intel.test.ts`, "the indicators TTL is a day, not six hours"). Saves about 5 credits per token per day.

## Craft pass

- The "both sides" tag first sat beside the wallet name and truncated "Wintermute Market Making" to "Wintermute Ma…". It now sits under the name (`theme.css`, `.tw-wallet-cell`), mirroring the amount cell's two-line shape, so the identity keeps the full column and still ellipsises.
- The price range wrote its two ends at different precisions (`$0.9800–$1.02`); `priceRange` fixes both to the smaller end's digit count.
- Supply reads `998.9M`, holders read `86,022`: a supply is a magnitude, a holder count is exact.
- `.tw-score` now takes its colour from its own vocabulary (severity amber/red, direction red/neutral/mint) instead of defaulting every non-`high` score to caution amber.
- No emoji, Lucide only (`Landmark` is the one new icon), every new text style ≥ 11px, every figure `tabular-nums`.

## Verification

- `pnpm verify`: typecheck clean; **core 220, web 189, extension 506** tests passed (200 / 179 / 477 before the round).
- `pnpm -F web build` and `pnpm -F extension build`: both OK.
- `TRIPWIRE_E2E_PORT=3217 pnpm verify:e2e`: **18 passed, 3 capture-only specs skipped.** Port 3000 is held by a server this session did not start and was never touched.
- Captures: `TRIPWIRE_CAPTURE=1 TRIPWIRE_E2E_PORT=3217 pnpm -F extension exec playwright test -c e2e/playwright.config.ts captures` — 3 passed. `x-popover`, `spot-expanded`, `x-popover-wallets`, `x-popover-risk`, `card-skeleton` and `block-evidence` were regenerated and each opened to confirm it shows what its name says. `x-popover-wallets` and `x-popover-risk` had no generator at all (last written 2026-09-17); both are now produced by `captures.spec.ts`.
- `git diff --check`: clean.

## Notes for the next round

- **`apps/extension/test/mount.test.tsx`'s CSS ceiling was raised 60k → 72k.** It is a smoke ceiling whose real guards are the two assertions above it (no inlined fonts, no `data:` URIs); the theme was already at 59.9k before this round, so any CSS at all would have tripped it.
- **The recorded `whoBought`/`whoSold` pages are 8 rows each with zero overlap**, so the cross-page half of "both sides" is not exercised against a real intersection. The row-level path is the one that fires on the fixture, and it is the stronger signal anyway.
- **Warnings render in Nansen's own words** (`fresh_wallets_wallet_count is always 0 …`), which leaks a field name into the UI. Paraphrasing would mean asserting something Nansen did not say. If this copy is judged too raw, the fix is a curated map from known warning text to product wording, not a rewrite at render time.
- The directional-indicator section sits below the compact card's fold on the Risk tab; it is covered by unit tests rather than by a capture.
- Nothing in this round needed a field the recorded fixtures lack, so no fixture was re-recorded and no live call was made.

### ADR-worthy (text for `docs/DECISIONS.md`, not written there)

**ADR-0014: A documented API limitation is data, not a failure.** `tgm/flow-intelligence` returns `warnings[]` beside the rows it did return. Routing those through `panel.errors` would print "Unavailable:", read as an outage, and — because `uncheckedHeadline` consumes `panel.errors` — risk describing a healthy check as a broken one. Warnings therefore ride their own `SpotPanel.warnings` channel, capped in length and count, placed as captions under the row each one limits, and they can never change a verdict. The inverse still holds: a call that *threw* stays in `errors` and still yields UNCHECKED.

**ADR-0015: Group indicator scores by vocabulary, not by the array they arrived in.** `tgm/indicators` returns `risk_indicators` and `reward_indicators`, but the live response puts a `high`-scored row in the first and a `low`-scored row in the second, while `price-momentum` — also a reward row — scores `bearish`. The arrays are provenance, not scale. Rendering therefore splits on whether the score word belongs to `low/med/high` or to `bearish/neutral/bullish`, so a severity pill and a direction pill never share a colour or a heading. Nansen's `1970-01-01` is read as "never", not as a date, because an age rendered from it states something false.

---

# Round 1.2 — the prediction card gets a price, a state and an honest PnL column

Branch `feat/cockpit-ui`, on top of `20e31a2`. Brief: `docs/IMPROVEMENT-PLAN.md` §2, Round 1.2 (items 1.2.1–1.2.8). **Zero Nansen credits spent building it**, and the round is credit-negative at runtime: the Book tab drops from 1 credit to 0 (Polymarket's own CLOB), the holder fan-out is capped, and a settled market now costs a chip nothing at all.

Before this round `PredictionBody` rendered a question and a proven-winners bar. No price, no volume, no liquidity, no resolution date, no market state — and the "PnL" column beside each holder was that wallet's **cross-market lifetime** figure printed in a per-position row.

## Fixtures and credits

`fixtures/nansen/gammaMarket.json` was hand-trimmed to the 9 fields the old mapper read, so replay could not exercise 1.2.1 at all. `scripts/record-prediction-fixtures.mjs` re-records it, plus `fixtures/nansen/clobBook.json` (both outcome tokens' order books) — **both APIs are free and unauthenticated, 0 Nansen credits**.

**Finding:** the market every other prediction fixture was recorded against — 4441305, "Will the price of Bitcoin be above $72,000 on September 17?" — has been dropped from Gamma entirely. Both `?slug=` and `?id=` return `[]` for it: a settled daily market does not stay addressable. The recorder defaults to `bitcoin-above-80k-on-september-20-2026` (market 4527564), the same daily series, live and Yes/No, so the recorded question, outcomes and shape stay consistent with `pmTopHolders.json`, `pmTrades.json` and `pmPnlByAddress.json`. The recorded object has **84 fields**, of which the card maps 25.

`fixtures/nansen/pmOrderbook.json` and the `pmOrderbook` wrapper (`apps/web/lib/nansen/endpoints.ts`) were deleted rather than left behind: after 1.2.7 the endpoint has no call site, and a 1-credit wrapper nobody calls is a trap for the next reader.

## Per item

### 1.2.1 — the Gamma market survives the panel DTO

`GammaMarket` widened from 9 fields to the useful subset of the live 84 (`apps/web/lib/intel/prediction.ts:79`), mapped by `toMarket` (`:290`) into a `PredictionMarket` DTO (`:23`, mirrored at `apps/extension/lib/api-types.ts:130`): `bestBid`, `bestAsk`, `spread`, `lastTradePrice`, `oneDayPriceChange`, `oneWeekPriceChange`, `liquidityNum`, `volumeNum`, `volume24hr`, `volume1wk`, `endDateIso`, `startDateIso`, `negRisk`, `clobTokenIds`, `description`, `events`, `groupItemTitle`, `active`, `closed`, `acceptingOrders`, `umaResolutionStatuses`. Every field nullable; Gamma **omits** rather than nulls, and the recorded market carries `oneDayPriceChange` with no `oneWeekPriceChange` key at all, which is the case the dash test pins.

It renders in a new readout block above the tabs (`MarketReadout`, `apps/extension/lib/ui/PredictionBody.tsx:100`). `description` sits behind a disclosure, capped at 1,200 chars on the backend (`prediction.ts:120`) and rendered as a text child — never `innerHTML`, never `dangerouslySetInnerHTML`.

*Tests:* `apps/web/test/prediction.test.ts` "every field the card can say something true with reaches the panel" and "a field Gamma omits is null and does not blank the card"; `apps/extension/test/prediction-round-1-2.test.tsx` "the resolution prose is third-party text behind a disclosure, never markup" (a `<img onerror>` in the description survives as literal text, with no `img` and no `b` element in the DOM).

### 1.2.2 — the price and the date

`yesPrice` is the **mid of `bestBid`/`bestAsk`**, falling back to `lastTradePrice` and only then to the cached `outcomePrices` snapshot, with the source recorded beside it as `yesPriceSource` (`prediction.ts:303`). `MarketResolution` now carries `fetchedAtIso` (`:167`), so the card can state *when* that price was read rather than implying it is live off a 1h cache.

The card prints `YES 91.8¢ +0.55¢` with `mid of the resting book · as of 2m ago` beneath it. `cents()` (`PredictionBody.tsx:25`) gives one decimal of a cent normally and two below a cent — a long shot resting at 0.15¢ must not read `0.1¢`.

**Craft finding from the capture:** `endDateIso` is **date-only** (`"2026-09-20"`), so sourcing the resolution date from it printed a market that settles at 16:00 UTC as `12:00 AM UTC`. `marketDate` (`:70`) takes the full `endDate` first, prints no hour for a date-only value, and drops the year when it is the current one.

*Tests:* `prediction.test.ts` "the headline price is the book's mid, never the cached outcomePrices snapshot" (all four source cases, plus a market with a deliberately stale snapshot); `prediction-round-1-2.test.tsx` "prices Yes off the resting book and says where the number came from", "the compact card states six figures…" (asserts `Sep 20, 16:00 UTC`, not midnight).

### 1.2.3 — market state

`marketState()` (`prediction.ts:190`): `closed` wins, then `acceptingOrders === false || active === false` is **paused**, then `live`, then `null` when Gamma says nothing. `judge()` no longer treats a settled market as ordinary — but it does not refuse it either: the market resolves, the state travels with it, and the holders and trades still render, labelled historical (`panel.historical`).

A resolved market yields `null` from `predictionSignals`, so `rules/evaluate.ts` leaves the verdict **UNCHECKED** — the plan's requirement, and the reason the card can show settled evidence without asserting anything about it. In chip mode a resolved market returns before any Nansen call: **0 credits instead of 15**.

`umaResolutionStatuses` is `"[]"` on the recorded market. Empty means *no resolution information*, so the line is omitted rather than rendered as "unresolved"; an absent field is `null`, which is a different thing again.

Pill and copy live in the readout block (`PredictionBody.tsx:107`) rather than `CardHeader`, which is shared by four card kinds and would have gained a prop that only one of them ever sets.

*Tests:* `prediction.test.ts` "a settled market reached by its own slug reads resolved, keeps its evidence and stays UNCHECKED", "a settled market costs a chip nothing at all", "acceptingOrders:false with closed:false is paused, not resolved", "an empty umaResolutionStatuses means no resolution information"; `prediction-round-1-2.test.tsx` "a settled market wears a resolved pill and says its evidence is history" / "a live market wears no pill at all".

### 1.2.4 — the holder PnL column says which PnL it is

`unrealized_pnl_usd` and `current_price` were already on `PmHolder` and already crossed the bridge; the table simply never drew them. Compact is five columns — Wallet / Side / Size / Entry / **PnL here** — and expanded adds **Now** and **Settled record** (`HoldersTab`, `PredictionBody.tsx:263`). The recorded top holder now reads `−$744.52` on this market with `+$34.5K · 68 of 558 won · 12%` as its lifetime record beside it, instead of a single unlabelled `+$13,788`.

`positionPnl` (`:47`) prints this one column to the cent. The house `usd()` compacts, which is right for a magnitude and wrong here: the column exists *because* `−$745` and `+$13.8K` are different kinds of number, and a market settled in cents should not round its own result away. Everything else on the card keeps the compact formatter.

*Tests:* `prediction-round-1-2.test.tsx` "the compact card shows this market's result, with its own header", "the expanded card adds the current price and the wallet's settled record, under distinct headers", "a holder with no record shows a dash there, never a zero", "every figure is in tabular numerals".

### 1.2.5 — the judged market stops counting in its own weight

**Measured on the fixture: the all-rows sum is $14,337.53 and the settled-only sum is $16,815.68** — a $2,478 gap produced entirely by open positions, one of which is the market under judgement (4441305, `market_resolved: false`, −$744.52). `recordFromPnlRows` (`packages/core/src/signals/prediction.ts:69`) counts `market_resolved === true` rows only and reports how many it summed.

*Shipped differently from the brief, deliberately:* 1.2.8 removes `pnl-by-address` from the prediction path entirely, so there is no all-rows sum left in production to filter. The contamination is fixed **at the source** by `realized_pnl_usd`, which excludes every open position by construction — and the measurement above is pinned as a core test so the number cannot quietly drift, plus a call-site assertion that the card never issues a `pnl-by-address` request.

*Tests:* `packages/core/test/prediction-record.test.ts` "the recorded wallet's settled-only record differs from the all-rows sum it replaced", "a wallet with nothing settled has no record, and is never scored as a zero"; `prediction.test.ts` "a 20-holder response issues at most 10 address calls, and never pnl-by-address".

**Calibration gate — not closed.** The verdict mapping is untouched (`> 70` high, `> 50` warn, `null` UNCHECKED) and no threshold moved. What must be re-measured is written into `docs/CALIBRATION.md` §8.2: the distribution of `provenWinnerSplit`'s value under the old and new record across 20–30 live markets (~300 credits), which is the only thing that can say whether 50/70 still sit where they were calibrated.

### 1.2.6 — side totals and concentration

`sideTotals()` (`signals/prediction.ts:152`) lives beside `provenWinnerSplit` so the card and the signal read the sample the same way. It returns `yesUsd` / `noUsd` / `otherUsd`, the sample and valued counts, and `top10SharePct`. `positionValueUsd` (`:99`) is shared with the weight, so a holder that cannot be priced is excluded from both rather than counted as zero.

Copy names the sample and nothing else: "Of the **20** largest tracked holders this market returned — not of Yes, and not of the market. Polymarket has many more holders than any one page of them."

*Tests:* `prediction-record.test.ts` "1.2.6 …" — the recorded 20-holder page, the empty sample (nulls, never zeros), a one-sided sample with an unpriceable holder, and a balanced sample with a third outcome landing in `other`.

### 1.2.7 — both sides of the book, for free

New backend module `apps/web/lib/polymarket/clob.ts`: `GET https://clob.polymarket.com/book?token_id=…`, one request per outcome token, with the same discipline as `apps/web/lib/intel/resolve-pair.ts` — one fixed public origin, `AbortSignal.timeout(8_000)`, `redirect: "error"`, a 200-entry bounded cache and in-flight dedupe. Token ids are validated as decimal uint256 before they reach the URL. Replay serves `fixtures/nansen/clobBook.json`. The extension never touches it.

`predictionBookSection` (`apps/web/lib/intel/depth.ts:321`) now takes the **slug**, reads `clobTokenIds` and the outcome names off the Gamma market the card already resolved and cached for an hour (so no extra lookup), and returns 15 levels a side with `cumulative` computed from the touch outward. `DEPTH_SECTION_CREDITS.predictionBook` is **0**, so the tab prints `free` through the existing `depthCostLabel`.

The 1-credit page this replaced asked for `per_page: 40` with no ordering and came back 40-of-40 `('No','buy')` — one outcome, one side, so `bestAsk` and the spread were structurally null and the spread line never rendered. The card now shows both outcomes, both sides and a real spread.

`cumulative` was parsed and never read before this round; the depth bar is now scaled on it, so a bar's length reads as "this much rests between the touch and here" rather than as a per-level size the eye has to add up. Each side states its total: "11,422 resting across the shown bids, 17,634 across the asks."

**Finding from the capture:** the readout's `91.1¢ / 92.4¢` and the book's `91.6¢ / 91.7¢` legitimately disagree — Gamma's touch is an hourly snapshot, the CLOB's is live. Rather than hide one, the Book tab states its own read time and says so: "Book read 3m ago; the price above it is Polymarket's hourly snapshot, so the two touches can differ." That also puts `snapshotIso` on screen, which was otherwise computed and dropped.

*Tests:* `prediction.test.ts` "reads one CLOB book per outcome token and produces a real spread" (both outcomes, ordering, monotonic cumulative, a positive spread, zero Nansen calls), "the section costs nothing, and the tab says so", "an outcome with no book drops out and the other still renders", "a market with no order-book tokens says so rather than failing the tab", "only a decimal CLOB token id ever reaches the URL"; `prediction-round-1-2.test.tsx` "the depth bar is scaled on cumulative size", "prints its price as free, not as a credit".

### 1.2.8 — cap the holder fan-out and buy a real record

`mapLimit(keys, 4, …)` over up to 20 holders is now capped at the **10 largest** (`prediction.ts:267`, `HOLDER_RECORD_CAP` at `:122`) and calls `prediction-market/address-summary` instead of `pnl-by-address`. Worst case per card: **5 + 10 = 15 credits, down from 25** — and a chip on an outcome-less or settled market still spends nothing.

The record is `HolderRecord` (`signals/prediction.ts:17`): `pnlUsd` (settled only), `winRate`, `marketsWon`, `marketsTraded`, `walletAgeDays`, `settledMarkets`. `predictionSignals` takes `records` in place of the old `pnl` map and weights by `record.pnlUsd > 0` — **the same rule as before**, on a cleaner number.

The evidence line states what was bought rather than implying a long history: `prediction-market/address-summary · realized_pnl_usd > 0 · "6 proven of 10 checked"`.

**Calibration gate — not closed, and deliberately not approached.** The fixture wallet is **+$13.8K lifetime at a 12.2% win rate across 558 markets**, which a naive `win_rate > 0.5` rule would classify as a loser. `win_rate`, `markets_won` and `markets_traded` are therefore **rendered and never read by a rule**; `docs/CALIBRATION.md` §8.2.2 and §8.2.3 record what deriving a win-rate threshold, or a minimum-record gate, would require. A core test asserts the weight still comes from money and not from the win rate.

*Tests:* `prediction.test.ts` "a 20-holder response issues at most 10 address calls…" (also asserts the ten bought are the ten largest, and that holder 20 has no record), "the signal's evidence states what was bought, never a longer record than that", "holders with no record carry no weight, and the card still renders them"; `prediction-record.test.ts` "takes realized PnL, never the total that mixes in the open judged position", "an address the summary has never seen is a record we do not have, not a record of zero", "a wallet with a high settled PnL and a 12% win rate still weighs by money, not by win rate".

## Craft pass

Three of these came out of opening the captures, not out of reading the diff.

- **Twelve readout tiles do not fit a 440px card.** The first capture put five cramped tiles a row with "7d change" wrapping onto two lines and its dash orphaned below, and `Resolves` broken across four. The compact card now states **six** — Bid, Ask, Spread, 24h volume, Liquidity, Resolves — in two even rows of three; the expanded card states all thirteen over three rows of five. The compact set is what a reader needs before a trade: what it costs to get in, how deep it is, and when it settles.
- **The expanded book stretched to 1280px**, putting half a screen of empty bar between a price and its size. `.tw-book` is capped at 760px in the expanded card.
- **A prediction card said "token".** `defaultFinding` (`apps/extension/lib/ui/Panel.tsx:99`) hardcoded "None of your rules fired on this **token**" for every card kind; perp and prediction cards now say "market". One line, and it was on screen the whole time.
- Resting totals round to whole shares: `11,422` rather than `11,422.18`.
- New CSS is tokens only. `.tw-pm-state` is a statement of state, not an alarm — it never wears the block red, and a resolved market's icon is `--tw-text-3`. The smallest new type is `0.6875rem` (11px, the floor); the disclosure button is 24px tall; `Gavel`, `CircleSlash`, `ChevronRight` and `BookOpen` are Lucide; no emoji; every figure carries `tw-fig`.
- The disclosure chevron rotates 90° in 140ms on `--tw-ease-out`, with a `prefers-reduced-motion` path that removes the transition.

## Verification

- `pnpm verify`: typecheck clean; **core 229, web 206, extension 530** tests passed (220 / 189 / 506 before the round).
- `pnpm -F web build` and `pnpm -F extension build`: both OK.
- `TRIPWIRE_E2E_PORT=3217 pnpm verify:e2e`: **18 passed, 4 capture-only specs skipped.** Port 3000 is held by a server this session did not start and was never touched.
- Captures: `TRIPWIRE_CAPTURE=1 TRIPWIRE_E2E_PORT=3217 pnpm -F extension exec playwright test -c e2e/playwright.config.ts captures` — 4 passed. **New:** `prediction-card`, `prediction-holders`, `prediction-book`, produced by a new `prediction card captures` spec that runs the content script against the repo's own captured `polymarket.com` event DOM (`apps/extension/test/fixtures/venues/polymarket.html`). **Regenerated:** `x-badge-card-polymarket`, which had no generator at all before this round — the committed file dated from 2026-09-17 and had drifted away from what the code renders. Every capture in the run was opened and checked against its name.
- `git diff --check`: clean.

## Notes for the next round

- **2.2's page-size work is now safe to sequence.** Raising `top-holders` from 20 to 100 no longer multiplies the per-address fan-out, because the fan-out is capped independently of the page size. It *does* widen the gap between "holders shown" and "holders with a record", which the Proven-winners copy already states.
- **The event picker (2.2) can reuse `PredictionMarket`.** `eventSlug` and `eventTitle` already cross the bridge, so the sibling-market fetch has its key without a second parse.
- `prediction-market/ohlcv` and the CLOB `prices-history` chart (2.2) can reuse `clobTokenIds` from the same cached resolution the Book tab reads; neither needs a new lookup.
- `recordFromPnlRows` is exported and covered but has no production call site after 1.2.8. It is the only shape that can state *how many* settled markets a figure covers, which §8.2 will need; if the measurement run does not use it, delete it rather than leaving it.

## ADR-worthy (text for `docs/DECISIONS.md`, not written there)

**The prediction Book tab reads Polymarket's CLOB, not Nansen.** `prediction-market/orderbook` costs 1 credit and, as called, returned one outcome and one side — the recorded page is 40 of 40 `('No','buy')` — so `bestAsk` and the spread were structurally null and the card suppressed its own spread line. `GET clob.polymarket.com/book?token_id=…` is unauthenticated, free, and returns one outcome token's whole book. Two requests replace one credit and answer a question the paid call could not. The wrapper and its fixture were deleted rather than kept: a priced call with no call site is a trap. The request goes through the backend with `resolve-pair.ts`'s discipline (fixed origin, 8s timeout, `redirect: "error"`, bounded cache, in-flight dedupe) and the extension never talks to Polymarket directly. The trade-off accepted: the book's touch and Gamma's cached touch can disagree, and the card states both read times rather than picking a winner.

**A settled prediction market is shown, not refused — and costs nothing.** `judge()` resolves a closed market and carries its state; the card renders its holders and trades labelled historical, and `predictionSignals` returns `null`, so the verdict is UNCHECKED. A chip on a settled market returns before any Nansen call (0 credits instead of 15), because the side comparison those credits buy cannot exist once the market has settled. Refusing outright would have thrown away the only honest thing left to show; scoring it would have asserted something about a decision nobody can still make.

**The prediction card's proven-winner record is settled money only, and win rate is rendered but never ruled on.** `realized_pnl_usd` from the 1-credit `address-summary` replaces a sum of `total_pnl_usd` over every `pnl-by-address` row including the open position in the market being judged (measured: $14,337.53 against $16,815.68 on the recorded wallet). The verdict mapping is unchanged. `win_rate` ships as a rendered fact and as nothing else: the recorded wallet is +$13.8K lifetime at a 12.2% win rate across 558 markets, so a carried-over `> 0.5` threshold would classify one of the sample's largest winners as a loser. Deriving that threshold — and re-measuring whether 50/70 still hold under the new record — is a measurement run, specified in `docs/CALIBRATION.md` §8.

---

# Round 1.4 — pages that rendered nothing, and the one-click hole

Branch `feat/cockpit-ui`. Nine items, all shipped. Net credit effect is **negative**: 1.4.1 stops a recurring 6-credit spend on a market that does not exist, and every other item turns a page that answered nothing into one that answers.

## 1.4.1 — Hyperliquid spot pairs stop burning perp credits

`COIN_PATH_RE` (`apps/extension/lib/adapters/hyperliquid.ts:16`) is now anchored to a **single** path segment, and a second, deliberately loose `TRADE_PATH_RE` (`:8`) keeps `match()` firing so a spot page still gets an adapter — without one it would get no answer at all rather than a coverage answer. `/trade/PURR/USDC` and `/trade/@107` both return a null target, so `perp-screener` (1) plus `tgm/perp-positions` (5) are no longer spent per coin per 2 minutes on a perp market that does not exist.

`readGap` (`:120`) names the venue: **"No onchain data for PURR on Hyperliquid spot"**.

**Deviation from the brief, stated:** the brief pointed at `OTHER_CHAIN_NAMES["999"] = "HyperEVM"`. These pages are HyperCore spot, which is not HyperEVM — labelling one as the other would trade a silent waste for a confident error, which is the failure class this round exists to remove. The label is `Hyperliquid spot` (`:23`). A spot **index** (`@107`) carries no ticker, so the line names no symbol rather than inventing one.

*Tests:* `test/venue-round-1-4.test.ts` "1.4.1" — six cases including `/trade/ETH` unchanged, the adapter still matching a spot pair, and the HIP-3 `xyz:TSLA` ruling untouched.

## 1.4.2 — Birdeye

`birdeye.so/token/<mint>?chain=solana` answers **308** to `/<chain>/token/<mint>` and drops the param, so the old `TOKEN_PATH_RE` matched nothing and every Birdeye token page resolved to null. `CHAIN_TOKEN_PATH_RE` (`birdeye.ts:12`) reads the chain out of the path segment, which is now the only chain signal. The pre-308 form is **not** kept: it would only be reachable by defaulting a chain, which the `pancakeswap.ts` ruling forbids. An unmapped slug goes to `readGap` (`:30`).

*Tests:* `adapters.test.ts` "tier 2: birdeye" (4 cases) and `venue-round-1-4.test.ts` "1.4.2".

## 1.4.3 — Uniswap `/explore/tokens/<chain>/<address>`

`EXPLORE_TOKEN_PATH_RE` (`uniswap.ts:19`) reads the chain and the exact contract out of the path, and `readGap` (`:65-69`) short-circuits to the coverage answer before the swap form's symbol branch can ever run. The card no longer says **"Select a network to check DEGEN"** on a URL that literally reads `base/0x4ed4…`.

**Decision on the strip, as the brief asked.** No explore-specific gate. Gating the display would not have saved a credit: the spend follows from resolving a target, not from which display renders it, and the runner already falls back to the Dock whenever `anchor()` finds nothing. Withholding the strip where the page *does* carry Uniswap's own `review-swap` button would have left a real trade button unblocked to save nothing.

*Tests:* `venue-round-1-4.test.ts` "1.4.3", including an explicit assertion that the headline never reads "Select a network".

## 1.4.4 — `jup.ag/tokens/<mint>`

`TOKEN_PATH_RE` (`jupiter.ts:12`) is in `match()` and `readTarget`, so Jupiter's canonical token page resolves. `jup.ag/*` was already a tier-1 match, so **no manifest change**.

**Deferred, as the brief required:** no blocker. `anchor()` (`jupiter.ts:66`) returns null on `/tokens/*`, because `formAnchor()` finding the right button there is unverified and a block screen over the wrong control is worse than no block. `VenueAdapter.anchor` gained an optional `url` (`types.ts`), passed by the runner (`runner.tsx:99,120,202`) — so this is a stated page rule, not a `doc.location` sniff. The page gets the Dock and the full card. Promotion waits on a capture in `test/fixtures/venues/`.

*Tests:* `venue-round-1-4.test.ts` "1.4.4", including that `/swap` still anchors.

## 1.4.5 — 1inch moved · **MV3 HOST PERMISSION CHANGE**

> **`https://1inch.com/*` is a new host permission.** It is added to `TIER2_MATCHES` (`lib/venues.ts:19`), which `wxt.config.ts` feeds into both `content_scripts.matches` and `web_accessible_resources.matches`. Verified in the built `manifest.json`. **This re-prompts every installed user and triggers a Chrome Web Store re-review.** It is the only permission change in this round, and the reason 1.4.5 is M rather than S.

`app.1inch.io` **stays** in the match list and stays parsed: the 301 means that host's content script sees a redirect, not a page, so removing it buys nothing and breaks live deep links. `oneinch.ts:14` matches both hosts; `parseDst` (`:32`) reads the current `?dst=<chainId>:<address>` form and `parseHashSwap` (`:18`) keeps the legacy hash route.

**`dst=501:<base58>` is treated as unverified and says nothing.** 501 is not in `EVM_CHAIN_IDS`, and "no onchain data on this network" would be *false* if 501 is Solana, which Tripwire covers. `uncoveredChainGap` is called without the numeric fallback (`:58`), so 1inch stays silent there. Matcha and CoW, which are EVM-only, do get the fallback.

*Tests:* `venue-round-1-4.test.ts` "1.4.5", including an assertion on the match list itself so the permission cannot be dropped silently.

## 1.4.6 — PancakeSwap `?chain=bsc`

PancakeSwap gets **its own map**, `PANCAKESWAP_CHAIN_NAMES` (`chains.ts:35`), spread from Uniswap's plus the `bsc -> bnb` alias, and the param is now lowercased (`pancakeswap.ts:24`). Its home chain resolved to nothing before this. Taking the other option — aliasing `bsc` into `UNISWAP_CHAIN_NAMES` — would have put a spelling Uniswap never writes into Uniswap's own vocabulary; birdeye and dexscreener already own their maps.

*Tests:* `venue-round-1-4.test.ts` "1.4.6" covers **both** call sites, including that `app.uniswap.org/swap?chain=bsc` still yields null.

## 1.4.7 — `DDEGEN`

`readTokenSymbol` (`chains.ts:342`) walks the deepest text leaves instead of reading `textContent`, which concatenates an MUI avatar's one-letter monogram onto the ticker. A leaf whose first word is a single character is skipped while a longer leaf exists (a monogram is always one letter); a genuinely one-character symbol standing alone is still read. Placeholders are skipped leaf by leaf, so `Select token` beside `DEGEN` now reads `DEGEN`. **Not `innerText`:** it forces layout on every tick of the venue loop and happy-dom does not implement it, so the tests could not see what shipped. The fix is in the shared helper, so **all seven call sites** (`jumper.ts:13,24,50,58`, `uniswap.ts:57,62,68`) get it at once; the fake `{ textContent }` element `jupiter.ts:62` passes is handled by a `querySelectorAll` capability check.

`test/fixtures/venues/jumper.html`'s Receive selector is now the real nested shape (avatar leaf + ticker leaf), so the fixture reproduces the bug — its `textContent` still reads `DDEGEN` and the adapter now reads `DEGEN`. `venue-gaps.test.ts:105` flipped with it.

*Tests:* `venue-round-1-4.test.ts` "1.4.7" (5 cases, including the Uniswap call site with a nested selector) plus the updated `venue-gaps.test.ts`.

## 1.4.8 — tier-2 adapters get `readGap`

New shared helper `uncoveredChainGap` (`lib/adapters/gap.ts:23`), wired into **birdeye**, **dexscreener** (`:41`), **gmgn** (`:30`), **pancakeswap** (`:28`), **matcha** (`:25`) and **cow** (`:29`) — the six whose URL names a chain. Two rules keep the line honest:

- **A slug for a chain Tripwire covers is never a coverage answer.** `isCoveredChainSlug` (`chains.ts:268`) unions every venue map, so `pancakeswap.finance/?chain=solana` stays quiet instead of announcing that Tripwire has no Solana data.
- **A chain we cannot name is silence, not a claim.** The `chain <id>` fallback is opt-in per venue (`numericIdsAreEvm`), granted to matcha and cow because an unrecognised id there is certainly an EVM chain, and withheld from 1inch for the reason in 1.4.5.

`OTHER_CHAIN_SLUGS` (`chains.ts:155`) was **checked against Dexscreener's live chain rail**, read from dexscreener.com on 2026-09-20: 64 chains, 9 of them already covered. All uncovered slugs are now named (arc, beam, conflux, flare, flowevm, fuse, manta, megaeth, movement, multiversx, plasma, polkadot, stable, stacks, stepnetwork and xrpl were added after the read). `chainLabel` consults the slug map too, so one vocabulary serves every venue — which is why `uniswap?chain=zksync` now reads "zkSync Era" rather than "zksync".

**Found while wiring gmgn:** `gmgn.ai/tron/token/<tron address>` fell through to `scanPathForAddress`, and a Tron address is valid base58 — so the dock answered with a **Solana** target for it. `gmgn.ts:24` now returns null when the path names a chain outside coverage, before the scan can guess.

Not served, per the brief: axiom, photon, bullx (no chain signal), raydium (Solana-only), aerodrome (Base-only).

*Tests:* `venue-round-1-4.test.ts` "1.4.8" (7 cases), including a regression guard that asserts every slug on the recorded live rail is either covered or named.

## 1.4.9 — pump.fun quick-buy chips (M)

`blockedExtras(doc)` on `VenueAdapter` (`types.ts`), implemented by pump.fun (`pumpfun.ts:72`) as every visible, enabled button whose **`aria-label`** matches `Quick buy|Quick sell`. The enclosing `[role=group][aria-label="Quick buy"]` is deliberately not used: a container listener would swallow clicks on anything else that lands inside it and break `blocker.ts`'s own "friction on the button itself" contract. `anchor()` still excludes the chips — they are not the form's primary action.

`createElementSetBinding` (`anchor-binding.ts:73`) is `createAnchorBinding`'s contract for a **set**: each element bound once, each re-synced on `isConnected`, `unbindAll()` on teardown. `createBlockBinding` (`displays.tsx:300-317`) owns one, installs a separate `installBlocker` per chip, and exposes `syncExtras`; the runner stores it (`runner-state.ts:46`, `runner.tsx:125`) and calls it from `resyncAnchor()` (`:200`), which is the same per-tick path the trade button's own rebind rides. The extras are bound only while the anchor is bound — a block session, not the page — so a verdict change or a target change releases them with everything else.

**The block screen now covers what it blocks.** `computeBlockRect` takes `extraRects` and unions them with the anchor before its existing grow-upward logic (`overlay.ts:19,36`). On the recorded pump.fun geometry the chips sit at y=442 and y=473, *below* a primary at y=390 — so a block that only grew upward left three one-click trades visible and looking clickable underneath it. Capture: `.impeccable/review/block-pumpfun-quick-buy.png`.

**Bug found and fixed during the e2e run:** the first cut did `{ ...anchorRect }` to copy the anchor's rect. A live `DOMRect` keeps its values in prototype accessors, so the spread yielded `{}`, every bound went NaN and the block rendered at the page's top-left corner at its natural size. `overlay.test.ts` now has a `DOMRect`-specific regression case; the unit tests had all passed on plain objects.

`/explore` is **not** covered, per the brief (24 mints x 13 credits): `pumpfunAdapter.match` is still `/coin/<mint>` only.

*Tests:* `venue-round-1-4.test.ts` "1.4.9" (3 cases), `anchor-binding.test.ts` "createElementSetBinding" (5 cases, including that a bound chip's click never reaches the venue while an unrelated button's does), `overlay.test.ts` (4 cases). E2E: `e2e/pumpfun-block.spec.ts` — with a rule firing, a real pointer click and a dispatched click at a chip are both intercepted, the block rect covers the quick-sell row, the primary stays blocked, an unrelated button still works, and after an SPA re-render of the chip row the new nodes are bound again. The rebind rides the runner's MutationObserver tick, so the spec polls for it rather than asserting on the next frame — the same latency the trade button's own rebind has always had, now stated.

## Verification

- `pnpm verify`: typecheck clean; **core 255, web 230, extension 621** tests passed (621 from 599 before the round).
- `pnpm -F web build` and `pnpm -F extension build`: both OK.
- `TRIPWIRE_E2E_PORT=3218 pnpm verify:e2e`: **19 passed, 4 capture-only specs skipped** (18 passed before the round). Port 3000 is held by a server this session did not start and was never touched.
- Captures: `TRIPWIRE_CAPTURE=1 TRIPWIRE_E2E_PORT=3218 ... captures` — 4 passed, plus the new `block-pumpfun-quick-buy`. Opened `strip-jumper-sui`, `strip-uniswap-native`, `block-evidence` and `block-pumpfun-quick-buy`; the first three are unchanged, which is the expected result — no capture's page carries a nested token selector or an extra blocked control.
- No UI copy is new in this round: every gap line is the copy already written at `venues.content/format.ts:52-55`.

## Notes for the next round

- **`jup.ag/tokens/<mint>` needs a capture** before `installBlocker` can be wired there. It is the only half of 1.4 deliberately left undone.
- **The swap page's native-coin gap is ordered before its chain gap.** `uniswap.ts:80` returns `missing-chain` for a selected native ETH with no chain in the URL, so the strip reads "Select a network to check ETH" and only says "ETH is the chain's native asset" once a network is picked. Pre-existing, outside 1.4's list, one line to reorder.
- **`VenueAdapter.anchor` now takes an optional `url`.** Any adapter that needs a per-page anchor rule can state it without reading `doc.location`.
- **`blockedExtras` is general.** Any venue with a one-click trade control beside its form can implement it and inherit the blocker, the re-sync and the block geometry.
