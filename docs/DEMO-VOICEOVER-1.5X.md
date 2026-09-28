# Tripwire — voiceover matched to the recorded video

## Recording and timing

- **Source:** `C:\Users\musha\Downloads\export-1790170692900.mp4`
- **Original runtime:** 05:19.37 (319.37 seconds).
- **Video playback speed:** 1.5×.
- **Final runtime:** approximately **03:32.91**.
- **Source format:** 1834×1032, 30 fps, H.264; no audio stream found.
- **Narration:** approximately 426 words, written for the actual recorded sequence.
- **Timecode basis:** the full original clip, with no cuts. Scene boundaries are editing cues, approximately within a second; playback time is source time divided by 1.5.

**Important:** These instructions assume you speed up the VIDEO to 1.5× and generate the voiceover at a natural speed. Do not speed the voiceover up another 1.5×. If you cut footage, all later timecodes must be shifted accordingly.

## How to use this with a TTS tool

1. Set the video speed to **1.5×** in your editor. Its duration should become roughly 3 minutes 33 seconds.
2. Generate the narration **one scene at a time** using the blocks below. This gives better sync than one continuous audio file.
3. Choose a clear, conversational voice at approximately **135–140 words per minute**. Rate labels differ by tool; preview the result rather than assuming a particular slider value.
4. Put each clip at its **1.5× playback start time**. Most lines intentionally finish before the end of their slot, leaving room to see the UI. Leave that space rather than rushing into the next scene.
5. If a clip overruns its slot, slightly increase that clip’s rate or shorten its pauses. The short wallet-lens and Pump.fun sections need the closest timing check.
6. A continuous narration-only copy is in `DEMO-VOICEOVER-1.5X.txt`. It is convenient for generation, but a single generated track will not automatically match every visual cut.

### Voice direction to paste into your AI tool

> Read in a clear, confident, conversational product-demo voice. Sound helpful and precise, not like a hype-driven trading advertisement. Keep the pace natural and the sentences distinct. Give “I am exit liquidity” and “I know better” a brief, deliberate pause. Do not read scene headings, timestamps or recording instructions. Do not add words or improvise claims.

**Pronunciation:** Nansen: “NAN-sen”; DEX Screener: “decks screener”; Hyperliquid: “hyper-liquid”; Polymarket: “poly-market”; pump.fun: “pump dot fun.”

## Timeline overview

| Scene | Original video | Video at 1.5× / audio placement | Visual |
|---|---|---|---|
| 01 | 00:00.00–00:26.00 | **00:00.00–00:17.33** | Website and extension popup |
| 02 | 00:26.00–00:43.00 | **00:17.33–00:28.67** | Uniswap: selection and missing data |
| 03 | 00:43.00–01:20.00 | **00:28.67–00:53.33** | Uniswap: warning and evidence |
| 04 | 01:20.00–01:40.00 | **00:53.33–01:06.67** | Jumper and the exit-liquidity acknowledgement |
| 05 | 01:40.00–02:20.00 | **01:06.67–01:33.33** | Dexscreener: token evidence |
| 06 | 02:20.00–02:32.00 | **01:33.33–01:41.33** | Dexscreener: wallet lens |
| 07 | 02:32.00–02:46.00 | **01:41.33–01:50.67** | Jupiter: a clear check |
| 08 | 02:46.00–02:59.00 | **01:50.67–01:59.33** | Jupiter: a token triggers the rules |
| 09 | 02:59.00–03:44.00 | **01:59.33–02:29.33** | Hyperliquid: positioning, funding and liquidation levels |
| 10 | 03:44.00–03:57.00 | **02:29.33–02:38.00** | Hyperliquid: changing the market or side |
| 11 | 03:57.00–04:08.00 | **02:38.00–02:45.33** | Pump.fun |
| 12 | 04:08.00–04:29.00 | **02:45.33–02:59.33** | Polymarket: outcome evidence |
| 13 | 04:29.00–04:46.00 | **02:59.33–03:10.67** | Polymarket: rule warning and acknowledgement |
| 14 | 04:46.00–05:00.00 | **03:10.67–03:20.00** | X: author context |
| 15 | 05:00.00–05:19.37 | **03:20.00–03:32.91** | X: separate markets and closing line |

## Timed TTS blocks

### 01. Website and extension popup

**Place audio:** 00:00.00–00:17.33  
**Original footage:** 00:00.00–00:26.00  
**Available time:** 17.33 seconds · 33 words

**What is on screen:** Homepage, Protection preset, Sites list, settings, then the website screenshot showcase.

**Voiceover — paste only this text:**

> Meet Tripwire: Nansen-powered onchain intelligence, built into your browser. Choose your protection level, enable the sites you use, and bring wallet and market context into the places where you already make trading decisions.

