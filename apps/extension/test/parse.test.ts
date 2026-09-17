// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTweet } from "../lib/x/parse";

const FIXTURES_DIR = resolve(process.cwd(), "../../fixtures/html");

function loadFixture(name: string): Element {
  const html = readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
  document.body.innerHTML = html;
  const article = document.body.querySelector('article[data-testid="tweet"]');
  if (!article) throw new Error(`fixture ${name} has no outer article`);
  return article;
}

describe("parseTweet", () => {
  it("parses id, handle, displayName, timeIso, text and a cashtag from x-tweet-cashtag.html", () => {
    const article = loadFixture("x-tweet-cashtag.html");
    const parsed = parseTweet(article);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("1836452718293746501");
    expect(parsed?.handle).toBe("degenwhale");
    expect(parsed?.displayName).toBe("Degen Whale 🐋");
    expect(parsed?.timeIso).toBe("2026-09-17T14:22:00.000Z");
    expect(parsed?.text).toContain("gm frens,");
    expect(parsed?.text).toContain("is looking spicy today");
    expect(parsed?.tokens.cashtags).toEqual(["WIF"]);
    expect(parsed?.tokens.addresses).toEqual([]);
  });

  it("parses a Solana address in text with no cashtag from x-tweet-address.html", () => {
    const article = loadFixture("x-tweet-address.html");
    const parsed = parseTweet(article);

    expect(parsed).not.toBeNull();
    expect(parsed?.handle).toBe("onchainsleuth");
    expect(parsed?.tokens.cashtags).toEqual([]);
    expect(parsed?.tokens.addresses).toEqual([
      { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    ]);
  });

  it("finds no tokens in a plain tweet (x-tweet-plain.html)", () => {
    const article = loadFixture("x-tweet-plain.html");
    const parsed = parseTweet(article);

    expect(parsed).not.toBeNull();
    expect(parsed?.tokens.cashtags).toEqual([]);
    expect(parsed?.tokens.addresses).toEqual([]);
    expect(parsed?.text).toBe("Just had coffee. Good morning everyone.");
  });

  it("parses only the outer tweet's own text for a quote tweet, ignoring the inner article's cashtag", () => {
    const article = loadFixture("x-tweet-quote.html");
    const parsed = parseTweet(article);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("1836452718293747555");
    expect(parsed?.handle).toBe("quotefan");
    expect(parsed?.displayName).toBe("Quote Fan");
    expect(parsed?.text).toBe("Look at this thread, wild stuff");
    expect(parsed?.text).not.toContain("DOGE");
    expect(parsed?.tokens.cashtags).toEqual([]);
    expect(parsed?.tokens.addresses).toEqual([]);
  });

  it("returns null when there is no tweetText", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><div><a href="/x"><span>X</span></a></div></div>
        <a href="/x/status/1"><time datetime="2026-01-01T00:00:00.000Z">now</time></a>
      </article>`;
    const article = document.body.querySelector('article[data-testid="tweet"]')!;
    expect(parseTweet(article)).toBeNull();
  });

  it("returns null when there is no status id", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><div><a href="/x"><span>X</span></a></div></div>
        <div data-testid="tweetText">no status link here</div>
      </article>`;
    const article = document.body.querySelector('article[data-testid="tweet"]')!;
    expect(parseTweet(article)).toBeNull();
  });
});
