// @vitest-environment happy-dom
// Round 2.4 — X surface depth: token sources beyond the outer post body, the chip cap, the
// anchor that survives a post with no text of its own, and the provenance copy that keeps a
// verdict about a token from reading as a statement about an author who never typed it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chipAnchor } from "../lib/x/anchor";
import { alsoMentioned, originPrefix, sourceNote } from "../lib/x/headline";
import { parseTweet } from "../lib/x/parse";
import { MAX_CHIPS, pickTokens } from "../lib/x/pick";

const FIXTURES_DIR = resolve(process.cwd(), "../../fixtures/html");

function loadFixture(name: string): Element {
  const html = readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
  document.body.innerHTML = html;
  const article = document.body.querySelector('article[data-testid="tweet"]');
  if (!article) throw new Error(`fixture ${name} has no outer article`);
  return article;
}

const sourceOf = (article: Element, origin: string) =>
  parseTweet(article)?.sources.find((s) => s.origin === origin) ?? null;

describe("quoted posts as a token source", () => {
  it("reads the quoted body of a div[role=link] quote while handle, name and time stay outer", () => {
    const article = loadFixture("x-tweet-quote-ca.html");
    const parsed = parseTweet(article)!;

    expect(parsed.id).toBe("1836452718293747999");
    expect(parsed.handle).toBe("quotefan");
    expect(parsed.displayName).toBe("Quote Fan");
    expect(parsed.timeIso).toBe("2026-09-18T10:30:00.000Z");
    // The outer post has no body of its own, and the quoted one must never become it.
    expect(parsed.text).toBe("");
    expect(parsed.tokens.addresses).toEqual([]);

    const quote = sourceOf(article, "quote")!;
    expect(quote.handle).toBe("innerposter");
    expect(quote.tokens.addresses).toEqual([
      { chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
    ]);
  });

  it("reads the quoted body of a nested-article quote too, without moving the outer identity", () => {
    const article = loadFixture("x-tweet-quote.html");
    const parsed = parseTweet(article)!;

    expect(parsed.handle).toBe("quotefan");
    expect(parsed.text).toBe("Look at this thread, wild stuff");
    expect(parsed.tokens.cashtags).toEqual([]);

    const quote = sourceOf(article, "quote")!;
    expect(quote.handle).toBe("innerposter");
    expect(quote.tokens.cashtags).toEqual(["DOGE"]);
  });

  it("gives a post with no quote no quote source at all", () => {
    expect(sourceOf(loadFixture("x-tweet-cashtag.html"), "quote")).toBeNull();
  });
});

describe("link previews and image descriptions as token sources", () => {
  it("recovers a mint from a link preview whose only copy is an https URL", () => {
    const article = loadFixture("x-tweet-card.html");
    const parsed = parseTweet(article)!;

    // The post's own words name nothing; core strips `https://…` before scanning for addresses.
    expect(parsed.tokens.addresses).toEqual([]);
    expect(sourceOf(article, "card")!.tokens.addresses).toEqual([
      { chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
    ]);
  });

  it("reads an image-only post's alt text and nothing else", () => {
    const article = loadFixture("x-tweet-alt.html");
    const parsed = parseTweet(article)!;

    expect(parsed.text).toBe("");
    expect(sourceOf(article, "image")!.tokens.cashtags).toEqual(["PEPE"]);
    expect(sourceOf(article, "card")).toBeNull();
  });

  it("does not invent a card source for a post that has none", () => {
    expect(sourceOf(loadFixture("x-tweet-plain.html"), "card")).toBeNull();
    expect(sourceOf(loadFixture("x-tweet-plain.html"), "image")).toBeNull();
  });
});

describe("pickTokens", () => {
  const post = (tokens: Parameters<typeof pickTokens>[0][number]["tokens"]) =>
    ({ origin: "post" as const, handle: null, text: "", tokens });

  it("keeps the contract-address-over-cashtag rule across sources", () => {
    const picks = pickTokens([
      post({ cashtags: ["WIF"], addresses: [] }),
      { origin: "quote", handle: "innerposter", text: "", tokens: { cashtags: [], addresses: [{ chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" }] } },
    ]);
    expect(picks[0]).toMatchObject({ origin: "quote", token: { kind: "address" } });
    expect(picks[1]).toMatchObject({ origin: "post", token: { kind: "cashtag", symbol: "WIF" } });
  });

  it("orders same-kind tokens by source: the post's own body before a quote, a card, an image", () => {
    const picks = pickTokens([
      { origin: "image", handle: null, text: "", tokens: { cashtags: ["IMG"], addresses: [] } },
      { origin: "card", handle: null, text: "", tokens: { cashtags: ["CARD"], addresses: [] } },
      post({ cashtags: ["OWN"], addresses: [] }),
    ]);
    expect(picks.map((p) => p.origin)).toEqual(["post", "card"]);
  });

  it("caps a rotation post at two chips and de-dupes a token repeated across sources", () => {
    const article = loadFixture("x-tweet-multi.html");
    const picks = pickTokens(parseTweet(article)!.sources);
    expect(MAX_CHIPS).toBe(2);
    expect(picks).toHaveLength(2);
    expect(picks.map((p) => (p.token.kind === "address" ? p.token.address.address : p.token.symbol))).toEqual([
      "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ]);

    const same = { chain: "evm" as const, address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" };
    expect(
      pickTokens([
        post({ cashtags: [], addresses: [same] }),
        { origin: "quote", handle: "a", text: "", tokens: { cashtags: [], addresses: [{ ...same, address: same.address.toUpperCase().replace("0X", "0x") }] } },
      ]),
    ).toHaveLength(1);
  });

  it("returns nothing for a post that mentions no token", () => {
    expect(pickTokens(parseTweet(loadFixture("x-tweet-plain.html"))!.sources)).toEqual([]);
  });
});

describe("chipAnchor", () => {
  it("uses the outer post's own text element, never the quoted one", () => {
    const article = loadFixture("x-tweet-quote.html");
    const anchor = chipAnchor(article)!;
    expect(anchor.append).toBe("after");
    expect(anchor.el.textContent).toContain("Look at this thread");
    expect(anchor.el.textContent).not.toContain("DOGE");
  });

  it("falls back to the quote wrapper when the outer post has no text of its own", () => {
    const article = loadFixture("x-tweet-quote-ca.html");
    const anchor = chipAnchor(article, "quote")!;
    expect(anchor.el.id).toBe("quote-wrapper");
    expect(anchor.append).toBe("after");
  });

  it("follows the source the token came from: the preview for a previewed token, the body otherwise", () => {
    const card = loadFixture("x-tweet-card.html");
    expect(chipAnchor(card, "card")!.el.getAttribute("data-testid")).toBe("card.wrapper");
    expect(chipAnchor(card, "post")!.el.getAttribute("data-testid")).toBe("tweetText");
  });

  it("uses the action bar for an image-only post, which has no row of its own to follow", () => {
    const alt = chipAnchor(loadFixture("x-tweet-alt.html"), "image")!;
    expect(alt.el.id).toBe("action-bar");
    expect(alt.append).toBe("before");
  });

  it("returns null when an article offers nothing safe to mount against", () => {
    document.body.innerHTML = '<article data-testid="tweet"><span>bare</span></article>';
    expect(chipAnchor(document.body.querySelector("article")!)).toBeNull();
  });
});

describe("provenance copy", () => {
  it("prefixes the chip finding for every source but the post's own body", () => {
    expect(originPrefix("post", "62% of labelled buyers exited")).toBe("62% of labelled buyers exited");
    expect(originPrefix("quote", "62% exited")).toBe("Quoted post · 62% exited");
    expect(originPrefix("card", "62% exited")).toBe("Link preview · 62% exited");
    expect(originPrefix("image", "62% exited")).toBe("Image description · 62% exited");
  });

  it("tells the second chip's reader what it is and that opening it is the check", () => {
    // Short enough to survive the chip's one line beside an UNCHECKED pill, and it never
    // implies a verdict: the pill says UNCHECKED and the copy says nothing has been checked.
    expect(alsoMentioned("post")).toBe("Also mentioned. Open to check.");
    expect(alsoMentioned("quote")).toBe("Quoted post · open to check.");
    expect(alsoMentioned("card")).toBe("Link preview · open to check.");
    expect(alsoMentioned("post").length).toBeLessThanOrEqual(30);
  });

  it("names the quoted account so the verdict is not read as the poster's own claim", () => {
    const note = sourceNote({ origin: "quote", handle: "innerposter" }, "$WIF", "quotefan")!;
    expect(note).toBe("$WIF comes from the quoted post by @innerposter, not from @quotefan's own words.");
    expect(sourceNote({ origin: "quote", handle: null }, "$WIF", "quotefan")).toBe(
      "$WIF comes from the quoted post, not from @quotefan's own words.",
    );
  });

  it("says a preview title and an alt text are not the author's words either, and stays silent for the body", () => {
    expect(sourceNote({ origin: "card", handle: null }, "$WIF", "linkposter")).toBe(
      "$WIF comes from the link preview, not from @linkposter's own words. A preview's title is set by the site it links to.",
    );
    expect(sourceNote({ origin: "image", handle: null }, "$PEPE", "chartposter")).toBe(
      "$PEPE comes from an image description, not from @chartposter's own words.",
    );
    expect(sourceNote({ origin: "post", handle: null }, "$WIF", "someone")).toBeNull();
  });

  it("drops the handle clause rather than writing @ with nothing after it", () => {
    expect(sourceNote({ origin: "card", handle: null }, "$WIF", "")).toBe(
      "$WIF comes from the link preview, not from the post's own words. A preview's title is set by the site it links to.",
    );
  });
});