### 02. Uniswap: selection and missing data

**Place audio:** 00:17.33–00:28.67  
**Original footage:** 00:26.00–00:43.00  
**Available time:** 11.33 seconds · 21 words

**What is on screen:** Token selector, GIZA marked Unchecked, then selection of PONS.

**Voiceover — paste only this text:**

> On Uniswap, Tripwire follows the selected token. When information is missing, it says unchecked. Missing data is not a green light.

### 03. Uniswap: warning and evidence

**Place audio:** 00:28.67–00:53.33  
**Original footage:** 00:43.00–01:20.00  
**Available time:** 24.67 seconds · 49 words

**What is on screen:** PONS rule warning; expanded Markets, Risk, Holders and Winners views.

**Voiceover — paste only this text:**

> Choose a token with available data, and the warning becomes specific. Here, labeled wallets are selling while fresh wallets are buying. Open the evidence to compare markets, inspect the rules that fired, review holder concentration, and see trading performance. The warning shows its reasoning, not just a red badge.

### 04. Jumper and the exit-liquidity acknowledgement

**Place audio:** 00:53.33–01:06.67  
**Original footage:** 01:20.00–01:40.00  
**Available time:** 13.33 seconds · 29 words

**What is on screen:** Jumper PONS selection and warning; acknowledgement entered; brief return to Uniswap and a caution strip.

**Voiceover — paste only this text:**

> That same protection follows the swap on Jumper. To continue past a block, you must acknowledge it: I am exit liquidity. An override does not make the trade safe.

### 05. Dexscreener: token evidence

**Place audio:** 01:06.67–01:33.33  
**Original footage:** 01:40.00–02:20.00  
**Available time:** 26.67 seconds · 53 words

**What is on screen:** BUTTCOIN chart, docked warning, expanded Flow view and compact Wallets view.

**Voiceover — paste only this text:**

> On Dex Screener, the analysis sits beside the chart you are already watching. Expand the card to see wallet flows, price history, and buying versus selling. Then open the wallet view to inspect the largest reported buyers and sellers. This is context for the selected token on its actual chain—not a buy signal.

### 06. Dexscreener: wallet lens

**Place audio:** 01:33.33–01:41.33  
**Original footage:** 02:20.00–02:32.00  
**Available time:** 8.00 seconds · 18 words

**What is on screen:** A trader address opens a wallet card; Activity shows its on-demand load control.

**Voiceover — paste only this text:**

> An address becomes a starting point for investigation. Open its wallet card, then request deeper activity when needed.

### 07. Jupiter: a clear check

**Place audio:** 01:41.33–01:50.67  
**Original footage:** 02:32.00–02:46.00  
**Available time:** 9.33 seconds · 18 words

**What is on screen:** WIF in Jupiter's swap form and its expanded token evidence.

**Voiceover — paste only this text:**

> On Jupiter, the same evidence opens from the swap form. Clear means no configured rule fired—not guaranteed safety.

### 08. Jupiter: a token triggers the rules

**Place audio:** 01:50.67–01:59.33  
**Original footage:** 02:46.00–02:59.00  
**Available time:** 8.67 seconds · 19 words

**What is on screen:** Switch to BUTTCOIN; red block; exit-liquidity acknowledgement.

**Voiceover — paste only this text:**

> Switch to a token that triggers your rules, and the block appears before you proceed. The choice remains deliberate.

### 09. Hyperliquid: positioning, funding and liquidation levels

**Place audio:** 01:59.33–02:29.33  
**Original footage:** 02:59.00–03:44.00  
**Available time:** 30.00 seconds · 57 words

**What is on screen:** HYPE long then short; positioning, cross-venue funding, liquidation chart and trader tables.

**Voiceover — paste only this text:**

> Perps need a different view. On Hyperliquid, Tripwire reads the market and your selected side. Compare smart-trader, whale, and public-figure positioning, alongside funding and market activity. The liquidation view shows levels for the returned positions, while the traders tab adds performance context. You can move from the warning to the underlying evidence without losing the trading screen.

### 10. Hyperliquid: changing the market or side

**Place audio:** 02:29.33–02:38.00  
**Original footage:** 03:44.00–03:57.00  
**Available time:** 8.67 seconds · 18 words

**What is on screen:** HYPE/AR selection and side-dependent warning in the order panel.

**Voiceover — paste only this text:**

> Change the market or direction, and the check changes with it. Opposing positioning can trigger your configured rules.

### 11. Pump.fun

**Place audio:** 02:38.00–02:45.33  
**Original footage:** 03:57.00–04:08.00  
**Available time:** 7.33 seconds · 16 words

