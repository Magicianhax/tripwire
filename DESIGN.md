---
version: 2
name: "Tripwire / Nansen Operate"
description: "Nansen intelligence at the point of action: near-black data surfaces, mint signal, and explicit red or amber risk"
colors:
  ground: "#06080B"
  panel: "#0B1016"
  raised: "#111821"
  border-neutral: "rgba(255,255,255,0.08)"
  border-strong: "rgba(255,255,255,0.16)"
  text: "#FFFFFF"
  text-secondary: "rgba(255,255,255,0.60)"
  text-tertiary: "rgba(255,255,255,0.40)"
  mint: "#00FFA7"
  mint-dim: "rgba(0,255,167,0.12)"
  mint-line: "rgba(0,255,167,0.40)"
  danger: "#FF5A6E"
  danger-dim: "rgba(255,90,110,0.12)"
  warning: "#F5B83D"
  warning-dim: "rgba(245,184,61,0.12)"
  signal-ink: "#03140D"
  glow: "#061A1F"
  scrim: "rgba(0,0,0,0.60)"
typography:
  display:
    fontFamily: "Sora"
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: normal
  display-web:
    fontFamily: "Sora"
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  body-md:
    fontFamily: "Inter"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "Inter"
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Inter"
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.3
  label-sm:
    fontFamily: "Inter"
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.3
  data:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
    fontFeature: "tnum, zero"
rounded:
  pill: 16px
  card: 12px
  tile: 8px
  overlay: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  verdict-pill:
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    borderColor: "{colors.border-strong}"
  tile:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.tile}"
  expanded-overlay:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.overlay}"
    backdropColor: "{colors.scrim}"
  primary-action:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.pill}"
---

## Overview

Tripwire is a Nansen product surface placed directly into X, trading venues, and local operating pages. It should read as intelligence from the same system as Nansen's tables: a near-black ground, dense but calm data, mint for verified positive state and interaction, and red or amber only when risk requires attention. It rejects the retired Hazard system, generic navy crypto dashboards, purple glow, glassmorphism, and emoji labels.

The first useful object is a compact verdict chip under a post or above a venue action. Selecting it opens evidence in a body-level floating card rather than changing the host page's layout. Every card can expand into a larger desktop overlay without switching to a separate content implementation.

## Colour

- **Ground and surfaces:** `ground` is the page and overlay world, `panel` is the main card, and `raised` is for controls, tiles, skeletons, and hover states. Neutral structure is always a one-pixel `border-neutral` or `border-strong` hairline.
- **Mint `#00FFA7`:** CLEAR, positive figures, selected tabs, links, focus, and primary actions. Mint fills use `signal-ink`; body copy never sits directly on the bright fill.
- **Red `#FF5A6E`:** TRIPWIRE, negative values, and blocking state. A block screen is a red-bordered Nansen card, not a yellow hazard sign.
- **Amber `#F5B83D`:** CAUTION, confirm-before-weakening actions, and recoverable problems.
- **Neutral state:** UNCHECKED and LOADING use secondary text, a raised surface, and a dashed border. They must never resemble CLEAR.
- **Text:** primary white, 60% secondary, and 40% tertiary are the only normal hierarchy steps. Tertiary text is reserved for sufficiently large or nonessential content; interactive and small explanatory copy uses the secondary token.
- **Depth:** floating cards use `0 16px 40px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)`. The only decorative gradient is the faint `glow`-to-transparent wash at a card's top edge. Loading skeletons may use a functional raised-to-shimmer sweep.

Verdict state never relies on hue alone: TRIPWIRE and CAUTION are filled, CLEAR is outlined, and UNCHECKED/LOADING are dashed. Positive and negative chart series also have labels, signs, or distinct geometry.

## Typography

- **Inter** is the UI and numeric face. All figures use tabular numerals, but they stay in Inter so data tables feel like Nansen rather than a terminal.
- **Sora** is the geometric display face for card headings, page headings, wordmarks, and verdict words.
- **JetBrains Mono** is limited to addresses, hashes, backend URLs, and exact machine identifiers.
- The extension registers packaged WOFF2 files once per host document under Tripwire-only family names. Popup and web app fonts are packaged too; no third-party font request is allowed at runtime.
- `label-sm` at 11px is the absolute floor. Ordinary UI copy is 12–15px, card headings are 18px, and the local web display heading is 36px.

