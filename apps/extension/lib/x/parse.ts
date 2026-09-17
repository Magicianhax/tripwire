import { extractTokens, type ExtractedAddress } from "@tripwire/core";

export type ParsedTweet = {
  id: string;
  handle: string;
  displayName: string;
  timeIso: string | null;
  text: string;
  tokens: { cashtags: string[]; addresses: ExtractedAddress[] };
};

const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const CASHTAG_LINK_RE = /[?&]q=%24([A-Za-z0-9]+)/;
const STATUS_ID_RE = /\/status\/(\d+)/;

/** True when `el`'s nearest enclosing tweet article (itself included) is `outer` — used to
 * ignore a nested quote tweet's own header/body when parsing the outer tweet. */
function belongsToOuter(el: Element, outer: Element): boolean {
  return el.closest(TWEET_ARTICLE_SELECTOR) === outer;
}

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

/**
 * Pure DOM-in, data-out tweet parser. Reads only textContent/attributes (never innerHTML).
 * Returns null when the tweet has no tweetText or no resolvable status id.
 */
export function parseTweet(article: Element): ParsedTweet | null {
  const tweetTextEl = Array.from(article.querySelectorAll('[data-testid="tweetText"]')).find((el) =>
    belongsToOuter(el, article),
  );
  if (!tweetTextEl) return null;

  const statusLinks = Array.from(article.querySelectorAll('a[href*="/status/"]')).filter((el) =>
    belongsToOuter(el, article),
  );
  let id: string | null = null;
  for (const link of statusLinks) {
    if (!link.querySelector("time")) continue;
    const match = link.getAttribute("href")?.match(STATUS_ID_RE);
    if (match?.[1]) {
      id = match[1];
      break;
    }
  }
  if (!id) return null;

  const userNameEl = Array.from(article.querySelectorAll('[data-testid="User-Name"]')).find((el) =>
    belongsToOuter(el, article),
  );
  let handle = "";
  let displayName = "";
  if (userNameEl) {
    const handleLink = userNameEl.querySelector('a[href^="/"]');
    const href = handleLink?.getAttribute("href") ?? "";
    handle = href.replace(/^\//, "").split("/")[0] ?? "";

    const nameEl = nameContainer(userNameEl, handle);
    displayName = nameEl ? nameText(nameEl, handle) : "";
  }

  const timeEl = Array.from(article.querySelectorAll("time[datetime]")).find((el) => belongsToOuter(el, article));
  const timeIso = timeEl?.getAttribute("datetime") ?? null;

  const text = (tweetTextEl.textContent ?? "").trim();
  const tokens = extractTokens(text);

  for (const a of tweetTextEl.querySelectorAll('a[href^="/search?q=%24"]')) {
    const href = a.getAttribute("href") ?? "";
    const match = href.match(CASHTAG_LINK_RE);
    if (!match?.[1]) continue;
    const tag = match[1].toUpperCase();
    if (!tokens.cashtags.includes(tag)) tokens.cashtags.push(tag);
  }

  return { id, handle, displayName, timeIso, text, tokens };
}
