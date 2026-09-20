import { isOuterOwn, type TokenOrigin } from "./parse";

export type ChipAnchor = { el: Element; append: "after" | "before" };

/**
 * Where a post's chips mount.
 *
 * The chip follows the thing the token came from: a link preview's chip sits under the preview,
 * a quoted post's under the quote, so the verdict and the words it is about are next to each
 * other. When that element is not there, the order below falls back to the post's own text and
 * finally to the action bar, the one row every post has.
 *
 * Every candidate is checked against `isOuterOwn`. The post's own text element often does not
 * exist: a post whose token lives in a quote, a link preview or an image description has no body
 * of its own, and a plain `article.querySelector('[data-testid="tweetText"]')` would return the
 * *quoted* post's text element there, mounting Tripwire's chip inside someone else's post and
 * attributing the verdict to them.
 *
 * Each candidate is a block-level row in the post's own content column, so the chip keeps the
 * anchor-fit contract: never wider than the row it follows, and no host-page horizontal scroll.
 * The action bar takes the chip *before* it rather than after, so it stays inside the post.
 */
export function chipAnchor(article: Element, origin: TokenOrigin = "post"): ChipAnchor | null {
  const own = (selector: string): Element | null =>
    Array.from(article.querySelectorAll(selector)).find((el) => isOuterOwn(el, article)) ?? null;

  const text = () => own('[data-testid="tweetText"]');
  const card = () => own('[data-testid="card.wrapper"]');
  // X wraps a quoted post in a `div[role="link"]`; our recorded fixtures nest a whole article.
  const quote = () => own('[data-testid="quoteTweet"]') ?? own('div[role="link"]');

  const preferred = origin === "card" ? card() : origin === "quote" ? quote() : null;
  const el = preferred ?? text() ?? card() ?? quote();
  if (el) return { el, append: "after" };

  const actions = own('[role="group"]');
  if (actions) return { el: actions, append: "before" };

  return null;
}
