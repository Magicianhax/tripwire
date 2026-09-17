import { HANDLE_RE } from "@tripwire/core";

const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';

/**
 * Where the author badges mount: the outer tweet's display-name link inside
 * `[data-testid="User-Name"]`, so the badges sit right after the username and before the
 * "@handle · time" row. Returns null when the header has no such link (a quoted tweet's own
 * header never counts, and an unknown handle is not guessed at).
 *
 * Reads attributes only, never innerHTML, and the handle is checked against X's own handle rule
 * before it goes anywhere near a selector.
 */
export function badgeAnchor(article: Element, handle: string): Element | null {
  if (!HANDLE_RE.test(handle)) return null;
  const userName = Array.from(article.querySelectorAll('[data-testid="User-Name"]')).find(
    (el) => el.closest(TWEET_ARTICLE_SELECTOR) === article,
  );
  if (!userName) return null;

  const links = Array.from(userName.querySelectorAll(`a[href="/${handle}"]`)).filter(
    (el) => el.closest(TWEET_ARTICLE_SELECTOR) === article,
  );
  // X renders the name link first and the "@handle" link after it; both share the href.
  return links.find((el) => !(el.textContent ?? "").trim().startsWith("@")) ?? null;
}
