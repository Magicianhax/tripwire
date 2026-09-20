---
name: "Tripwire"
description: "Nansen intelligence at the point of action: a near-black data ground, mint for verified and positive, red and amber only when risk earns them"
colors:
  ground: "#06080B"
  panel: "#0B1016"
  raised: "#111821"
  line: "rgba(255,255,255,0.08)"
  line-strong: "rgba(255,255,255,0.16)"
  glow: "#061A1F"
  scrim: "rgba(0,0,0,0.60)"
  shimmer: "rgba(255,255,255,0.06)"
  text: "#FFFFFF"
  text-2: "rgba(255,255,255,0.60)"
  text-3: "rgba(255,255,255,0.40)"
  ink: "#03140D"
  mint: "#00FFA7"
  mint-dim: "rgba(0,255,167,0.12)"
  mint-line: "rgba(0,255,167,0.40)"
  red: "#FF5A6E"
  red-dim: "rgba(255,90,110,0.12)"
  red-line: "rgba(255,90,110,0.45)"
  amber: "#F5B83D"
  amber-dim: "rgba(245,184,61,0.12)"
  amber-line: "rgba(245,184,61,0.45)"
typography:
  display:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  wordmark:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
  alarm:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
  verdict:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
  finding:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
  label-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "tnum, zero"
  figure:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  overlay: "24px"
  pill: "16px"
  card: "12px"
  tile: "8px"
  inline: "6px"
  logo: "4px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "40px"
components:
  verdict-plate-filled:
    backgroundColor: "{colors.red}"
    textColor: "{colors.ink}"
    typography: "{typography.verdict}"
    rounded: "{rounded.pill}"
    padding: "0 8px 0 6px"
    height: "22px"
  verdict-plate-outlined:
    backgroundColor: "{colors.mint-dim}"
    textColor: "{colors.mint}"
    typography: "{typography.verdict}"
    rounded: "{rounded.pill}"
    padding: "0 8px 0 6px"
    height: "22px"
  verdict-plate-dashed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text-2}"
    typography: "{typography.verdict}"
    rounded: "{rounded.pill}"
    padding: "0 8px 0 6px"
    height: "22px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "3px 12px 3px 6px"
    height: "30px"
  chip-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    width: "min(440px, calc(100vw - 32px))"
    height: "min(70vh, 640px)"
  card-expanded:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.overlay}"
    width: "min(1280px, 80vw)"
    height: "min(880px, 80vh)"
  tile:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    typography: "{typography.figure}"
    rounded: "{rounded.tile}"
    padding: "6px 10px"
  strip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "3px 4px 3px 8px"
    height: "32px"
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.ink}"
    typography: "{typography.finding}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "40px"
  button-primary-disabled:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "40px"
  button-quiet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-override:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.red}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.tile}"
    padding: "0 12px"
    height: "36px"
  tab:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
    height: "36px"
  tab-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.mint}"
    typography: "{typography.body}"
    height: "36px"
  nav-link:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  nav-link-active:
    backgroundColor: "{colors.mint-dim}"
    textColor: "{colors.mint}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  badge:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    size: "18px"
  wallet-marker:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.inline}"
    padding: "2px"
    size: "18px"
---

# Design System: Tripwire

## Overview

**Creative North Star: "The Nansen Terminal, Dropped Into Someone Else's Page"**

Tripwire is not a widget that visits X and a DEX; it is a piece of Nansen's own product that arrives at the moment money is about to move. The ground is Nansen's near-black (`#06080B`), the surfaces are two quiet steps up from it, structure is drawn with one-pixel white hairlines at 8% and 16%, and the only bright colour in a calm state is mint. Density is high and the voice is flat: a verdict word, one sentence of finding, then Nansen-style rows of labelled figures with thin split bars. Nothing decorates; every coloured pixel is a value, a state, or a control.

The world is disciplined because it is a guest. Every content-script surface renders in React inside a Shadow DOM on a hostile page, so each component sets its own colour rather than inheriting one, and no surface is allowed to widen the venue card it sits in. Evidence is always a floating, body-level card — never an inline expansion that changes a tweet's or a trade form's height. The same card grows into a centred desktop overlay without switching to a second information architecture.

