# Venue check: tier-1 adapters against live markup

**Date:** 2026-09-17, about 14:45–14:56 UTC.

**Method:** I loaded each page in the Playwright MCP browser (desktop viewport about 1920px) with no wallet and no login. I waited 8–12s for the trade form, then read it with `browser_evaluate`. The only interactions were one side toggle on Hyperliquid, one outcome toggle on Polymarket and one Buy/Sell tab on pump.fun. I clicked no trade, connect or login button, signed nothing and submitted no form.

**Evidence:**
- **Structural snapshots:** `apps/extension/test/fixtures/venues/<venue>-<state>.json`. Each one lists every visible `<button>` and `[role=button]` with its text, state attributes, a 6-level ancestor chain and its rect. They contain no page HTML and no scripts. The pump.fun and Polymarket snapshots are filtered to the header plus the trade form region.
- **Reconstructed fixtures:** `apps/extension/test/fixtures/venues/<venue>.html`, rebuilt from those snapshots.
- **Tests:** `apps/extension/test/adapters-live.test.ts`.

No venue blocked automation. There was no Cloudflare challenge and no geo-block from this location, including Polymarket and Hyperliquid.

"Connected" behaviour is **inferred**. The tests relabel the same element (same testid, class and position) that held the logged-out label. Nobody connected a wallet.

## Jupiter: fixed

- **URL:** `https://jup.ag/swap/SOL-EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm`. **Reachable.**
- **URL rewrite:**
  - The path form is not honoured. Within about 8s the page rewrote itself to `/swap?buy=EPjF…Dt1v(USDC)&sell=So11…112`, the site's default pair, and the WIF pair was lost. `/swap/So11…112-EKpQ…` was rewritten the same way (`buy=SOL&sell=USDC`).
  - `https://jup.ag/swap?sell=So11…112&buy=EKpQ…` keeps the URL and loads $WIF.
  - The adapter already parses `?buy=`, so it follows whatever the URL settles on. The README demo link now uses the query form.
- **Logged-out primary button:** `Connect`. It is a `<button type="button">` in `form > div.mt-4`, and the form holds the "Sell amount" input.
  - There are two more `Connect` buttons outside the form: one in the header and one in the positions panel.
- **Old adapter:** it matched only `/^(swap|place order)$/` page-wide, so the anchor was **null** when logged out.
- **Now:** the adapter takes the last `Swap | Place order | Connect | Connect wallet` button inside a `<form>` that holds an input. The old page-wide `Swap`/`Place order` match is kept as a fallback.
  - The header and panel `Connect` buttons never match, and the tests check this.
- **Side/outcome:** not applicable. The Market/Limit/DCA toggles are `aria-pressed` and are never matched.
- **Remaining risk:**
  - The connected label is assumed to be `Swap`. If Jupiter shows another enabled label (for example "Insufficient SOL"), there is no anchor and the block falls back to the dock.
  - The path form `/swap/<in>-<out>` is still parsed. For a moment it gives a target that the page then abandons, but the URL poll re-reads it.

## pump.fun: fixed

- **URL:** `https://pump.fun/coin/HVWaFa5HTbX3hSju8rGkjVrVcYT1dPUUHBCug45zpump` (JAX, picked from the homepage). **Reachable.**
  - The first coin I tried hung on navigation for 60s and a second mint loaded. The homepage has no `a[href*="/coin/"]` links; I took the mints from the page source.
- **Logged-out primary button:** `Connect wallet to trade`. It is a `<button aria-pressed="false">` in the trade `<section>`, which also holds:
  - the `role=tablist` with the `Buy`/`Sell` tabs (`role=tab`, `aria-selected`)
  - the "Amount in USD" input
  - `Quick buy $25/$100/$250` and `Quick sell 25/50/100%` chips
  - The header has `Sign in` (`data-testid=sign-in-button`).
  - Every pump.fun button carries `aria-pressed="false"`, so `aria-pressed` alone does not mean a toggle here.