**What is on screen:** BALLFART trading screen with a compact Tripwire card.

**Voiceover — paste only this text:**

> The same compact check also appears on pump dot fun, right beside the token's trading controls.

### 12. Polymarket: outcome evidence

**Place audio:** 02:45.33–02:59.33  
**Original footage:** 04:08.00–04:29.00  
**Available time:** 14.00 seconds · 27 words

**What is on screen:** Anthropic IPO closing market-cap event; selected outcome; evidence card and holder positioning.

**Voiceover — paste only this text:**

> On Polymarket, Tripwire checks the specific market and selected outcome. Open the evidence to compare holder positioning and see which side the reported proven-winner money is backing.

### 13. Polymarket: rule warning and acknowledgement

**Place audio:** 02:59.33–03:10.67  
**Original footage:** 04:29.00–04:46.00  
**Available time:** 11.33 seconds · 24 words

**What is on screen:** Red outcome warning; I KNOW BETTER acknowledgement; return to the order panel.

**Voiceover — paste only this text:**

> If positioning conflicts with your rules, Tripwire blocks the trade button. Continuing requires acknowledging, I know better. That does not make the trade safe.

### 14. X: author context

**Place audio:** 03:10.67–03:20.00  
**Original footage:** 04:46.00–05:00.00  
**Available time:** 9.33 seconds · 17 words

**What is on screen:** DANNY / @DannyCrypt post; Nansen entity summary and holdings.

**Voiceover — paste only this text:**

> On X, Nansen badges connect a post's author to available entity information, including the holdings shown here.

### 15. X: separate markets and closing line

**Place audio:** 03:20.00–03:32.91  
**Original footage:** 05:00.00–05:19.37  
**Available time:** 12.91 seconds · 27 words

**What is on screen:** PONS market explorer, spot evidence, then a perp card; video ends on X, not the homepage.

**Voiceover — paste only this text:**

> Token mentions open separate spot and perp markets, with each chain kept explicit. From the post to the trade, keep the evidence close. Tripwire, powered by Nansen.

## Footage-specific accuracy notes

- The live sequence is website/popup → Uniswap → Jumper → Dexscreener → Jupiter → Hyperliquid → pump.fun → Polymarket → X. It does **not** follow the older two-minute demo script.
- The website portion includes its screenshot slider. Those images are a showcase, not live interactions happening at that point in this video.
- Initial GIZA on Uniswap is **Unchecked**, not the older GIZA drawdown-warning example. The warning and deeper Uniswap evidence shown afterward concern **PONS**.
- The Dexscreener example is **BUTTCOIN**, not CHUMP. Its wallet Activity view shows an on-demand load control; the narration does not claim that a transaction-history list has been loaded.
- Jupiter shows **WIF**, then a **BUTTCOIN** warning. A Clear result means no configured rule fired, not that a token is safe.
- Hyperliquid shows **HYPE**, a long-to-short change, and later **AR**. Liquidation levels describe the returned positions, not a complete exchange-wide liquidation map.
- Polymarket shows an **Anthropic IPO closing market-cap event and selected outcomes**, not a trader’s leaderboard portfolio. Its warning phrase is **I KNOW BETTER**.
- The recording includes typed acknowledgements and overrides. The script accurately explains that mechanism; it does not claim no override occurred, or that an override makes a trade safe. No completed trade is evident in the reviewed footage.
- The X example is **DANNY / @DannyCrypt and PONS**, not Vitalik. The final PONS perp card contains measurements but is marked **Unchecked**. Do not narrate it as a completed or clean rule check.
- The video ends on X. The closing line is written to work there; it does not require a homepage outro that is absent from the recording.

## Optional polish before publishing

These are optional edits, **not assumed by the timestamps above**:

- Around original **00:10–00:15**, the popup settings show the optional API-key section and personal allowance. No raw key text was visible in the inspected frame, but crop this section if you do not want setup/usage details in the public demo.
- Browser tabs, your signed-in X handle, and wallet UI details are visible in parts of the recording. Crop or blur anything you do not want to publish.
- Cursorful’s zoom transitions and some loading states take a few seconds. The narration leaves breathing room; trim only if you will also retime later clips.
- Do not alter financial figures or remove Unchecked states to imply a more complete result.
- If you add a separate end card, keep it after the existing 03:32.91 endpoint and add only a short website CTA: “Try Tripwire at tripwire dot magician dot W T F.”

## Analysis method

Runtime, resolution and absence of audio were checked from the file metadata. Timestamped frames were extracted throughout the video at eight-second intervals, then at additional points around transitions and important UI states. The narration was cross-checked against those actual frames, including the final loaded-but-Unchecked perp view. The original MP4 was not modified.

