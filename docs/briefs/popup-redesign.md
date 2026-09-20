# Popup redesign (controller brief)

User report (2026-09-20, two screenshots): "this is ugly ux in extension showing these and also a big scroll also extension bg is black not matching the theme we have for popups design wise" + an Ambire Wallet popup as the width and polish reference.

The popup grew by accretion — venue list, wallet lens copy, recent wallets, preset switcher, enabled sites, status — all stacked in one column with no hierarchy, so it is a long scroll in a narrow, pure-black box that does not look like the cards.

## Size
- **Width 420px**, matching the Ambire reference (its screenshot measures ~480px wide including device scaling; ours is ~340). Chrome's popup maximum is 800×600, so 420 is safe and leaves the content room to breathe.
- **Height: no page scroll.** Target ≤ 560px total. Only one region may scroll internally (the active tab's body), never the whole popup. The footer stays pinned.

## Theme
Match the cards exactly — the popup currently reads as pure black against the cards' layered ground:
- Ground `--tw-ground` #06080B, panels `--tw-panel` #0B1016, raised rows `--tw-raised` #111821, hairlines rgba(255,255,255,0.08).
- Text white / 60% / 40% per the ramp; mint #00FFA7 only for positive, primary action and focus; red and amber only for danger and caution.
- Inter with tabular numerals, Sora for the wordmark and section headings, JetBrains Mono only for addresses.
- 16px pills, 12px cards, 8px rows; the same 180ms cubic-bezier(0.16,1,0.3,1) entrance the cards use.
- Lucide icons at 1.5px, bundled logos, no emoji. Text ≥ 11px, contrast ≥ 4.5, targets ≥ 24px.

## Structure — replace the single column with three tabs
Header (pinned, 56px): Tripwire wordmark + backend status dot with one short phrase ("Connected · key via Nansen CLI" / "Backend offline" / "Replay mode") + a settings gear.

**Tab 1 — Protection (default)**
- Preset segmented control (Degen / Balanced / Paranoid / Custom) with the weaken-confirm already built.
- A compact "on this tab" row: what Tripwire is showing on the active tab right now, with the "Show me where it is" action beside it (this is where that button belongs — see the review's I-1: it must report the truth for X and wallet-lens tabs too).
- Today's counters: checks run, blocks shown, credits spent today vs the cap, as three tiles.

**Tab 2 — Sites**
- Venue list as a compact logo grid (it is currently a long list of names): logo + name, grouped Tier 1 / Tier 2, with a one-line explainer above.
- "Enable on this site" for the current origin, then the granted-sites list with a remove action per row.

**Tab 3 — Wallets**
- The wallet-lens explainer in **one sentence**, not a paragraph.
- Recent wallets as a scrollable region capped at ~240px with `overscroll-behavior: contain`: address (mono, truncated), chain chip, and a relative timestamp; row click reopens the card, and the row carries a copy action.
- "Clear" as a quiet text button, and the privacy line moved to the footer as one short sentence.

**Footer (pinned, 40px):** "Powered by Nansen" mark, links to Rules / Ledger / History, and the privacy sentence as a tooltip on an info icon rather than a paragraph.

## Copy
Cut every paragraph to one sentence. The three long explainers in the current popup (wallet lens, privacy, venue list) become: one sentence each, with detail behind an info icon. Sentence case, no ALL-CAPS, no emoji.

## Tests
- Popup renders at 420px with no vertical page scroll at the default state (assert `documentElement.scrollHeight <= clientHeight`).
- Only the recent-wallets region scrolls; the header and footer stay fixed.
- Tab switching is keyboard-navigable and does not fetch anything (the popup must stay free — no Nansen calls on open).
- Status line reflects each of: connected+CLI key, connected+env key, no key, replay, offline.
- Contrast check on the new surfaces (the existing contrast test helper covers the cards; extend it to the popup).
- Capture `popup-protection.png`, `popup-sites.png`, `popup-wallets.png` at 420px and open each.

## Constraints
Do not change what the popup *does* (preset switching with confirm, per-site permission requests, links, recent wallets, locate action) — this is layout, theme and copy. Desktop only. No new permissions. No calls on open.
