# PRODUCT

## What it is

Tripwire is a Chrome extension with a local Next.js backend. It puts Nansen onchain data where people talk about trades and make them.
- **On X:** every post that mentions a token gets a verdict chip, showing who bought and who sold since the post and whether a Nansen-labeled author holds it.
- **On trading venues** (Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket, plus tier-2 venues): the user's own rules run against live Nansen data before the trade button is clicked. A failing rule blocks the button with the evidence.

## Who it is for

- **Primary:** an active onchain trader scrolling X and aping into tokens, perps and prediction markets in the browser.
- **Secondary:** anyone evaluating it, who must be able to run it end to end in under 10 minutes.

## Job to be done

When I'm about to buy something I just saw shilled, I want to know who is on the other side of my trade right now, so I can avoid being exit liquidity without leaving the page.

## What it is not

- Not a trading bot. It never signs, sends or intercepts transactions, and never connects to wallets.
- Not a dashboard or a wallet-investigation (OSINT) tool. It never guesses wallets for unlabeled X accounts.
- Not a hosted service. The backend runs locally with the user's own Nansen key.

## Success signals

- A verdict chip appears within 3s of a post that mentions a token scrolling into view (after warm cache: under 500ms).
- The block screen covers the trade button on every tier-1 venue in the demo recording, with zero crashes.
- More than 1,000 logged Nansen API calls on `/ledger`: proof it has been used against live data, not demoed twice.
- Setup from a clean clone to a first verdict takes under 10 minutes.

## Constraints

- **Chains and networks:** reads only (Solana, Ethereum, Base, Arbitrum, BNB, Polygon, Optimism, Avalanche; Hyperliquid perps; Polymarket).
- **Money:** nothing moves value. The Nansen API key lives in `apps/web/.env.local` or the Nansen CLI config, never in the extension.
- **Distribution:** the extension loads unpacked today. No Chrome Web Store listing yet (`CHROMEWEBSTORE.md` is the draft).

## Competitive wedge

Every other way to use this data is a dashboard, an investigator or a verdict desk you have to go and visit. Tripwire moves Nansen data to the moment of decision: the timeline where the shill happens and the button where the money moves. Every warning cites the Nansen endpoint and value that triggered it.

## Open product questions

- Should overrides require a cooldown (for example 60s) or only the typed phrase? The current build uses the phrase plus a 60s unlock window.
