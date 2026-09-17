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
    displayName = (userNameEl.querySelector("span")?.textContent ?? "").trim();
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
