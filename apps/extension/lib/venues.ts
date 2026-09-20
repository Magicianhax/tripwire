export const X_MATCHES = ["https://x.com/*", "https://twitter.com/*"];
export const TIER1_MATCHES = [
  "https://jup.ag/*",
  "https://pump.fun/*",
  "https://app.uniswap.org/*",
  "https://jumper.exchange/*",
  "https://jumper.xyz/*",
  "https://app.hyperliquid.xyz/*",
  "https://polymarket.com/*",
];
export const TIER2_MATCHES = [
  "https://raydium.io/*",
  "https://aerodrome.finance/*",
  "https://pancakeswap.finance/*",
  // 1inch: `app.1inch.io` 301s to `1inch.com`, so the old host's content script sees a
  // redirect and never a page. Adding the new host is a NEW MV3 host permission — it
  // re-prompts every installed user and triggers a Chrome Web Store re-review.
  "https://app.1inch.io/*",
  "https://1inch.com/*",
  "https://matcha.xyz/*",
  "https://swap.cow.fi/*",
  "https://axiom.trade/*",
  "https://photon-sol.tinyastro.io/*",
  "https://gmgn.ai/*",
  "https://neo.bullx.io/*",
  "https://dexscreener.com/*",
  "https://birdeye.so/*",
];
