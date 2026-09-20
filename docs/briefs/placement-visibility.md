# Placement and visibility (controller brief)

User report (2026-09-20): "one more thing u can add into dexscreener positions of banners we are showing are on odd places like someone cannot catch without having good eye".

Problem: on DexScreener (and likely other dense venue pages) the injected strip/dock/marker lands somewhere technically valid but visually lost — a corner of a dense grid, below the fold of a panel, or beside an element nobody looks at. The verdict is the product; if it takes a good eye to find it, it failed.

## Principles
1. **Anchor to what the user is looking at, not what is easiest to find.** On a token page that is the token header (name/price row) or the trade panel — not a table cell or a footer widget.
2. **One primary placement per page, not several weak ones.** If a page shows both a token header and a trade form, pick the trade form when a trade is possible, the header otherwise; never mount both.
3. **Visible without hunting:** the mounted element must be inside the first viewport for the page's default scroll position at 1440×900, or the chip must be pinned where the eye already goes (immediately adjacent to the token identity).
4. **Never mounted inside a scrolling data grid row**, a virtualised list, or an element the site re-renders on every tick.

## Work
- **Audit placement per venue** with the Playwright harness at 1440×900: for each tier-1 and tier-2 venue, capture where our element lands and whether it is inside the first viewport and adjacent to the token identity or trade action. Record a table (venue, current anchor, in-viewport y/n, verdict) in the report.
- **DexScreener specifically:** the page is a chart + a data panel + a pairs table. The correct anchor is the token/pair header (symbol, price, chain badge) at the top of the chart panel — a strip directly under it, full width of that panel. Not the pairs table, not the bottom toolbar. Verify against the live DOM.
- **Add an `anchorPriority` to each adapter**: an ordered list of candidate anchors (trade button → trade panel header → token identity header → page header), with the runner taking the first that exists, is visible, and is inside the first viewport; fall back to the dock only when none qualify.
- **Make the dock unmissable when it is the fallback**: it already sits at the right edge — give it an entrance that plays once (slide + fade, 180ms, reduced-motion respected) and a verdict-coloured left edge so it reads at a glance, without becoming a permanent flashing thing.
- **Add a "where is it?" affordance**: clicking the extension icon highlights the mounted element on the page for ~1.5s (outline pulse), so a user who cannot find the verdict can always locate it.
- **Tests:** per-venue placement tests asserting the chosen anchor is the expected element and that its bounding rect is inside a 1440×900 viewport at default scroll; a test that only one primary surface mounts per page.
- **Captures:** `placement-<venue>.png` for each tier-1 venue plus DexScreener, each showing the full page at 1440×900 with the element visible.

## Constraints
Keep the anchor-fit and lift-out-of-row rules, desktop only, no emoji, bundled logos, Nansen theme. Do not cover the site's own primary action with anything except the block screen (which is deliberate).
