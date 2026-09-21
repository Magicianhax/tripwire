<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-dark.png">
    <img src="assets/brand/lockup-light.png" alt="Tripwire, powered by Nansen" width="560">
  </picture>
</p>

<p align="center">
  Onchain data on the post that shills a token, and on the button that buys it.
</p>

<p align="center">
  <a href="https://github.com/Magicianhax/tripwire/releases/latest/download/tripwire-extension.zip"><b>Download for Chrome</b></a>
  &nbsp;·&nbsp;
  <a href="https://tripwire.magician.wtf">Website</a>
  &nbsp;·&nbsp;
  <a href="docs/REFERENCE.md">Docs</a>
</p>

<br>

<p align="center">
  <img src="apps/web/public/showcase/exit-liquidity.jpg" alt="Tripwire covering Uniswap's swap button after a drawdown rule fired on GIZA" width="820">
</p>

## What it does

- **On X:** a chip under any post that mentions a token. Click it for who bought and who sold since the post, Smart Money flow and risk flags.
- **On trading sites:** a verdict next to the trade button. On Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid and Polymarket, a hard block when your rules fire. You can still override it by typing a phrase.
- **On any wallet:** an address or ENS name anywhere opens its holdings, PnL, and Hyperliquid and Polymarket positions.

Every warning names the Nansen data behind it. Missing data never reads as safe.

## Install

1. [Download `tripwire-extension.zip`](https://github.com/Magicianhax/tripwire/releases/latest/download/tripwire-extension.zip) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.
3. Pin Tripwire and open X.

No account, no API key, no server. Each install gets a daily allowance. Past it, you can add your own Nansen key in the popup; it stays in your browser.

## Screenshots

| | |
|---|---|
| <img src="apps/web/public/showcase/hyperliquid.jpg" alt="Perp positioning on Hyperliquid" width="400"><br>Hyperliquid positioning and funding | <img src="apps/web/public/showcase/x-profile.jpg" alt="Nansen profile card on X" width="400"><br>Nansen profile on X |
| <img src="apps/web/public/showcase/jumper.jpg" alt="Token evidence beside Jumper's swap" width="400"><br>Evidence beside Jumper's swap | <img src="apps/web/public/showcase/polymarket.jpg" alt="Wallet card on Polymarket" width="400"><br>Wallet lens on Polymarket |

## Run it yourself

```bash
pnpm install
cp .env.example apps/web/.env.local   # add NANSEN_API_KEY, or just run `nansen login`
pnpm -F web dev                       # backend on http://127.0.0.1:3000
pnpm -F extension build               # load apps/extension/.output/chrome-mv3
```

Then in the popup: settings → **Advanced: self-hosted backend**. `pnpm dev:replay` runs everything on recorded data with no key. `pnpm verify` runs the tests.

## More

- [Reference](docs/REFERENCE.md): verdict signals and rules, all 18 venues, credits and caching, security
- [Architecture](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md) · [Calibration](docs/CALIBRATION.md)
- [Deploying the hosted backend](docs/DEPLOYMENT.md)

MIT licensed. Nansen and the venue names are trademarks of their owners; Tripwire is not affiliated with them.
