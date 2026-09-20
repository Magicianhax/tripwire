// @vitest-environment happy-dom
// Round 2.4 — the evidence card's author block says whose words put this token on the card.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createBadgeController } from "../lib/x/author-badges";
import { createMountTracker } from "../lib/x/mounts";
import { sourceNote } from "../lib/x/headline";
import { parseTweet } from "../lib/x/parse";
import { pickTokens } from "../lib/x/pick";

/** Only the three members `createBadgeController` touches at construction time. */
const ctx = { isInvalid: false, setInterval: () => 0, onInvalidated: () => () => {} } as unknown as ContentScriptContext;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => createRoot(container).render(node));
  return container;
}

const controller = () =>
  createBadgeController({ ctx, mounts: createMountTracker(), stopHostClicks: () => {}, zIndex: 1 });

const tweet = { id: "1", handle: "quotefan", displayName: "Quote Fan", timeIso: null, text: "", tokens: { cashtags: [], addresses: [] }, sources: [] };

describe("the card's author block", () => {
  it("names the quoted account above the Nansen label line, not instead of it", () => {
    const note = "$WIF comes from the quoted post by @innerposter, not from @quotefan's own words.";
    const container = render(controller().authorSection(tweet, false, null, note));
    const lines = Array.from(container.querySelectorAll(".tw-card-author > .tw-empty")).map((el) => el.textContent);
    expect(lines).toEqual([note, "No Nansen label for @quotefan."]);
  });

  it("says nothing extra when the author typed the token themselves", () => {
    const container = render(controller().authorSection(tweet, true, null, null));
    expect(container.querySelectorAll(".tw-card-author > .tw-empty")).toHaveLength(0);
    expect(container.textContent).not.toContain("comes from");
  });

  it("is driven by the token the chip actually picked, end to end", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><div><a href="/quotefan"><span>Quote Fan</span></a></div></div>
        <a href="/quotefan/status/9" role="link"><time datetime="2026-09-18T10:30:00.000Z">2h</time></a>
        <div role="link" tabindex="0">
          <div data-testid="User-Name"><div><a href="/innerposter"><span>Inner</span></a></div></div>
          <div data-testid="tweetText"><span>buy EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm</span></div>
        </div>
      </article>`;
    const parsed = parseTweet(document.body.querySelector("article")!)!;
    const picked = pickTokens(parsed.sources)[0]!;
    expect(sourceNote(picked, "EKpQ…zcjm", parsed.handle)).toBe(
      "EKpQ…zcjm comes from the quoted post by @innerposter, not from @quotefan's own words.",
    );
  });
});