## Shape, spacing, and iconography

- Pills and buttons use the 16px pill radius. Cards use 12px, inner tiles and inputs use 8px, and the expanded modal shell uses 24px.
- The spacing scale is 4 / 8 / 12 / 16 / 24px. Dense rows may use measured intermediate values when needed to align text or icons, but component gaps and outer gutters come from the scale.
- Use Lucide icons at a 1.5px stroke. Use bundled official venue, chain, and Nansen SVG marks with provenance; use the Nansen token image when available through the local backend, otherwise a neutral monogram.
- Never use emoji as an icon or substitute a generic glyph for an available official logo.

## Compact and expanded cards

### Compact

- The anchored evidence card is 440px wide, never wider than the viewport minus 32px, and stays 16px inside the viewport. It opens below its trigger, flips above when needed, or opens beside a block screen so it does not cover the warning.
- Height is capped at `min(70vh, 640px)` with internal scrolling. It follows its anchor on scroll and resize and closes when the anchor leaves the viewport.
- Header order is identity (token/chain logo, symbol/name, address or age), verdict pill, optional replay tag, expand, close. The finding is the first sentence below it.
- Dense evidence uses Nansen-style rows, thin 4px data bars, tabular signed values, and source/error copy that names the endpoint.

### Expanded

- Expanded mode is a centred desktop overlay at `min(1280px, 80vw)`, capped at `min(880px, 80vh)`, on a 60% black scrim. At narrower desktop windows it uses 92vw. It has a 24px shell and no backdrop blur.
- Expanded mode reuses the same header, tabs, state, and body components. It changes layout and row limits: two columns where useful, 320px charts, larger findings, and longer tables. It is not a second information architecture.
- Expanding by itself does not spend credits. Paid depth remains behind a tab whose price is visible before activation. Cheap expanded-only sections also appear as explicit tabs rather than silently fetching on expand.
- The user's compact/expanded preference is remembered per card kind. Collapse returns to the anchored card; Escape or a backdrop click closes it.

Tripwire is desktop-only. Design and review at 1280, 1440, and 1920px; support desktop windows down to roughly 1100px. Existing narrow or bottom-sheet code is legacy resilience, not a mobile product direction, and no new phone layouts, touch-only affordances, or mobile captures should be added.

## Tabs and evidence depth

- Tabs are a real WAI-ARIA tablist with automatic activation, a single tab stop, wrapping arrow-key navigation, and Home/End support. The selected tab uses mint text and a 2px underline.
- The tab strip is always one row and can scroll horizontally. It must not wrap into a second navigation row.
- Spot starts with Flow, Wallets, and Risk; expanded mode adds Holders as an explicit lazy tab.
- Perps deliberately keep four compact tabs: Positioning, Liquidations, Traders, and Chart. Chart is a first-class trading view, not secondary decoration. The 440px strip tightens its gaps and hides tab icons when needed; scrolling is preferable to clipping or wrapping.
- Prediction starts with Proven winners, Holders, and Trades; expanded mode adds the order book as an explicit lazy tab.
- Base evidence remains one atomic response. Deeper sections load only when their tab requests them, merge into the existing card, and can fail independently. A venue error must not erase Nansen evidence or another venue's result.
- Hyperliquid, Binance, Bybit, OKX, dYdX, and other public market APIs are backend-only. Each integration is isolated and best-effort; content scripts never call a third-party venue directly.

## Loading and failure states

