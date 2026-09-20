# Chrome Web Store Listing — Tripwire

Last updated: 2026-09-20. Draft only; no store submission performed.

## Store listing

- Name: Tripwire
- Short description draft: See Nansen wallet, token and perp insights while browsing X and supported trading sites.
- Single purpose: Bring onchain context to the assets and wallets users inspect on supported websites.
- Language: English
- Category and final detailed listing: confirm before submission.

## Graphics & assets

| Asset | Dimensions | Status | File |
|---|---|---|---|
| Extension/store icon | 128×128 PNG | Created; generated Tripwire T | apps/extension/public/icons/icon-128.png |
| Toolbar icons | 16/32/48px PNG | Created at exact sizes | apps/extension/public/icons/ |
| Transparent product mark | 256×256 PNG | Created | apps/extension/public/logos/tripwire.png |
| Store screenshots | 1280×800 or 640×400 | Refresh after logo change | Pending selection |
| Promotional tiles | Store-required sizes | Not prepared | Pending |

## Permissions justification

No permissions changed for the logo update. The current manifest in apps/extension/wxt.config.ts is authoritative.
Storage retains user settings and recent wallets. Scripting registers the wallet tools on enabled sites.
Active-tab access supports the current-site controls. Optional site access is requested when a user enables a site.
Loopback host access connects to the user's local data service. Complete the per-host submission audit before publishing.

## Privacy & data use

Wallet/asset identifiers inspected by users are sent through their configured local service to obtain data.
Recent wallets are retained in the browser; the local service retains accounting and check history.
The logo update adds no data collection or external asset requests. Complete the store disclosure form against the final release.

## Privacy policy

Public URL pending. Do not submit until the policy is published and reviewed.

## Distribution & developer info

Repository release URL, publisher name, contact email, support URL, distribution regions and public website URL pending.

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.1.0 working tree | 2026-09-20 | Original Tripwire logo applied to site, popup, favicon and browser icons | Draft, not submitted |

## Review notes

Current extension connects to a local data service. A public product website does not supply a hosted API.
Nansen branding remains separate provider attribution. Logo prompts and asset provenance are in assets/brand/README.md.
