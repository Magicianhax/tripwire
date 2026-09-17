---
version: alpha
name: "Tripwire"
description: "Industrial safety signage dropped onto trading sites: silent until there is danger, then impossible to miss"
colors:
  primary: "#0B0B0B"
  secondary: "#8C8C8C"
  accent: "#FFD400"
  surface: "#0B0B0B"
  surface-raised: "#161616"
  success: "#3FBF7F"
  danger: "#FF5A36"
typography:
  display:
    fontFamily: "Archivo"
    fontSize: 3rem
    fontWeight: 900
    lineHeight: 0.88
    letterSpacing: -0.01em
  h2:
    fontFamily: "Archivo"
    fontSize: 1.375rem
    fontWeight: 800
    lineHeight: 1.1
  body-md:
    fontFamily: "Archivo"
    fontSize: 0.875rem
    fontWeight: 450
    lineHeight: 1.45
  label:
    fontFamily: "Archivo"
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.3
  data:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
    fontFeature: "tnum, zero"
rounded:
  sm: 3px
  md: 6px
  lg: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 32px
components:
  chip-tripwire:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  block-screen:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "#EDEDED"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  strip-clear:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.success}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
---

## Overview

The reference is industrial hazard signage: a yellow-and-black barrier tape across a doorway. Tripwire lives on top of other people's interfaces (X, Jupiter, Hyperliquid), so it stays silent and dark until a rule fires. When one does, the block screen is the single loud object on the page. Everything else (panels, CLEAR strips, neutral chips) is ink and grey.

## Colors

- **`accent` #FFD400:** means one thing: danger (CAUTION or TRIPWIRE). It's never used for decoration, links or brand moments.
- **`primary`/`surface` #0B0B0B ink:** backs the panels. Body text #EDEDED on ink is 16:1, and ink on yellow is 14:1.
- **`secondary` #8C8C8C:** for labels only, at 6.0:1 on ink.
- **`success` #3FBF7F:** used only for the CLEAR state text.
- **`danger` #FF5A36:** used only for negative flow numbers inside neutral panels, never as a fill.
- **UNCHECKED:** uses `secondary` on `surface-raised`. It must never look like CLEAR.

## Typography

- **Faces:**
  - Archivo (variable width, OFL) for display and UI, with the display set at width 62–75%.
  - JetBrains Mono (OFL) for every number, always `tabular-nums slashed-zero`.
- **Loading:** fonts are packaged inside the extension (`public/fonts`, woff2) and the web app, never fetched from Google at runtime on third-party pages.
- **Fallbacks:** `system-ui` and `ui-monospace`.

## Layout

- **Chip:** single line, 24px tall, sits under the post's text.
- **Panel:** 360px wide slide-out inside the post column (X) or docked 360px on the right edge (tier 2).
- **Block screen:** matches the anchor button's box, with a minimum height of 180px; it expands upward over the form.
- **Web pages:** 1080px max width, a dense two-column grid on `/ledger`, and no card grids.

## Elevation & Depth

- **Borders over shadows:** 1.5px `accent` borders on danger surfaces, and 1px `#2A2A2A` on neutral surfaces.
- **Shadows:** a single `0 8px 24px rgba(0,0,0,.45)` is allowed only on floating overlays (panel, dock) so they separate from the host page.
- **Not allowed:** glass, blur or gradients, except the 45° hazard stripe (repeating-linear-gradient), which is a pattern, not a gradient fill.

## Shapes

- **Radius tokens:**
  - `sm` for chips, strips and inputs
  - `md` for panels and dock
  - `lg` for the block screen (it matches venue button radii)
- **Segment bars:** square ends.

## Components

- **Verdict chip:**
  - TRIPWIRE: yellow key cell + ink value cell
  - CAUTION: ink with yellow border
  - CLEAR: ink with green text
  - UNCHECKED: grey
  - Loading: a 1s pulse on the key cell, disabled under `prefers-reduced-motion`
- **Panel:** header (display h2), flow split bars (center-zero), buyers/sellers lists, netflow row, risk list, sparkline. Empty and error states name the Nansen endpoint that failed.
- **Block screen:**
  - hazard stripe (14px), "TRIPWIRE" in display type, up to 3 hits (a square bullet, a sentence, a mono value)
  - override input with a typed phrase, plus an "Evidence" button
  - focus ring 2px ink with a 2px offset
- **Strip:** 32px line above the anchor for CAUTION, UNCHECKED and CLEAR.
- **Icons:** none. Text labels only.

## Do's and Don'ts

- **Do:**
  - Every color, size and space value traces to a token in this file.
  - Motion only answers state changes: 150ms ease-out, with a `prefers-reduced-motion` path.
  - The CLEAR state is quiet.
- **Don't:**
  - Use yellow for anything but danger.
  - Add gradients (other than the hazard stripe), glassmorphism, glow or numbered section markers.
  - Use ALL-CAPS eyebrows (display words TRIPWIRE and CAUTION are the only caps).
  - Use pure #FFF text on ink; use #EDEDED.
