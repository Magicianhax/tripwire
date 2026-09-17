/** What a Nansen address label says the wallet is. Rendered as an icon next to the label. */
export type LabelKind = "smart-trader" | "fund" | "whale" | "public-figure" | "exchange" | "bot" | "other";

/** Pictographs, skin-tone modifiers, flag halves, and the joiners/selectors that glue emoji
 * sequences together, plus zero-width spaces Nansen labels sometimes carry. */
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[​-‍⁠︎️⃣]/gu;

const KEYWORDS: [LabelKind, RegExp][] = [
  ["bot", /\b(bot|mev|sniper|arbitrage)\b/i],
  ["smart-trader", /\bsmart\b/i],
  ["public-figure", /\b(public figure|kol|influencer)\b/i],
  ["exchange", /\b(binance|coinbase|okx|bybit|kraken|bitget|kucoin|huobi|htx|upbit|mexc|gate\.io|crypto\.com|exchange|cex|hot wallet|deposit)\b/i],
  ["fund", /\b(capital|fund|ventures|vc|partners|market making|asset management|investments?)\b/i],
  ["whale", /\b(whale|high balance|millionaire)\b/i],
];

/** Nansen's own emoji conventions, used only when the words don't name a kind. */
const EMOJI_KINDS: [LabelKind, RegExp][] = [
  ["smart-trader", /[\u{1F913}\u{1F9E0}]/u],
  ["whale", /[\u{1F433}\u{1F40B}]/u],
  ["fund", /[\u{1F3E6}\u{1F4BC}]/u],
  ["exchange", /[\u{1F3DB}\u{1F4B1}]/u],
  ["bot", /\u{1F916}/u],
  ["public-figure", /[\u{1F31F}\u{2B50}\u{1F4E2}\u{1F3A4}]/u],
];

/** A Nansen address label without its emoji, and the kind of wallet it names, e.g.
 * "🤓 Smart HL Perps Trader [0x25554a]" -> { text: "Smart HL Perps Trader [0x25554a]", kind: "smart-trader" }. */
export function cleanLabel(label: string): { text: string; kind: LabelKind } {
  const text = label.replace(EMOJI, " ").replace(/\s+/g, " ").trim();
  const byWords = KEYWORDS.find(([, re]) => re.test(text));
  if (byWords) return { text, kind: byWords[0] };
  const byEmoji = EMOJI_KINDS.find(([, re]) => re.test(label));
  return { text, kind: byEmoji ? byEmoji[0] : "other" };
}
