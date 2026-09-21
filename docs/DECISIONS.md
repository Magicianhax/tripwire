# Decisions

Append-only. Never edit or delete an entry; supersede it with a new one.

---

## ADR-0001 Adopt project template (2026-09-17)
**Status:** accepted
**Context:** Project bootstrapped from `~/.claude/templates/project` during /ship.
**Decision:** `PRODUCT.md`, `DESIGN.md`, `docs/ARCHITECTURE.md` and this log are the durable context; the working plan and per-round briefs stay out of the repository.
**Consequences:** `/ship` reads these first.

## ADR-0002 Tripwire concept and scope (2026-09-17)
**Status:** accepted
**Context:** Nansen Meridian Buildathon. The user rejected dashboards, OSINT, and previously built ideas (Crowd vs Sharks, follow/fade, etc.).
**Decision:** Build a browser extension with a local backend. It shows X post verdicts and blocks trade buttons on tier-1 venues (Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket). Tier-2 venues get a docked panel.
**Consequences:** Venue DOMs change, so adapters are small and tested against fixtures, with a fallback to a docked panel.

## ADR-0003 Local SQLite via node:sqlite (2026-09-17)
**Status:** accepted
**Context:** Needed a cache, ledger and rules store. `better-sqlite3` needs a native build on Windows, and F: is nearly full.
**Decision:** Use Node's built-in `node:sqlite` (Node >= 22.13), with no ORM.
**Consequences:** No native dependency. Node >= 22.13 is required.

## ADR-0004 Nansen key resolution: env first, then Nansen CLI config (2026-09-17)
**Status:** accepted
**Context:** The user already runs the Nansen CLI (`nansen login`), and judges should need minimal setup.
**Decision:** The backend reads `NANSEN_API_KEY`, falling back to `~/.nansen/config.json` `apiKey`. The key is only ever used as the `apikey` header.
**Consequences:** Zero extra setup for CLI users. The fallback is documented in the README.

