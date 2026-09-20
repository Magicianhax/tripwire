# Lessons

- **Medium confidence — profile links are not always visible name anchors.** Polymarket uses a screen-reader-only stretched anchor and a pointer-events-none visible row. Mount next to the visible name outside its clipping wrapper, restore pointer events in the shadow host, and test real mouse/keyboard clicks rather than only DOM presence.

- **Medium confidence — distinguish failed venue discovery from unavailable provider data.** CHUMP resolved and had Nansen evidence elsewhere; Dexscreener needed its own exhaustive chain map and bytes32 pool-ID support, not an unsupported-token message. Verify both pool formats against the exact returned chain and base contract.
- **Low confidence — financial chart geometry needs browser verification.** SVG aspect ratios can turn readable data into tiny marks. Check actual rendered height, adaptive price precision, keyboard inspection, and adjacent-table layout at compact and expanded sizes.

- **High confidence — a ticker is a discovery query, not a selected trade identity.** X cashtags should open a market choice. A venue's selected chain and contract are hard constraints; never rank another chain into its trade check. Related market exploration must keep that guard state isolated.
- **Low confidence — preserve numeric ticker prefixes.** Market discovery must keep 1INCH and1000PEPE intact; stripping everything before the first letter changes the asset.

- **High confidence — verify native asset identifiers before declaring unsupported coverage.** Nansen indexes native ETH as 0xeeee on Ethereum/Arbitrum/Base/Optimism. A venue's zero marker must be translated, not excluded. Live Arbitrum token info/flows/buyers/sellers all succeeded. This supersedes the earlier decision to skip native ETH evidence.

- **High confidence — inspect which surface is clipped before diagnosing a missing badge.** X can show the badge and open its card correctly while clipping only the absolute-positioned hover label. Put the label in the native top layer and test actual overflow-hidden name containers.

- **Medium confidence — zero-address native markers are selections, not empty forms.** Jumper uses zero for native ETH; treat it as the selected chain's native coin and skip ERC-20 calls. Determine whether the form is empty from its selection UI, not the zero address alone.

- **Medium confidence — local testing servers need an independent lifetime.** A tool-owned foreground process may be gone by the user's next test. Check health before diagnosing missing badges; launch the requested long-lived local server detached with hidden window and logs, then verify after the launching command exits.

- **Low confidence — asset selection is not a trade-check state.** Hide injected trade UI while a venue's token/network picker is open, cancel pending checks, and stay quiet until a destination is selected. Name unavailable networks and assets instead of exposing provider IDs.

## 2026-09-20 live-data and popup corrections

- **Medium confidence — verify identity before reusing recorded data or logos.** Replay fixtures may describe a different address; label samples explicitly and require token identity matches before serving pictures. Version browser and backend caches when correcting previously misattributed assets.
- **Medium confidence — elevated z-index alone is insufficient for host-page overlays.** Use feature-detected native top-layer placement to escape transforms, clipping and independent stacking contexts; keep keyboard/dismissal behavior tested.
- **Low confidence — URL pool identifiers are not token mints.** Resolve Dexscreener's pool via its fixed public API, validate returned chain/pool, preserve Solana mint case, and discard results after navigation.
- **Low confidence — paging beats twenty-row popup tables.** Use a compact data-derived chart and bounded pages instead of an empty summary column next to a long scrolling list; retain accessible overflow as a last resort.

## 2026-09-20 entity coverage correction

- **Low confidence — distinguish replay coverage from live coverage.** A single-entity replay search cannot establish which real accounts match. Verify requested identities with live search and label sample cards as Replay.
- **Low confidence — validate discovery against the live header shape.** X may ship semantic h1/handle rows without its older test IDs; require the adjacent exact handle and current URL identity before attaching.
- **Low confidence — partial HTTP success can still need a retry.** Author responses preserve working venues when entity search fails. Evict those lookup errors and retry within the existing bounded discovery loop.

## 2026-09-19 takeover corrections

- **Low confidence — assert accessibility behavior, not one ARIA attribute.** A control can keep the same browser-computed accessible name while moving from `aria-label` to `aria-labelledby`. Playwright checks should prefer `toHaveAccessibleName` and role/name locators unless a specific attribute is itself the contract.
- **Low confidence — place overlays against every clipping ancestor.** Tooltips inside an `overflow: hidden` popover header must open inward (below the trigger) or escape that clipping context; checking the trigger alone is insufficient.
- **Low confidence — test-data cleanup begins at the first mutation.** Capture/E2E fixtures that create durable records need `try/finally` around the entire mutation-to-capture span, checked cleanup responses, and resource closure protected by its own `finally`.

## 2026-09-20 Jumper correction

- **Low confidence — important precedence reverses across a Shadow boundary.** An outer inline `!important` cannot override an important `:host` reset inside the shadow tree. Reassert host positioning after the reset in the same shadow stylesheet, and verify the computed host styles plus `elementFromPoint` in real Chromium rather than trusting a DOM emulator.

- **Medium confidence — verify inline badges against the host's real wrapper layout.** X may place the name link inside a column flex wrapper. Badge placement needs both same-shadow inline host styling and a horizontal name wrapper; assert the rendered gap and vertical alignment, not just DOM sibling order.
