// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uniswapAdapter } from "../lib/adapters/uniswap";
import type { TargetGap } from "../lib/adapters/types";
import { gapHeadline, gapKey } from "../entrypoints/venues.content/format";

/**
 * Round 1.4.9. Reported: app.uniswap.org/swap with Sell = ETH and Buy = GIZA on Base — both
 * picked through the token picker, never through the URL — read
 * "UNCHECKED — Select a network to check GIZA". The user had selected the network. Telling
 * someone to do what they have already done is the worst failure in the set.
 *
 * What the live page actually gives us (apps/extension/test/fixtures/venues/uniswap-ui-selected.json,
 * read read-only with Playwright on 2026-09-20):
 *
 * - The URL stays bare `/swap`. It NEVER gains `chain=` or `outputCurrency=` for a UI-chosen
 *   token — not after a delay, not ever. There is nothing to wait for.
 * - The Buy token's chain is on a badge whose only machine-readable signal is its own test id:
 *   `data-testid="network-logo-8453"`. No `data-chain-id`, `img alt=""`, no `title`, no
 *   `aria-label` — which is exactly why the old attribute scan came back empty.
 * - The Sell row carries its own `network-logo-1`, so the read has to stay inside the Buy row.
 * - There is no page-level network selector at all. The chain lives only on the token badges.
 */

const FIXTURES = join(process.cwd(), "test", "fixtures", "venues");
const GIZA_BASE = "0x590830dfdf9a3f68afcdde2694773debdf267774";

function load(venue: string): Document {
  document.body.innerHTML = readFileSync(join(FIXTURES, `${venue}.html`), "utf8");
  return document;
}

const gapOf = (doc: Document, href: string): TargetGap | null => {
  const url = new URL(href);
  return uniswapAdapter.readTarget(doc, url) ? null : (uniswapAdapter.readGap?.(doc, url) ?? null);
};

const outputRow = (doc: Document) => doc.querySelector('[data-testid="choose-output-token"]')!;
const badge = (doc: Document) => outputRow(doc).querySelector('[data-testid^="network-logo-"]')!;

describe("uniswap: a token picked through the UI, with nothing in the URL", () => {
  const doc = () => load("uniswap-ui-selected");

  it("reads Base off the Buy token's badge and asks for GIZA on Base", () => {
    // The whole defect: this used to be { kind: "missing-chain" } -> "Select a network to
    // check GIZA", on a page whose Buy button is wearing a Base badge.
    expect(gapOf(doc(), "https://app.uniswap.org/swap")).toEqual({ kind: "symbol", symbol: "GIZA", chainHint: "base" });
  });

  it("never says 'select a network' about a page that shows one", () => {
    expect(gapHeadline(gapOf(doc(), "https://app.uniswap.org/swap"))).not.toContain("Select a network");
  });

  it("takes the chain from the Buy badge, not from the Sell side's own badge", () => {
    // The Sell row is ETH on chain 1. A page-wide scan would see two chains and give up (or,
    // worse, guard the Buy symbol on the Sell chain).
    expect(badge(doc()).getAttribute("data-testid")).toBe("network-logo-8453");
    expect(doc().querySelector('[data-testid="choose-input-token"] [data-testid^="network-logo-"]')!.getAttribute("data-testid")).toBe("network-logo-1");
    expect(gapOf(doc(), "https://app.uniswap.org/swap")).toEqual({ kind: "symbol", symbol: "GIZA", chainHint: "base" });
  });

  it("names a badge chain it does not cover instead of asking for a network", () => {
    // Unichain (130) is a real Uniswap destination outside Tripwire's coverage. The page HAS a
    // network; the honest answer is that we have no data for it.
    const d = doc();
    badge(d).setAttribute("data-testid", "network-logo-130");
    const gap = gapOf(d, "https://app.uniswap.org/swap");
    expect(gap).toEqual({ kind: "unsupported-chain", label: "Unichain", symbol: "GIZA" });
    expect(gapHeadline(gap)).toBe("No onchain data for GIZA on Unichain");
  });

  it("stays silent about the chain rather than guessing when the badge names an id nobody knows", () => {
    const d = doc();
    badge(d).setAttribute("data-testid", "network-logo-99999999");
    const gap = gapOf(d, "https://app.uniswap.org/swap");
    expect(gap).toEqual({ kind: "unsupported-chain", label: "chain 99999999", symbol: "GIZA" });
    expect(gapHeadline(gap)).toBe("No onchain data for GIZA on this network");
  });

  it("says it is still reading the page while the Buy row's badge has not arrived", () => {
    // The logo container mounted, the badge inside it has not: a half-drawn row, not a
    // chainless one. "Checking" is the only thing true about it.
    const d = doc();
    badge(d).remove();
    const gap = gapOf(d, "https://app.uniswap.org/swap");
    expect(gap).toEqual({ kind: "pending", symbol: "GIZA" });
    expect(gapHeadline(gap)).toBe("Checking what this page is showing…");
  });

  it("admits it cannot tell the network when the Buy row has no logo at all", () => {
    const d = doc();
    outputRow(d).querySelector('[data-testid="token-logo"]')!.remove();
    const gap = gapOf(d, "https://app.uniswap.org/swap");
    expect(gap).toEqual({ kind: "unknown-chain", symbol: "GIZA" });
    expect(gapHeadline(gap)).toBe("Tripwire can't tell which network GIZA is on");
  });

  it("keeps the URL's chain authoritative for the URL's own contract", () => {
    // `chain` and `outputCurrency` are written together and belong together. A badge left over
    // from the previously selected token must never re-chain the URL's address.
    const d = doc();
    badge(d).setAttribute("data-testid", "network-logo-1");
    expect(uniswapAdapter.readTarget(d, new URL(`https://app.uniswap.org/swap?chain=base&outputCurrency=${GIZA_BASE}`))).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: GIZA_BASE,
    });
  });

  it("lets the badge supply the chain for a URL that names only the contract", () => {
    expect(uniswapAdapter.readTarget(doc(), new URL(`https://app.uniswap.org/swap?outputCurrency=${GIZA_BASE}`))).toEqual({
      kind: "spot",
      chain: "base",
      tokenAddress: GIZA_BASE,
    });
  });

  it("gives the settling state and the unknown-chain state different identities", () => {
    // The change-detection loop keys off gapKey: if "checking" and "can't tell" collapsed to
    // the same key, the strip would never move off whichever it showed first.
    expect(gapKey({ kind: "pending", symbol: "GIZA" })).not.toBe(gapKey({ kind: "unknown-chain", symbol: "GIZA" }));
  });
});

describe("uniswap: the default swap page, nothing chosen", () => {
  it("asks for a token, never for a network", () => {
    // Live: Sell = ETH (badge 1), Buy = "Select token" with no logo and no badge.
    const d = load("uniswap-ui-selected");
    const row = outputRow(d);
    row.querySelector('[data-testid="token-logo"]')!.remove();
    row.querySelector('[data-testid="choose-output-token-label"]')!.textContent = "Select token";
    expect(gapOf(d, "https://app.uniswap.org/swap")).toBeNull();
    expect(gapHeadline(null)).toBe("Select a token to see its onchain activity");
  });
});