## ADR-0005 Person intel reduced to exact entity match + holdings (2026-09-17)
**Status:** accepted (supersedes the spec's `shill_dump`)
**Context:** Live check: `search/general` returns entities as `{name, tags}` with no addresses. `profiler/address/current-balance` accepts `entity_name`, but DEX trades need an address.
**Decision:** An X display name or handle is matched exactly (normalized) against Nansen entities, and the panel shows current holdings of the posted token (`author_holds_token`, info only).
**Consequences:** It can't show "sold after posting". There is no wallet guessing.

## ADR-0006 Risk count uses token-specific indicators only (2026-09-17)
**Status:** accepted
**Context:** Live `tgm/indicators` mixes items between `risk_indicators` and `reward_indicators`, and marks `btc-reflexivity` high for majors such as WIF.
**Decision:** `risk_high_count` scans both arrays but counts only `concentration-risk`, `liquidity-risk` and `token-supply-inflation`.
**Consequences:** Fewer false blocks on liquid majors.

## ADR-0007 Visual direction A: Hazard (2026-09-17)
**Status:** accepted
**Context:** The user asked for no terminal or retro look, no editorial look and no AI-generated look, then delegated the choice ("do it all").
**Decision:** Safety yellow on ink, used only for CAUTION and TRIPWIRE. Condensed display type, mono readouts, hazard-stripe block screen. Tokens are in `DESIGN.md`.
**Consequences:** CLEAR and neutral states stay quiet so yellow keeps its meaning.

## ADR-0008 Spec items deferred for the buildathon cut (2026-09-17)
**Status:** accepted
**Context:** The final whole-branch review found spec features that no task built and no decision recorded. The deadline is 2026-09-27, and demo-critical correctness and security fixes come first.
**Decision:** Deferred, not built in v1:
- the rules editor "would have changed N of last checks" preview
- the `/history` price-move-since column
- the X cashtag "N matches" switcher and profile-page person card (person intel shows only inside the post panel)
- `adapter_miss` logging
- live HTML snapshots per venue (adapter tests use hand-built markup plus a Playwright smoke against routed fixture pages)
- the "Budget reached, showing cached data from HH:MM" stale label (budget exhaustion shows UNCHECKED "Nansen credit cap reached")
- per-minute and per-endpoint rate-limit buckets (a 10 rps token bucket plus 429 retry covers the Pro plan)

The default daily credit cap is 3000, not the spec's 300. The Pro plan has ~128k credits, and demo recording plus the 1,000-call goal need headroom.
**Consequences:** README and PRODUCT describe only built behavior. Each item can be added later without schema changes.

## ADR-0009: Author badges are earned by an exact Nansen entity match or an explicit wallet link, never inferred. (2026-09-19)
**Status:** accepted

*Context.* `docs/SPIKE-badges.md` (19 credits) confirmed that neither Polymarket nor Hyperliquid exposes a verified X link, that Nansen has no entity-name to address resolver, and that fuzzy name search returns impersonators alongside owners. ADR-0005 already rejected name-similarity matching for person intel.

*Decision.* The Nansen badge appears only when the post author's display name (emoji stripped) or handle normalizes to exactly a Nansen entity name; it shows that entity's holdings, tags and PnL, never a wallet address. Hyperliquid and Polymarket badges appear only for (a) a wallet the user linked to that handle in `wallet_links`, stored locally and deletable, or (b) an entry in `packages/core/src/curated-wallets.ts`, which requires a fetched `sourceUrl` showing the account itself stating the address. That list ships empty rather than populated from third-party attributions. Hyperliquid's public `info` API is called from the backend only and cached 60s; Nansen adds one credit for the perp PnL summary. `GET/PUT/DELETE /api/links` keeps links local, behind the same origin guard as every other route.

*Consequences.* Most accounts get no venue badge, which is the intended failure mode: showing another person's positions under a wrong name is the one error this feature must never make. The cost is that the feature's reach depends on users linking wallets, and that the curated list can only grow when a source that meets the rule is found.

## ADR-0010: Spot rule signals are shares of the token's own 24h volume, and a quiet token is CLEAR. (2026-09-19)
**Status:** accepted

*Context.* Users reported that "literally everything — HYPE, ZEC, WIF — is marking as exit liquidity". `docs/CALIBRATION.md` (120 credits, 37 tokens) reproduced it: Paranoid blocked 35 of 37 including LINK, AAVE, PEPE, JUP and TRUMP, and Balanced left 6 CLEAR. Three causes were structural rather than a matter of tuning. `fresh_buy_share` is ~100% by construction whenever every labeled segment is net negative, which is the normal state of a token being rotated out of, so it fired on 29 of 37. Absolute USD thresholds scale with market cap, not with risk: −$100k is 0.28% of PUMP's day and more than a new launch's entire volume. And a 1d flow window says nothing about a token that already fell 75%.

*Decision.* The four spot rule signals become volume-normalized: `labeled_exit_pct`, `distribution_pct`, `sm_netflow_pct` and a new `drawdown_pct`. `fresh_buy_share` is deleted as a rule and survives only as the absorption ratio in the evidence copy, where it qualifies a labeled exit instead of being one. Activity guards (24h volume >= $250k, labeled turnover >= 0.5% of it, >=3 wallets to warn and >=5 to block, >=3 Smart Money traders) yield a real 0 — and therefore CLEAR — because "labeled wallets barely traded" is an answer. `null`, and therefore UNCHECKED, is reserved for a call that actually failed, and the signal's label then names the endpoint and the chain. `risk_high_count` is dropped from all three presets rather than widened, because with `TOKEN_RISKS` as defined it scored 0 on every token measured. Saved custom rules naming a removed signal are dropped on load and logged once, because their thresholds have no honest conversion.

*Consequences.* 30 of 37 sample tokens change verdict on Balanced and 28 on Paranoid, almost all toward CLEAR; Paranoid goes from blocking 35 to blocking 8. The product now warns rarely enough that a warning means something, which is the whole point, but it also blocks less — PUMP, HYPE and USELESS go from TRIPWIRE to CLEAR on Balanced on ~0.5–0.6% of a day's volume, and if any of those should have stayed blocked the Balanced threshold is wrong rather than the normalization. Tokens that already collapsed are newly caught by the drawdown rule. The guards are a deliberate exception to "missing data is never CLEAR", narrowed to the case where the data arrived and said "nothing happened". The cost is one extra Nansen call per token per day for the volume denominator, which makes `tgm/token-information` load-bearing: if it fails, the spot verdict is UNCHECKED rather than merely logo-less. The whole set is calibrated against a single day's snapshot and should be re-run on a second day.

## ADR-0011: The wallet lens runs on a site only after that site is granted, and everything it fetches goes through the local backend. (2026-09-19)
**Status:** accepted

*Context.* The feature has to work "anywhere somebody shares a wallet" — X, Polymarket, Hyperliquid, DEX Screener, Pendle, or a blog. The obvious implementation is `<all_urls>` at install, which is also the permission users refuse and reviewers reject, and which would let a bug inject into their bank. Separately, the card wants two things from outside: ENS resolution and token logos.

*Decision.* The manifest keeps only the hosts Tripwire already had, plus `optional_host_permissions: ["*://*/*"]` that is never requested at install. A site becomes enabled only through the popup's per-origin request, and only then does the background register `content-scripts/wallet.js` for it; the registration is re-synced from `permissions.getAll()` on install, on startup and on every permission change, so the set of injected sites is derived from the grants rather than remembered alongside them. Nothing the extension shows is fetched from a third party: ENS is resolved server-side (ensideas, then an ENS registry call over a public RPC), `.sol` is not resolved at all because no free resolver answered, and a token's logo is fetched by the backend from the URL Nansen gave it and handed to the card as bytes. The card's own `<img>` could not point at the backend directly — Chrome's Private Network Access rules refuse an https page reaching into loopback — so the background does that fetch too.

*Consequences.* Reach depends on the user enabling sites one at a time, which is slower than `<all_urls>` and is the point: the permission prompt names the site they are on, and "Remove" is one click. The lens costs 5 Nansen credits per EVM wallet per cache window (2 for Solana), spent only when a marker is clicked, and the card says so in its footer. `.sol` names are a stated gap rather than a guess. And `profiler/labels` stays behind an env flag and a button that prints "100 credits", because a single accidental click is 5% of a day's default cap.

## ADR-0012: Expanded evidence reuses shared content, and deeper market data is explicit, lazy, and isolated. (2026-09-19)
**Status:** accepted

*Context.* A 440px evidence card is right for a decision beside its trigger but too small for full charts, cross-venue perp comparisons, longer tables, and order books. Those deeper views include a mix of already-fetched evidence, free public venue data, and paid Nansen sections. Treating expansion as permission to fetch all of them would make a layout choice spend credits and turn one partial upstream failure into a whole-card failure. Perp evidence also needs four genuine views—Positioning, Liquidations, Traders, and Chart—even in compact mode.

*Decision.* Expanded mode reuses the compact card's shared header, tabs, state, and content components, changing only layout and row limits. Expanding alone does not spend credits: paid sections remain behind explicit tabs that show their credit price before activation, and expanded-only holders or order-book depth also load only when their tab is selected. The four compact perp tabs are accepted because Chart is a first-class trading view; the tab strip remains a single, non-wrapping row and scrolls horizontally when needed. The base evidence response remains atomic, while lazy depth sections keep separate loading, success, and failure state so one section can fail without erasing the rest of the card. Public venue APIs are called only by the backend, with each venue client isolated and best-effort; extension content scripts never call them directly.

*Consequences.* Compact and expanded cards cannot drift into two products, and changing card size is free. Users see the cost before a paid request, while expensive Nansen sections are fetched at most once per explicit tab request and merged into the current card. A missing Binance, Bybit, OKX, dYdX, or Hyperliquid answer degrades only that row or section, not the base verdict or evidence from other sources. Four compact perp tabs consume more horizontal space, so labels and icons may tighten and the strip may scroll, but it must never wrap.

## ADR-0013 Visual world: Nansen brand, superseding Hazard (2026-09-20)
**Status:** accepted (supersedes ADR-0007)
**Context:** The user rejected the "Hazard" world (black/white, inline expanding panels, clamped cards) and then a deep-navy "Glass Cockpit" pass as AI slop, asking for proper floating popups, wide cards, and a look that matches Nansen's own product.
**Decision:** The shipped world is Nansen's: near-black ground #06080B over panel #0B1016 and raised #111821, Nansen mint #00FFA7 for CLEAR/positive/primary, red #FF5A6E for TRIPWIRE, amber #F5B83D for CAUTION, neutral 60% white behind a dashed border for UNCHECKED (never green); Sora for display and the verdict word, Inter with tabular numerals for UI, JetBrains Mono for addresses; Lucide icons and bundled official venue/chain logos; 24/16/12/8px radii; body-level floating evidence cards at 440px with an expanded min(1280px, 80vw) overlay; skeletons on open; desktop only. Tokens are documented in `DESIGN.md` (regenerated from the built UI) with a machine-readable copy at `docs/design-tokens.json`.
**Consequences:** Yellow is no longer reserved for danger; the named rules (Never-Green-For-Unknown, Shape-Before-Hue, Ink-On-Fill, 11px floor, Anchor-Fit, Lift-Out-Of-Row, One-Gradient, No-Blur) bind future UI work. The design detector's older findings were measured against the retired document and need re-running against this one.

## ADR-0014 Hosted backend: one shared cache, per-install identity, user-supplied keys (2026-09-21)
**Status:** accepted (extends ADR-0004)
**Context:** For public use the extension cannot ask people to run a local server or own a Nansen key. The operator decided to host the backend and pay for credits, expecting few users and wanting them to have the same experience as the operator running it locally. The local design had one security boundary — the machine — and one user; hosting removes both.
**Decision:**
- One Fly.io machine at `tripwire.magician.wtf` running the existing Next.js backend with `node:sqlite` on a volume. Vercel + Redis was rejected: it bought scale nobody expects at the cost of an async rewrite of the storage layer and the transactional ledger.
- `cache` stays shared across all installs. That is what makes hosting affordable: the hundredth person to check a token inside its TTL pays nothing.
- Everything personal (rules, history, overrides, settings changes, wallet links, ledger rows) is keyed by an **install token**: 32 random bytes minted per extension install, sent as a bearer token. No account, no email. Minting is capped per salted-hashed IP and per day; the IP itself is never stored. Self-hosted (`TRIPWIRE_HOSTED` unset) keeps one implicit install and needs no token.
- Two spend ceilings on the operator's key: per install (default 3000/day, the self-host default) and global. Both degrade through the existing stale-cache-or-UNCHECKED path, never a block, never CLEAR.
- **A user may supply their own Nansen key.** It lives in `chrome.storage.local`, travels per request as `X-Nansen-Key`, lifts both ceilings, and is never written to the database, ledger, cache or logs. The project rule "the Nansen key never reaches the extension" concerns the operator's key and still holds; a key the user typed is a different object with a different owner. The popup offers it only once the free allowance is spent.
- Hosted /rules and /history receive the install token in the URL **fragment**, which browsers never send to servers; the page moves it to sessionStorage and removes it from the address bar. /ledger is operator-only behind `TRIPWIRE_OWNER_TOKEN`.
**Consequences:** Every credit-spending route must use `installRoute` (a structural test enforces it). The Origin check stops websites but not non-browser clients; the install token and ceilings are the real controls. The hosted URL is a literal in `host_permissions`, so moving domains needs an extension release. A single machine is a single point of failure, accepted at this scale. Runbook: `docs/DEPLOYMENT.md`.