The build rejects the two worlds that came before it: the Hazard system (yellow-on-ink, stripes, condensed display type) and the "Glass Cockpit" (deep navy, purple glow, blur). It also rejects generic crypto-card decoration, emoji labels, and any hue-only encoding of state.

**Key Characteristics:**
- Near-black tonal layering (`ground` → `panel` → `raised`) with hairline borders; no drawn dividers heavier than 1px except a state border.
- Mint is the only ambient accent; red and amber appear only when a rule fires or a figure is negative.
- Inter for everything readable, with tabular numerals everywhere a figure appears; Sora only for headings and verdict words; JetBrains Mono only for addresses and hashes.
- One radius family: 16px pills, 12px cards, 8px tiles, 24px for the expanded overlay.
- Lucide icons at an absolute 1.5px stroke and bundled official brand marks; no glyph substitutes, no emoji.
- Desktop-only. Reviewed at 1280 / 1440 / 1920px, supported down to roughly 1100px.

## Colors

A near-black data ground carrying one bright signal hue, with red and amber held in reserve for risk.

### Primary
- **Nansen Mint** (`{colors.mint}`): CLEAR verdicts, positive figures and flows, the selected tab and its 2px underline, links, focus rings, the "safe move" line, primary actions, the caret in every text input, and the selection highlight (at 12% as `mint-dim`). `mint-line` (40%) is the hairline version used for hover borders and the CLEAR plate's edge.
- **Signal Ink** (`{colors.ink}`): the near-black green-cast text colour used *on* a mint, red or amber fill. Body white never sits on a bright fill.

