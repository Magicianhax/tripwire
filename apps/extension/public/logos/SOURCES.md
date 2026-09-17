# Logo provenance

Brand marks bundled with Tripwire, retrieved 2026-09-17. They identify the venue, chain or data
provider only (nominative use); every mark is a trademark of its owner, and no endorsement is
implied. Nansen's mark appears only in the "Powered by Nansen" credit, never as Tripwire's logo.

This directory is the single source. `apps/web/public/logos/` is a byte-identical copy, and a web
unit test (`apps/web/test/logos.test.ts`) fails if the two drift.

Processing: SVGs were sanitized (XML declaration, DOCTYPE, comments, metadata/title, scripts,
foreignObject, event attributes and non-fragment hrefs removed). Monochrome marks were given a fill
(noted below) so they read on the dark ground. Raster sources (PNG or ICO, where the owner
publishes no SVG) were re-encoded to 96×96 PNG without other changes. Every file was rendered on
dark and light tiles and checked by eye against the owner's site.

Usage in the UI: always rendered through `<img src>` of these bundled files (never inlined as
markup). In the extension they are chrome-extension:// URLs listed in web_accessible_resources.

| File | Brand | Source URL | Format / notes | License / usage |
|---|---|---|---|---|
| nansen.svg | Nansen | https://www.nansen.ai/ (inline `data:image/svg+xml` orbital mark, same mark as https://www.nansen.ai/brand) | SVG, original colours | Nansen trademark; brand page offers logo assets for press/partners |
| hyperliquid.png | Hyperliquid | https://app.hyperliquid.xyz/apple-touch-icon.png | 180px PNG → 96px PNG | Hyperliquid trademark; site icon |
| polymarket.svg | Polymarket | https://polymarket.com/icons/safari-pinned-tab.svg | SVG, monochrome, fill #FFFFFF | Polymarket trademark; site icon |
| jupiter.svg | Jupiter | https://jup.ag/favicon.svg | SVG, original colours | Jupiter trademark; site icon |
| pumpfun.png | pump.fun | https://pump.fun/icon.png | 389px PNG → 96px PNG | pump.fun trademark; site icon |
| uniswap.svg | Uniswap | https://github.com/Uniswap/brand-assets/blob/main/Uniswap%20Brand%20Assets/Uniswap_icon_pink.svg | SVG, official brand kit | Uniswap Labs brand assets repo |
| jumper.svg | Jumper (LI.FI) | https://jumper.exchange/favicon.svg | SVG, original colours | LI.FI / Jumper trademark; site icon |
| raydium.png | Raydium | https://raydium.io/favicon.ico | 256px PNG-in-ICO → 96px PNG | Raydium trademark; site icon |
| aerodrome.svg | Aerodrome | https://aerodrome.finance/svg/AERO/favicon.svg | SVG, original colours | Aerodrome trademark; site icon |
| pancakeswap.png | PancakeSwap | https://pancakeswap.finance/logo.png | 512px PNG → 96px PNG | PancakeSwap trademark; site logo |
| 1inch.svg | 1inch | https://1inch.io/favicon/favicon.svg | SVG, original colours | 1inch trademark; site icon |
| matcha.svg | Matcha | https://matcha.xyz/favicon.svg | SVG, original colours | Matcha (0x) trademark; site icon |
| cow.svg | CoW Swap | https://swap.cow.fi/safari-pinned-tab.svg | SVG, monochrome, fill #FFFFFF | CoW DAO trademark; site icon |
| axiom.png | Axiom | https://axiom.trade/favicon.ico | ICO → 96px PNG | Axiom trademark; site icon |
| photon.png | Photon | https://photon-sol.tinyastro.io/assets/favicon/favicon-192x192-b31530524bba5a00face92a6ddd4b16438bc62573378fbb905dd3fd4be2b924f.png | 192px PNG → 96px PNG | Photon trademark; site icon |
| gmgn.png | GMGN | https://gmgn.ai/static/apple-touch-icon.png | 512px PNG → 96px PNG | GMGN trademark; site icon |
| bullx.png | BullX | https://neo.bullx.io/icon-192x192.png | 192px PNG → 96px PNG | BullX trademark; site icon |
| dexscreener.png | DEX Screener | https://dexscreener.com/img/apple-touch-icon.png | 180px PNG → 96px PNG | DEX Screener trademark; site icon |
| birdeye.png | Birdeye | https://birdeye.so/favicon.ico | 128px PNG (served as .ico) → 96px PNG | Birdeye trademark; site icon |
| chain-solana.svg | Solana | simple-icons 16.31.0 `icons/solana.svg` (source https://solana.com/branding) | SVG, monochrome, fill #9945FF (simple-icons brand hex) | Icon data CC0 (simple-icons); Solana Foundation trademark, see solana.com/branding |
| chain-ethereum.svg | Ethereum | simple-icons 16.31.0 `icons/ethereum.svg` (source https://ethereum.org/en/assets/) | SVG, monochrome, fill #FFFFFF (brand hex #3C3C3D is unreadable on the dark ground) | Icon data CC0 (simple-icons); ethereum.org assets |
| chain-base.svg | Base | https://github.com/base/brand-kit/blob/main/logo/TheSquare/Digital/Base_square_blue.svg | SVG, official brand kit | Base brand kit |
| chain-arbitrum.svg | Arbitrum | https://docs.arbitrum.io/img/logo.svg | SVG, original colours | Offchain Labs trademark; official docs logo |
| chain-bnb.svg | BNB Chain | simple-icons 16.31.0 `icons/bnbchain.svg` (source https://www.bnbchain.org) | SVG, monochrome, fill #F0B90B | Icon data CC0 (simple-icons); BNB Chain trademark |
| chain-polygon.svg | Polygon | simple-icons 16.31.0 `icons/polygon.svg` (guidelines https://polygon.technology/brandguidelines) | SVG, monochrome, fill #7B3FE4 | Icon data CC0 (simple-icons); Polygon Labs trademark |
| chain-optimism.svg | Optimism | simple-icons 16.31.0 `icons/optimism.svg` (source github.com/ethereum-optimism/brand-kit) | SVG, fill #FF0420 | Icon data CC0 (simple-icons); Optimism Foundation trademark |
| chain-avalanche.svg | Avalanche | https://www.avax.network/touchicon.svg | SVG, original colours | Ava Labs trademark; site icon |
| perp-binance.svg | Binance | simple-icons 16.31.0 `icons/binance.svg` (source https://www.binance.com/en/about) | SVG, monochrome, fill #F0B90B (Binance brand hex) | Icon data CC0 (simple-icons); Binance trademark |
| perp-bybit.png | Bybit | https://www.bybit.com/favicon.ico | 48px PNG-in-ICO -> 96px PNG | Bybit trademark; site icon |
| perp-okx.svg | OKX | simple-icons 16.31.0 `icons/okx.svg` (source https://www.okx.com) | SVG, monochrome, fill #FFFFFF (the brand mark is black, unreadable on the dark ground) | Icon data CC0 (simple-icons); OKX trademark |
| perp-dydx.svg | dYdX | https://dydx.trade/favicon.svg | SVG, original colours (dark tile, white glyph) | dYdX trademark; site icon |

The four perp-venue marks (`perp-*`) identify exchanges Tripwire reads funding and open
interest from through their free public APIs. They appear only in the cross-venue table's venue
column, never as a Tripwire mark and never as a claim of partnership.

Missing: none. Every requested brand has an owner-published mark. Eleven are raster only (the owner
publishes no SVG at a reachable URL): Hyperliquid, pump.fun, Raydium, PancakeSwap, Axiom, Photon,
GMGN, BullX, DEX Screener, Birdeye, Bybit. If an owner later publishes an SVG, replace the PNG and update
this table.
