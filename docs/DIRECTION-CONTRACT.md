---
version: 1
slug: "apps-extension-lib-ui"
primary_target: "apps/extension/lib/ui"
related_targets: ["apps/web/app","apps/extension/entrypoints"]
---

# Tripwire overlay UI + local pages (Operate)

Scope: extension UI kit (chip, floating popover card, block screen, strip, dock, popup, author badges) and the local web pages (/, /rules, /ledger, /history).
Audience/job: a trader mid-scroll on X or mid-swap on a DEX needs a verdict in one glance and the evidence one click away; it must read as a native extension of Nansen's product, not a third-party skin over it.
Constraints: overlays sit on dark third-party pages; never block on missing data; floating popovers (never inline expansion), wide cards (440px clamp).
User feedback history: rejected black/white Hazard (inline panels, clamped cards); rejected deep navy/purple Glass Cockpit as AI slop; pinned: "match Nansen", proper logos for everything, icons instead of emojis, readable text colours.

## Direction contract
THESIS: Tripwire looks and feels like a Nansen product surface dropped into X and DEXs: Nansen's near-black ground, mint signal, and data-table craft, so the verdict reads as Nansen intelligence, not a third-party widget. Refuses generic navy crypto cards, purple glow, and emoji labels.
OWN-WORLD: Ground #06080B, panel #0B1016, raised #111821, hairline rgba(255,255,255,0.08); a faint dark-teal glow (#061A1F→transparent) only at the top edge of popover cards; text #FFFFFF, secondary rgba(255,255,255,0.6), tertiary rgba(255,255,255,0.4); Nansen mint #00FFA7 for CLEAR/positive/primary actions (dark ink #03140D text on mint fills); red #FF5A6E for TRIPWIRE/negative; amber #F5B83D for CAUTION; UNCHECKED neutral rgba(255,255,255,0.6) on #111821 with dashed hairline. Inter for UI (tabular numerals for figures), a geometric display face for headings and verdict words, JetBrains Mono only for addresses/hashes. Radii: 16px pill buttons and chips, 12px cards, 8px inner tiles. Lucide icons at 1.5px stroke. Official venue/chain/brand logos as bundled SVGs; token logos from Nansen token info or a monogram. Data bars like Nansen's tables: thin 4px rounded bars, green/red split.
STORY: Chip under the post = a Nansen-style pill (logo mark + verdict + finding). Click → wide floating card beside it with verdict pill, one finding sentence, Flow/Wallets/Risk tabs with Nansen-table rows and token/chain logos. Author badges next to the username (Nansen-labeled, Hyperliquid, Polymarket) open a compact stats card. On venues, the block screen is a red-bordered Nansen card with evidence and "Not trading is the safe move."
FIRST VIEWPORT: 440px card: header row (token logo + $SYMBOL + chain logo + age | verdict pill | close icon), finding sentence 15px white, tabs (Flow · Wallets · Risk) mint underline, 5 rows (icon + label | 4px split bar with threshold tick | signed value in red/mint), footer "Powered by Nansen" mark + endpoints count.
FORM: User-pinned "match Nansen" brand world (canon translated to Nansen's own grammar); supersedes seed 7636b70d's Glass Cockpit pick.
SIGNATURE INTERACTION: Popover rises 8px + fades in 180ms from the chip; verdict pill counts in its value once; reduced-motion shows instantly.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
