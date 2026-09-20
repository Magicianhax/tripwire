import { extractTokens, type ExtractedAddress } from "@tripwire/core";

export type TokenBag = { cashtags: string[]; addresses: ExtractedAddress[] };

/** Where on a post a token was found. Not decoration: a verdict about a token nobody in the
 * outer post typed must never read as a statement about that post's author. */
export type TokenOrigin = "post" | "quote" | "card" | "image";

export type TokenSource = {
  origin: TokenOrigin;
  /** The quoted account's handle, for a quote source. Never the outer author's. */
  handle: string | null;
  /** The words the tokens were read from, used as the chain hint for a bare 0x address. */
  text: string;
  tokens: TokenBag;
};

export type ParsedTweet = {
  id: string;
  handle: string;
  displayName: string;
  timeIso: string | null;
  text: string;
  /** The outer post's own tokens. Kept separate from `sources` so existing callers cannot
   * accidentally attribute a quoted or previewed token to this author. */
  tokens: TokenBag;
  /** Every place a token was found, the post's own body first. */
  sources: TokenSource[];
};

const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const CASHTAG_LINK_SELECTOR = 'a[href^="/search?q=%24"]';
const CARD_SELECTOR = '[data-testid="card.wrapper"]';
const PHOTO_SELECTOR = '[data-testid="tweetPhoto"]';
const CASHTAG_LINK_RE = /[?&]q=%24([A-Za-z0-9]+)/;
const STATUS_ID_RE = /\/status\/(\d+)/;

/**
 * The wrappers X puts a quoted post inside. The live site uses `div[role="link"]`; our recorded
 * fixture nests a whole `article`. `div` is deliberate: the outer post's own timestamp sits in
 * an `a[role="link"]`, which must stay outer.
 */
const QUOTE_HOST_SELECTOR = `div[role="link"], [data-testid="quoteTweet"], ${TWEET_ARTICLE_SELECTOR}`;

/** The quote wrapper `el` sits inside, or null when `el` is part of `outer`'s own body. Walks
 * parents rather than `closest`, so an element that is itself a wrapper is not its own host. */
export function quoteHostOf(el: Element, outer: Element): Element | null {
  let node = el.parentElement;
  while (node && node !== outer) {
    if (node.matches(QUOTE_HOST_SELECTOR)) return node;
    node = node.parentElement;
  }
  return null;
}

/** True when `el` belongs to the outer post itself: inside it, and not inside a quoted post. */
export function isOuterOwn(el: Element, outer: Element): boolean {
  return outer.contains(el) && el !== outer && quoteHostOf(el, outer) === null;
}

const outerOwn = (outer: Element, selector: string): Element[] =>
  Array.from(outer.querySelectorAll(selector)).filter((el) => isOuterOwn(el, outer));

/** The element that holds just the display name: the first anchor pointing at the author's
 * own handle (name and handle links share an href on X, and the name link comes first in
 * document order), or the first `div` inside User-Name as a fallback. Real X markup can split
 * the name across sibling spans (emoji, badges) rather than a single span, so this returns a
 * container to read textContent from, not a single span. */
function nameContainer(userNameEl: Element, handle: string): Element | null {
  if (handle) {
    const exact = userNameEl.querySelector(`a[href="/${handle}"]`);
    if (exact) return exact;
  }
  return userNameEl.querySelector("div");
}

/** `container`'s textContent, with any `<svg>` subtree (verified-badge icons, which can carry
 * their own accessible text via a `<title>`) and the trailing "@handle" text stripped out, then
 * trimmed. Uses cloneNode + element removal rather than innerHTML. */
function nameText(container: Element, handle: string): string {
  const clone = container.cloneNode(true) as Element;
  for (const svg of Array.from(clone.querySelectorAll("svg"))) svg.remove();
  let text = clone.textContent ?? "";
  if (handle) text = text.split(`@${handle}`).join("");
  return text.trim();
}