- **Old adapter:** it looked for `Place trade`, else an exact `Buy` next to an input. The only `Buy` is the tab, which `isNavigation` rejects, so the anchor was **null**.
- **Now:**
  - The adapter looks for a rendered Buy/Sell tablist, walks up at most 5 levels to the panel that holds an input, and takes the last button there matching `Connect wallet to trade | Place trade | Buy | Sell | Buy <TICKER> | Sell <TICKER>`.
  - It skips tabs, radios, `aria-selected`/`aria-checked` controls and `Quick buy`/`Quick sell` chips.
  - The old logic is kept as a fallback, and it now also skips tabs.
  - The anchor is unchanged after switching to the Sell tab.
- **Side:** not applicable (spot).
- **Remaining risk:**
  - The **quick-buy chips are one-click trades when connected** and are not blocked, only the primary button is.
  - The mobile layout (a hidden duplicate panel) was not captured. The `isVisible` check should skip it in a real browser; happy-dom can't model it.

## Uniswap: works, test added

- **URL:** `https://app.uniswap.org/swap?chain=base&outputCurrency=0x4ed4e862860bed51a9570b96d89af5e1b0efefed`. **Reachable.** The URL was kept and the output shows DEGEN.
- **Logged-out primary button:** `Get started`. It is a `<button data-testid="review-swap">`.
  - The nav has its own `Get started` (`data-testid=navbar-connect-wallet`), and a wallet modal shows `Create account` and `Log in`.
  - Almost every other control is a `div[role=button]`.
- **Old adapter:** it already preferred `[data-testid="review-swap"]`, so it matched the right button. No code change.
- **Side/outcome:** not applicable.
- **Remaining risk:** if Uniswap renames the testid, the fallback `/^swap$/` finds nothing when logged out.

## Jumper: fixed

- **URL:** `https://jumper.exchange/?toChain=8453&toToken=0x4ed4e862860bed51a9570b96d89af5e1b0efefed`. **Reachable, but it redirects to `https://jumper.xyz/?toChain=8453&toToken=…`**, keeping the query.
- **Logged-out primary button:** `Connect wallet`. It is a `<button data-testid="widget-transaction-button">` in the LI.FI widget.
  - The header has its own `Connect`, and the nav buttons sit inside `<a>`.
  - The widget tabs `Swap & Bridge`/`Private`/`Gas` are `role=tab`.
  - A welcome screen shows `Get started`.
- **Old adapter:**
  - `match()` accepted only `jumper.exchange`, so **the adapter never ran**. The content script's `matches` didn't include `jumper.xyz` either.
  - Even on the right host, the whole-label regex missed `Connect wallet`.
- **Now:**
  - `jumper.xyz` is added to `match()` and to `TIER1_MATCHES`, which covers the manifest content-script matches and web-accessible resources.
  - The anchor prefers the visible, enabled `widget-transaction-button`, whatever its label. The old nav-safe regex is kept as a fallback.
- **Side/outcome:** not applicable.
- **Remaining risk:** Chrome needs the rebuilt extension to pick up the new host. The widget button may be disabled in some connected states ("Enter amount"); then there is no anchor and it falls back to the dock.

## Hyperliquid: fixed

- **URL:** `https://app.hyperliquid.xyz/trade/ETH`. **Reachable** (not geo-blocked here).
- **Logged-out primary button:** `Connect`. It is a `<button class="sc-ftTHYK hIwQDy">` in the order-form container, which also holds `Cross`/`20x`/`Unified` and the size inputs.
  - The header has its own `Connect` (`sc-ftTHYK dfFRVV`), further up the tree.
  - `Deposit`/`Withdraw` sit elsewhere.
- **Side toggle:**
  - `Buy / Long` | `Sell / Short` are **plain divs with no ARIA and no button**.
  - With Long selected, the label reads `sc-UpCWa iEmiSs left` and the slider `… left`. After clicking Sell / Short, the short label reads `sc-UpCWa iEmiSs right`, the long label loses `left`, and the slider becomes `… right`.
  - The button labels didn't change between the two states (still `Connect`).