### Secondary
- **Tripwire Red** (`{colors.red}`): TRIPWIRE verdicts, the block screen's border and band, negative values and sell-side bars, and error status. `red-dim` (12%) tints the band and hovered override button; `red-line` (45%) is the softer border used on a red-state chip, strip or popover.
- **Caution Amber** (`{colors.amber}`): CAUTION verdicts, confirm-before-weakening rows on the local pages, and recoverable problems (a block screen's own error line is amber, not red — red is reserved for the block itself).

### Neutral
- **Ground** (`{colors.ground}`): the page background of the local web pages, and the fill of text inputs inside a card (an input reads as a well cut into the panel).
- **Panel** (`{colors.panel}`): every card, popover, block screen, strip, chip, table and the popup body. The main working surface.
- **Raised** (`{colors.raised}`): figure tiles, skeletons, hover states, segmented tracks, the dashed UNCHECKED plate, badges and wallet markers.
- **Hairline** (`{colors.line}` / `{colors.line-strong}`): 8% white for internal rules — table rows, tab strip underline, section splits; 16% white for a component's own outer edge and for scrollbar thumbs.
- **Text** (`{colors.text}` / `{colors.text-2}` / `{colors.text-3}`): pure white for the thing being said; 60% white for labels, metadata and secondary controls; 40% white exists but is reserved for large or genuinely non-essential type — several places in the build deliberately step back up to 60% because 40% does not clear the contrast floor at small sizes.
- **Glow** (`{colors.glow}`): the single gradient in the system, a dark-teal wash fading to transparent over the top 96px of a card (140px when expanded).
- **Scrim** (`{colors.scrim}`): the 60% black behind the expanded overlay. Flat, never blurred.
- **Shimmer** (`{colors.shimmer}`): the lit pass of a loading skeleton's sweep.

### Named Rules
**The Never-Green-For-Unknown Rule.** Missing data is UNCHECKED, and UNCHECKED is neutral: 60% white on `raised` behind a dashed 16% border. It may never borrow mint, and it may never be styled to look like a pass.

**The Shape-Before-Hue Rule.** No state is told apart by colour alone. TRIPWIRE and CAUTION plates are filled, CLEAR is outlined, UNCHECKED and LOADING are dashed; each verdict carries its own Lucide shape (UNCHECKED is a dashed circle, never the CLEAR shield); signed figures carry their sign and their own geometry.

**The Ink-On-Fill Rule.** Text on any mint, red or amber fill is `{colors.ink}`. White on mint and white on amber are both banned.

## Typography

**Display Font:** Sora (packaged; falls back to Inter, then `system-ui`)
**Body Font:** Inter (packaged; falls back to `system-ui`)
**Mono Font:** JetBrains Mono (packaged; falls back to `ui-monospace`)

**Character:** Inter does all the reading and all the arithmetic — `font-feature-settings: "tnum"` is set on every component root, so columns of figures never jitter. Sora appears only where the product speaks in its own voice: a card heading, a page heading, the wordmark, and the uppercase verdict word. JetBrains Mono is a forensic tool, not a texture: addresses and hashes only, with slashed zeroes.

All three faces ship inside the extension as WOFF2. In content scripts they are registered once per host document under Tripwire-prefixed family names ("Tripwire Inter", "Tripwire Sora", "Tripwire Mono") so their rules can never restyle the host page; the popup and local pages load the same files from `@fontsource`. No font is ever fetched from a third-party origin at runtime.

### Hierarchy
- **Display** (Sora 600, 36px/1.1, -0.02em): the local web pages' page heading only.
- **Wordmark** (Sora 700, 22px): "Tripwire" in the nav bar and popup head.
- **Headline** (Sora 600, 18px/1.2): a card's title — the token symbol, venue or wallet identity.
- **Alarm** (Sora 700, 18px/1.1, +0.04em): the block screen's "TRIPWIRE", in red.
- **Verdict** (Sora 600, 12px/1, +0.04em, uppercase): the verdict plate's word. This is the only uppercase type in the system.
- **Finding** (Inter 500, 15px/1.4): the one-sentence finding under a card header (17px in the expanded card), and the local pages' body copy.
- **Body** (Inter 400/500, 14px/1.45): default UI text, tabs, hit lines, buttons, table cells.
- **Body-sm** (Inter 500, 13px/1.3): chips, strips, section titles, row text, dense evidence — the workhorse size inside a 440px card.
- **Label** (Inter 500, 12px/1.3): tile labels, metadata, rule text, footnotes, venue columns.
- **Label-sm** (Inter 500, 11px/1): the absolute floor — replay tags, monograms, chart axis text, cost tags.
- **Data** (JetBrains Mono 400, 13px, tabular + slashed zero): addresses and hashes.
- **Figure** (Inter 600, 14px, tabular): the value in a readout tile; `[data-sign]` colours it mint, red or 60% white.

### Named Rules
**The 11px Floor Rule.** Nothing renders below 11px (0.6875rem) — including SVG chart labels. If a layout needs smaller text, the layout is wrong.

**The Tabular-Always Rule.** Every figure is tabular. Figures stay in Inter rather than moving to the mono face: this is a Nansen data table, not a terminal.

**The Sora-Sparingly Rule.** Sora is for the heading, the wordmark and the verdict word. A sentence, a label, a row or a button never uses it.

## Layout

Content-script surfaces are sized by their host, not by a page grid. The anchored evidence card is `min(440px, 100vw - 32px)` wide and capped at `min(70vh, 640px)` tall with internal scrolling; it opens below its trigger, flips above when it must, stays 16px inside the viewport, follows its anchor on scroll and resize, and closes when the anchor leaves the viewport. The expanded card is a centred overlay at `min(1280px, 80vw)`, content-sized between `min(420px, 60vh)` and `min(880px, 80vh)`, dropping to `92vw / 88vh` below 1100px — the narrowest desktop window supported. Its tab panel becomes a two-column grid (`minmax(420px, 1fr) 1fr`, 24px gutter); the window control, wide tables and charts span both columns. Charts are 132px compact, 320px expanded.

The spacing scale is 4 / 8 / 12 / 16 / 24px, plus 40px for web page-block rhythm. 16px is the card's gutter and the default gap between sections; 12px is the tab strip gap and a panel's vertical padding; 8px and 4px handle intra-component gaps. Dense rows use measured in-between values (6px, 10px, 14px) where a row must align to an icon or a figure; outer gutters and section gaps always come from the scale.

The local pages are a single 1200px container with a 24px gutter, a sticky 64px nav on the ground colour with a hairline bottom, 40px of top padding, and a two-column grid only on `/ledger` above 960px. Popup is a fixed 360px column with 16px padding.

### Named Rules
**The Anchor-Fit Rule.** A mounted surface may never widen its host or create host-page horizontal scroll. `fit.ts` measures the narrowest usable ancestor content box, publishes it as the custom property `--tw-fit-width` on the shadow host (a custom property survives WXT's `:host { all: initial !important }` reset), and every mounted surface caps itself at it, updated by `ResizeObserver`.

**The Lift-Out-Of-Row Rule.** When a venue lays its trade button out in a horizontal flex or grid row, walk up out of that row and mount the strip *above* the whole row. Never squeeze the strip into a column beside the button.

**The Narrow-Anchor Rule.** Below a 320px **anchor** width — measured on the anchor, never on the viewport — the host gets `data-narrow` and the strip stacks: logo, verdict and Details stay on row one, the finding takes row two, the rule text is dropped. This is embedded-host resilience, not a mobile layout. (It is an attribute, not a container query, because `container-type: inline-size` would make every mounted host a containing block for the fixed-position evidence card.)

**The Body-Level Evidence Rule.** Floating evidence lives at body level with fixed positioning. It is never an inline expansion that changes a post's, form's or trade card's height.

## Elevation & Depth

Depth is tonal first: three near-black steps (`ground` → `panel` → `raised`) plus hairline borders do almost all the structural work, and surfaces sit flat inside a card. Shadow appears only on something that has genuinely left the page: the floating evidence card, the dock chip and the block screen. It is a soft ambient double-shadow, never an offset or hard-edged one. The expanded overlay dims the page with a flat 60% scrim and deliberately does **not** blur it — a viewport-sized compositor layer on every venue is not worth the effect.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 16px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)`): anything body-level and floating — evidence card, dock chip, block screen.
- **Block ring** (`+ 0 0 0 1px rgba(255,90,110,0.12)`): added under the block screen only, a red halo that reads as a stopped state.

### Named Rules
**The One-Gradient Rule.** The system has exactly one decorative gradient: the `glow`-to-transparent wash across the top 96px of a card (140px expanded). The only other gradient permitted is functional — the skeleton's raised → shimmer → raised sweep.

**The No-Blur Rule.** No `backdrop-filter` anywhere. Depth is tone, hairline and one soft shadow.

## Shapes

One radius family, applied by size of object rather than by taste: 16px pills for anything that reads as a control or a token of state (buttons, chips, strips, verdict plates, tabs' focus targets, nav links, badges, scrollbar thumbs), 12px for cards, popovers and block screens, 8px for inner tiles, inputs, skeleton rows and segmented cells, and 24px for the expanded overlay shell only. Two small literals recur below the scale: 6px for inline marks (wallet marker, tooltip, token image, the typed-phrase tile) and 4px for venue/chain logo squares and focus-ring corners. Token logos are 28px circles; a monogram on `raised` behind a 16% hairline stands in when no image exists.

Borders carry state, fills carry severity. A component's resting edge is a 1px 16%-white hairline; a TRIPWIRE surface swaps it for red (full red on the block screen, `red-line` on a chip, strip or popover), CAUTION for amber. Dashed borders mean "not verified or not available": the UNCHECKED plate, the disabled override button, an empty local-page panel, and the premium-call button all use a dashed 16% edge rather than reduced opacity, so a locked control stays legible.

Data geometry is Nansen's: 4px rounded bars on a hairline track for row flows, a 12px allocation bar, a 7px PnL track, gauge fills that grow from a centre zero line with a threshold tick, and long/short splits with labelled ends.

## Components

### Buttons
- **Shape:** fully pilled (16px), never square.
- **Primary (local pages):** mint fill, ink text, 15px Sora-free semibold, 40px tall, 24px side padding; hover is `filter: brightness(1.08)`, never a colour change. Disabled becomes a `raised` fill with a dashed 16% border and 60% text — a locked control, not a faded one.
- **Quiet / secondary:** transparent or `raised` fill, white text, 16%-white border, 36px tall.
- **Danger-adjacent (weakening an existing protection):** amber fill with ink text, 36px — amber, not red, because the user is confirming, not being blocked.
- **Override (block screen):** red 1px border, red text, transparent fill, 36px; disabled until the phrase is typed, and disabled state is a dashed neutral border.
- **Premium / paid:** a dashed mint-text pill, 24px tall, that states its credit price in its own label before it can be pressed.
- **Focus:** always a 2px mint outline with a 1–2px offset.

### Chips
- **Verdict chip (X timeline):** a `panel` pill with a 16%-white border, 30px minimum height, 13px text, holding the Nansen mark, the verdict plate and one truncated finding. It is a `button` with `aria-expanded` and `aria-haspopup="dialog"`. Border turns `red-line` for TRIPWIRE and `amber-line` for CAUTION; hover lifts the fill to `raised`; the finding drops to 60% white for UNCHECKED and LOADING.
- **Verdict plate:** the shared state token, 22px tall, Sora 12px uppercase with +0.04em, with a Lucide verdict icon. Filled (TRIPWIRE red / CAUTION amber, ink text), outlined (CLEAR, mint on `mint-dim`), dashed (UNCHECKED and LOADING, 60% white on `raised`). Core's `verdictPlate()` is the single mapping shared by extension and web.
- **Replay tag:** a transparent 20px pill with a 16% border and 11px 60%-white text.

### Cards / Containers
- **Corner style:** 12px anchored, 24px expanded.
- **Background:** `panel`, over a top-edge `glow` wash; border 16% white, or `red-line` / `amber-line` in a fired state.
- **Shadow:** Float (see Elevation).
- **Internal padding:** 16px gutter; header is 56px minimum with a 10px gap; tab panels are 12px top / 16px sides and bottom.
- **Header order:** identity (token or chain logo, symbol or name, address or age), verdict plate, optional replay tag, expand, close. The finding sentence is the first line below it. The identity line clips rather than wrapping.
- **Rows:** 32px minimum, an 8% hairline between, last row unruled; a wallet row is a `1fr / 72px / 64px` grid of name, 4px split bar and signed value.
- **Tiles:** `raised`, 8px radius, 6px × 10px padding, 12px 60%-white label over a 14px semibold tabular figure; a "lit" tile takes the red or amber border and tints its fill and text.

### Inputs / Fields
- **Style:** `ground` fill inside a `panel` card (a well, not a raised box), 1px 16% border, 8px radius, 34–36px tall, mint caret.
- **Focus:** 2px mint outline at a 1px offset, and the border goes transparent so the ring is the only edge.
- **Error:** `aria-invalid` sets a red border and a 12px message below; a block screen's own failure message is amber.
- **Native controls:** `<select>` and `<input type=checkbox>` stay native under `color-scheme: dark`, dressed with the same ground/border/radius tokens and `accent-color: mint`.

### Navigation
- **Local pages:** a sticky, quiet 64px bar on `ground` with an 8% bottom hairline, the Sora wordmark on the left, pill links on the right — 36px, 14px, 60% white; hover lifts to white on `raised`; `aria-current="page"` is mint text on `mint-dim`.
- **Card tabs:** a real WAI-ARIA tablist with automatic activation, one tab stop, wrapping arrow keys and Home/End. Sticky to the top of the scroll area on `panel` with an 8% underline; selected is mint with a 2px mint 2px-radius underline; 36px minimum; 12px gap. The strip is always one row — `flex-wrap: nowrap`, horizontal scroll if it must, icons hidden in the compact card before the row is ever allowed to wrap.

### Block Screen (signature)
A `panel` card with a full red 1px border and a red halo, covering the venue's trade action. A `red-dim` band carries the Lucide octagon, "TRIPWIRE" in Sora 18px/700 red, and "Trade blocked by your rules" in 13px white. Below: each rule hit as a 16px icon + text grid with the rule's threshold in 12px underneath, a kind-specific evidence button, "Not trading is the safe move." in mint 14px semibold, then the typed-override row — the phrase set in a `raised` 6px tile inside its own label, an input, and the red Override button that stays disabled until the phrase matches. Evidence opens *beside* the block screen where space permits, so the warning is never covered.

### Strip and Dock (signature)
The strip is a 32px-minimum `panel` pill mounted above a venue's whole trade-action row: verdict plate, a finding that wraps to two lines before it is allowed to clip (full text kept in `title`), an optional 12px rule note, a mint "Details" action (24px minimum), and the official venue mark. The dock is the same chip pinned `fixed` at top-right (16px inset) with the float shadow, one z-layer below the block screen's modal layer.

### Author Badges and Wallet Marker (signature)
An 18px `raised` square-pilled control holding a 14px mark, with a 24px hit target added by a `::after` inset — mint-tinted on hover and while its card is open, mint-bordered when expanded. The wallet marker is injected into a split text node (never wrapping the host's words) and opens the same 440px card.

### Skeletons
Placeholders reserve their destination's exact height — 18px default, 20px gauge, 52px tile, 28px table row, 132px chart (320px expanded) — as `raised` 8px blocks under a 1.2s shimmer sweep. Under `prefers-reduced-motion` they stay visible and go still, because removing them would collapse the reserved space. The card shell, header and reserved sections appear in the same frame as the click; the card exposes `aria-busy` and one concise live announcement rather than narrating every block.

### Motion
Entry and state only. The card rises 8px and fades in over 180ms on `cubic-bezier(0.16, 1, 0.3, 1)`; the expanded overlay fades and scales from 0.98 over the same 180ms; the backdrop fades; a verdict figure counts in once; hovers on markers are 140ms colour moves; spinners are a 900ms linear rotation. Reduced motion removes transforms, shimmer and spin while preserving every state.

## Do's and Don'ts

### Do:
- **Do** derive every colour, radius and space from the tokens in this file's frontmatter; the extension theme, the popup and the local pages all declare the same set, and they must not diverge.
- **Do** set an explicit `color` on every text-bearing component. Nothing inherits colour from the shadow host, whose WXT reset is the browser's black — that was the root cause of the unreadable chip.
- **Do** pair colour with shape: filled / outlined / dashed plates, a distinct Lucide shape per verdict, and signed, labelled figures.
- **Do** keep UNCHECKED neutral, name the endpoint or source when evidence is missing, and let a failed section become a named reason line.
- **Do** cap every mounted surface at `--tw-fit-width` and lift the strip above a horizontal trade row.
- **Do** state a paid section's credit price on the control before it is activated; expanding a card by itself spends nothing.
- **Do** use Lucide at an absolute 1.5px stroke (12/14/16/20px, always `aria-hidden`), bundled official venue and chain SVGs with provenance recorded in `apps/extension/public/logos/SOURCES.md`, and the backend-proxied token image, falling back to a monogram.
- **Do** keep text at 11px or larger, contrast at 4.5:1 or better (checked in Chromium by `test/chip-contrast.test.tsx` against the colour actually painted behind each element), and interactive targets at 24px or larger — 32–40px for primary actions.
- **Do** design and review at 1280 / 1440 / 1920px and support desktop windows down to roughly 1100px.

### Don't:
- **Don't** restore the Hazard world (yellow `#FFD400`, ink `#0B0B0B`, hazard stripes, Archivo, 3/6/10px radii) or the Glass Cockpit (deep navy, purple glow, glassmorphism).
- **Don't** add a gradient beyond the card's top-edge glow and the skeleton's functional sweep, and never add `backdrop-filter`.
- **Don't** use emoji, an icon font, or a generic glyph where an official mark exists; don't let the Nansen mark become Tripwire's own logo — it appears in the "Powered by Nansen" credit and as the inspect marker only.
- **Don't** put white text on a mint or amber fill, or use 40% white for small interactive or explanatory copy.
- **Don't** let a tab strip wrap to a second row, let a card become an inline expansion, or let any surface change the host page's width or document flow.
- **Don't** encode a state with hue alone, and never let a missing answer render as CLEAR.
- **Don't** add mobile layouts, touch-only affordances or phone captures; Tripwire is desktop-only.
- **Don't** introduce a second display face, a condensed face, or `system-ui` as a display font — all three families ship with the extension.

<!--
Not canonized (defects and drift the build carries, recorded here so no future surface inherits them):
- `text-3` (40% white) measures roughly 3.9:1 on `panel` and does not clear the 4.5:1 floor at UI sizes; the build already steps back up to `text-2` in several places. It stays in the token set for large/decorative use only and is NOT a system text colour.
- Legacy narrow paths — `[data-sheet]` bottom sheet, the `max-width: 719.98px` dock move, 600px/800px/960px web breakpoints, and the historical `mobile.png` / `dock-mobile.png` captures — survive from earlier rounds. They are carried resilience, not a mobile design system.
- `impeccable detect` last reported 83 advisory findings (40 colour, 29 radius, 14 font-size) measured against the retired Hazard document plus the e2e host stubs, which imitate venue palettes on purpose. Not re-measured here and not repaired.
- Extension content scripts register the three faces under "Tripwire "-prefixed family names while the popup and web pages load the same @fontsource files under their plain names. Same faces, two registrations; unify only if the fallback chains ever diverge.
-->