- A card shell opens in the same frame as the click, before evidence resolves. It uses what is already known in the header and reserves each pending section's eventual space.
- Skeleton shapes match their destination: 20px gauges, 52px figure tiles, 28px table rows, and 132px compact or 320px expanded charts. This prevents collapse-and-expand layout shift.
- Skeletons use raised 8px blocks and a 1.2s shimmer. Under `prefers-reduced-motion` they remain visible but static.
- The card exposes `aria-busy` and one concise live loading announcement; screen readers do not hear every decorative skeleton.
- The atomic base response replaces its initial skeleton set together; lazy paid/depth sections replace their own skeleton independently. A failed section becomes a named reason line—it never leaves an indefinite spinner or turns a missing answer into CLEAR.

## Core components

- **Verdict chip:** Nansen mark, verdict pill, and one truncated finding in a single 30px-minimum line. It is a button with `aria-expanded` and `aria-haspopup="dialog"`.
- **Verdict plate:** filled red TRIPWIRE, filled amber CAUTION, outlined mint CLEAR, dashed neutral UNCHECKED/LOADING. Core's `verdictPlate()` is the shared mapping for extension and web.
- **Floating card:** the shared shell for token evidence, venue evidence, author badges, and wallet lens. Only one card is open in a content-script world at a time.
- **Block screen:** a red-bordered card over the venue action with the rule hits, a kind-specific evidence action, “Not trading is the safe move.”, and the typed override flow. Evidence opens beside it where space permits.
- **Strip and dock:** a compact verdict, finding, rule or Details action, and official venue mark. The strip sits above the whole trade-action row; the dock stays visually below the block screen.
- **Popup:** fixed 360px toolbar surface with status, rules preset, local links/backend URL, and wallet-lens site permissions. It uses the same colour, type, radius, and focus tokens.
- **Local web pages:** 1200px content container, quiet sticky nav, dense hairline tables, stat rows, rule groups, and mint primary actions. They share the extension tokens rather than inventing a dashboard theme.

## Host-fit invariants

- Content-script UI renders in React inside a Shadow DOM. Host-page CSS must not leak in, and Tripwire must not rely on inheritance from WXT's `:host { all: initial !important }`; every text-bearing component sets a trustworthy colour and component roots set type.
- A mounted strip or block may never widen a venue card or create host-page horizontal scroll. Measure the narrowest usable ancestor content box, publish it as `--tw-fit-width`, and update it with `ResizeObserver`.
- When a venue puts its trade button in a horizontal flex or grid row, lift the Tripwire strip above the row before mounting it. Do not squeeze the strip beside the button.
- Below a 320px **anchor width** (not viewport width), the strip may stack its finding while keeping verdict, logo, and Details usable. This is embedded-host resilience, not a mobile layout.
- Floating evidence belongs at body level and uses fixed positioning. It must never be an inline expansion that changes a tweet, form, or trade card's height.

## Accessibility and interaction

- Compact cards are labelled non-modal dialogs. Expanded cards are modal, trap focus, and have an inert-looking visual scrim. Focus starts on the heading; Escape and the close button restore it to the trigger. An outside click closes without stealing focus.
- Keys used in the card never reach host-page shortcuts. Tabs, segmented controls, and copy/actions retain their native keyboard semantics.
- Use a 2px mint focus ring with a visible offset. Interactive targets are at least 24px; primary actions are generally 32–40px.
- Motion communicates entry or state only: the compact card rises 8px and fades over 180ms; expanded mode fades and scales from 0.98 over 180ms. Reduced-motion removes transforms and shimmering while preserving state.
- Never encode meaning only with colour. Pair colour with fill/outline/dash, icon shape, signed text, labels, or geometry.

## Do's and don'ts

- **Do** keep chip mode cheap, show a paid tab's credit price before activation, and preserve card context while a section reloads.
- **Do** keep official marks local, proxy token imagery through the backend, and show a monogram when imagery is unavailable.
- **Do** name the endpoint or source when evidence is missing and keep UNCHECKED visually distinct from CLEAR.
- **Don't** restore Hazard yellow/black stripes, condensed type, cyan, deep navy, purple glow, glass blur, or generic crypto-card decoration.
- **Don't** add emoji, decorative gradients, oversized hero metrics, wrapped tab bars, or mobile-only variants.
- **Don't** fetch third-party data from a content script, spend paid credits merely because a card expanded, or let a surface change the host page's width or document flow.