- **Old adapter:** it matched `buy|sell|long|short|place order` on `<button>`s and read side from ARIA toggle buttons. The anchor was **null** and the side was **undefined**.
- **Now:**
  - **Side:** read from the live labels first. `Buy / Long` with the class token `left` means long; `Sell / Short` with `right` means short. If both or neither are marked, the old ARIA and submit-text logic runs, then `undefined`.
  - **Anchor:** walks up at most 8 levels from the toggle label to the first ancestor that holds a non-toggle `Connect | Enable Trading | Place Order | Buy… | Sell… | Long… | Short…` button. It takes a `type=submit` button there if one exists, else the last match.
  - The old page-wide logic is the fallback. It never includes `Connect`, so the header button can't match.
- **Remaining risk:**
  - The `left`/`right` tokens are semantic, but they are still styling classes.
  - The connected labels (`Place Order`, `Enable Trading`) are inferred.
  - Only the desktop layout was captured.

## Polymarket: fixed

- **URLs:** market page `https://polymarket.com/event/friedrich-merz-out-as-chancellor-of-germany-before-2027/friedrich-merz-out-as-chancellor-of-germany-before-2027`, and the same event without the market slug. **Reachable** (no geo-block page from this location).
  - Homepage links also use `/event/<event>?marketSlug=<market>&outcomeIndex=0|1`. Loading one strips `outcomeIndex`, keeps `marketSlug`, and presets the form to that market and outcome (checked on `fed-decision-in-october-…?marketSlug=will-there-be-no-change-…`, where No was preselected).
- **Logged-out primary button:** `Trade`. It is a `<button class="trading-button">`, and its text is rendered twice for a roll animation, so `textContent` is `TradeTrade`.
  - The header has `Log in`/`Sign up`.
- **Trade form:**
  - `Buy`/`Sell` are `role=radio` in a radiogroup.
  - `#outcome-buttons` is a `role=radiogroup` with `Yes21¢`/`No80¢` (`role=radio`, `aria-checked`, `data-state=checked`, also `.trading-button`).
  - There are amount chips `+$1…+$100`.
  - The Trade button's nearest shared ancestor with the outcome group is 8 levels up.
- **Event page:**
  - Per-market rows carry `Buy Yes6¢`/`Buy No95¢` `<button>`s.
  - The form defaults to the first market, with Yes checked.
  - Clicking No changed only `aria-checked`/`data-state`. The URL and the Trade label stayed the same.
- **Old adapter:**
  - **Anchor:** a page-wide `findButton(/^(buy|trade)/)` whose last match happened to be `TradeTrade`. It would have picked the `Buy` radio if the Trade button were missing.
  - **Outcome: broken.** `/^yes\b/` does not match `Yes21¢`, because there is no word boundary between `s` and `2`. The scope depth of 4 was also too shallow for the real depth of 8.
  - **Slug:** `?marketSlug=` was ignored, so the event slug was sent.
- **Now:**
  - **Yes/No match:** `/^yes(?![a-z])/`, `/^no(?![a-z])/`.
  - **Anchor:** when a Yes/No radiogroup is present, it is the nearest non-toggle Buy/Trade button within 5 levels of that group. Otherwise it is the last non-toggle Buy/Trade button page-wide. It is never the Buy/Sell radios or the rows' Buy Yes/No buttons.
  - **Scope:** the outcome scope depth is 10.
  - **Slug:** path market slug, else `?marketSlug=`, else the event slug.
- **Remaining risk:**
  - An event page without a market slug sends the event slug. The backend's single-market / "Pick a market" rule still applies, even though the form has silently preselected the first market.
  - The connected label (`Buy Yes`, etc.) is inferred.
  - The shared-ancestor depths (3 from the group, 8 from the button) are tight margins that will need a re-check if Polymarket restructures the form.

## Verification

- `pnpm -F extension test`: 25 files, 229 tests passed.
- `pnpm -F extension typecheck`: clean.
- `pnpm -F extension build`: built. The manifest matches include `https://jumper.xyz/*`.
- `pnpm verify:e2e`: 4/4 passed.