/** The handle a `[data-testid="User-Name"]` block points at, or "". */
function handleIn(scope: Element): string {
  const href = scope.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute("href") ?? "";
  return href.replace(/^\//, "").split("/")[0] ?? "";
}

/**
 * Tokens in `text`, plus any cashtag X rendered as a search link inside `scope` (a cashtag can
 * be a link whose visible text was truncated).
 *
 * `stripSchemes` is for copy that is mostly a URL — a link preview's detail line, an image
 * description. `extractTokens` drops whole `https://…` runs before scanning for addresses, so a
 * mint pasted as a full URL is invisible to it; removing just the scheme leaves the path for the
 * word scanner. The post's own body keeps the stricter core behaviour unchanged.
 */
function tokensFrom(text: string, scope: Element | null, stripSchemes = false): TokenBag {
  const tokens = extractTokens(stripSchemes ? text.replace(/https?:\/\//gi, " ") : text);
  for (const a of scope?.querySelectorAll(CASHTAG_LINK_SELECTOR) ?? []) {
    const tag = (a.getAttribute("href") ?? "").match(CASHTAG_LINK_RE)?.[1];
    if (!tag) continue;
    const upper = tag.toUpperCase();
    if (!tokens.cashtags.includes(upper)) tokens.cashtags.push(upper);
  }
  return tokens;
}

const hasTokens = (bag: TokenBag) => bag.cashtags.length > 0 || bag.addresses.length > 0;

/** Every alt text on the outer post's own images, joined. X writes "Image" when the author gave
 * none, which simply yields no tokens. */
function imageText(article: Element): string {
  const photos = outerOwn(article, PHOTO_SELECTOR);
  const alts: string[] = [];
  for (const photo of photos) {
    const images = photo.matches("img") ? [photo] : Array.from(photo.querySelectorAll("img"));
    for (const img of images) {
      const alt = img.getAttribute("alt")?.trim();
      if (alt) alts.push(alt);
    }
  }
  return alts.join(" ");
}

/**
 * Pure DOM-in, data-out tweet parser. Reads only textContent/attributes (never innerHTML).
 * Returns null when the tweet has no resolvable status id. Media-only posts still have authors.
 *
 * Identity — handle, display name, time, status id — is strictly the outer post's. A quoted
 * post, a link preview and an image description contribute tokens only, each carried in its own
 * `sources` entry so the caller can say where a token came from.
 */
export function parseTweet(article: Element): ParsedTweet | null {
  const tweetTextEl = outerOwn(article, '[data-testid="tweetText"]')[0] ?? null;

  let id: string | null = null;
  for (const link of outerOwn(article, 'a[href*="/status/"]')) {
    if (!link.querySelector("time")) continue;
    const match = link.getAttribute("href")?.match(STATUS_ID_RE);
    if (match?.[1]) {
      id = match[1];
      break;
    }
  }
  if (!id) return null;

  const userNameEl = outerOwn(article, '[data-testid="User-Name"]')[0] ?? null;
  let handle = "";
  let displayName = "";
  if (userNameEl) {
    const handleLink = userNameEl.querySelector('a[href^="/"]');
    const href = handleLink?.getAttribute("href") ?? "";
    handle = href.replace(/^\//, "").split("/")[0] ?? "";

    const nameEl = nameContainer(userNameEl, handle);
    displayName = nameEl ? nameText(nameEl, handle) : "";
  }

  const timeEl = outerOwn(article, "time[datetime]")[0] ?? null;
  const timeIso = timeEl?.getAttribute("datetime") ?? null;

  const text = (tweetTextEl?.textContent ?? "").trim();
  const tokens = tokensFrom(text, tweetTextEl);

  const sources: TokenSource[] = [];
  if (hasTokens(tokens)) sources.push({ origin: "post", handle: null, text, tokens });

  const quoteText = Array.from(article.querySelectorAll('[data-testid="tweetText"]')).find(
    (el) => el !== tweetTextEl && quoteHostOf(el, article) !== null,
  );
  if (quoteText) {
    const host = quoteHostOf(quoteText, article)!;
    const body = (quoteText.textContent ?? "").trim();
    const quoted = tokensFrom(body, host);
    if (hasTokens(quoted)) sources.push({ origin: "quote", handle: handleIn(host) || null, text: body, tokens: quoted });
  }

  const cardEl = outerOwn(article, CARD_SELECTOR)[0] ?? null;
  if (cardEl) {
    const body = (cardEl.textContent ?? "").trim();
    const card = tokensFrom(body, cardEl, true);
    if (hasTokens(card)) sources.push({ origin: "card", handle: null, text: body, tokens: card });
  }

  const alt = imageText(article);
  if (alt) {
    const images = tokensFrom(alt, null, true);
    if (hasTokens(images)) sources.push({ origin: "image", handle: null, text: alt, tokens: images });
  }

  return { id, handle, displayName, timeIso, text, tokens, sources };
}
