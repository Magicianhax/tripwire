import "@fontsource-variable/archivo/standard.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../../lib/ui/theme.css";

import type { Chain, ExtractedAddress, SpotTarget, Verdict } from "@tripwire/core";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ApiResult } from "../../lib/api";
import { personIntel, postIntel, resolve } from "../../lib/api";
import type { PersonIntelResponse, PostIntelResponse, ResolveResponse } from "../../lib/api-types";
import { Chip } from "../../lib/ui/Chip";
import { shortAddr } from "../../lib/ui/format";
import { mountReact } from "../../lib/ui/mount";
import { Panel } from "../../lib/ui/Panel";
import { X_MATCHES } from "../../lib/venues";
import { parseTweet, type ParsedTweet } from "../../lib/x/parse";
import { createQueue } from "../../lib/x/queue";

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const CHIP_CONCURRENCY = 4;
const VIEWPORT_MARGIN = "600px 0px";

type ChipToken = { kind: "cashtag"; symbol: string } | { kind: "address"; address: ExtractedAddress };

/** Only the first token in a tweet gets a chip, cashtags taking priority over bare addresses
 * (mirrors the order `extractTokens`/`parseTweet` already return them in). */
function pickToken(tokens: ParsedTweet["tokens"]): ChipToken | null {
  const cashtag = tokens.cashtags[0];
  if (cashtag) return { kind: "cashtag", symbol: cashtag };
  const address = tokens.addresses[0];
  if (address) return { kind: "address", address };
  return null;
}

/** Heuristic for EVM addresses found in tweet text: `resolve` needs a symbol, and a bare 0x
 * address has none, so there's no way to ask the backend which chain it's on. Default to
 * ethereum; if the tweet text mentions "base" anywhere, assume base instead. Solana addresses
 * are unambiguous (base58 alphabet doesn't overlap with 0x hex). */
function chainForAddress(address: ExtractedAddress, tweetText: string): Chain {
  if (address.chain === "solana") return "solana";
  return /base/i.test(tweetText) ? "base" : "ethereum";
}

function errorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire backend offline";
  if (status === 429) return "Nansen credit cap reached";
  return error || "Tripwire check failed";
}

/** The chip's headline: the first hit's label, or the exit_pressure signal's label when
 * nothing hit (there's always at least an exit_pressure signal computed, even for CLEAR). */
function headlineFor(data: PostIntelResponse): string {
  const firstHit = data.hits[0];
  if (firstHit) return firstHit.label;
  const exitPressure = data.signals.find((s) => s.id === "exit_pressure");
  return exitPressure?.label ?? "No signal";
}

/** Clicks anywhere inside a mounted Tripwire shadow-root UI must never reach X's own
 * click-to-open-tweet handlers. */
function stopHostClicks(host: HTMLElement): void {
  host.addEventListener("click", (event) => event.stopPropagation());
}

export default defineContentScript({
  matches: X_MATCHES,
  cssInjectionMode: "ui",
  async main(ctx) {
    // Per-symbol resolve() cache (cashtag -> best token), shared across every tweet on the page.
    const resolveCache = new Map<string, Promise<ApiResult<ResolveResponse>>>();
    // Per-token postIntel("chip") cache, keyed "chain:address", dedupes across tweets that
    // mention the same token.
    const chipIntelCache = new Map<string, Promise<ApiResult<PostIntelResponse>>>();
    // At most CHIP_CONCURRENCY postIntel("chip") calls in flight at once.
    const chipQueue = createQueue(CHIP_CONCURRENCY);

    const discovered = new WeakSet<Element>();
    const processed = new WeakSet<Element>();

    function getChipIntel(target: SpotTarget, timeIso: string | null): Promise<ApiResult<PostIntelResponse>> {
      const key = `${target.chain}:${target.tokenAddress}`;
      const cached = chipIntelCache.get(key);
      if (cached) return cached;
      const started = chipQueue.run(() => postIntel(target, timeIso ?? undefined, "chip"));
      chipIntelCache.set(key, started);
      return started;
    }

    async function resolveTarget(
      token: ChipToken,
      tweetText: string,
    ): Promise<{ target: SpotTarget; symbol: string } | null> {
      if (token.kind === "cashtag") {
        const cached = resolveCache.get(token.symbol) ?? resolve(token.symbol);
        resolveCache.set(token.symbol, cached);
        const result = await cached;
        if (!result.ok || !result.data.best) return null;
        const best = result.data.best;
        return {
          target: { kind: "spot", chain: best.chain, tokenAddress: best.tokenAddress, symbol: best.symbol },
          symbol: best.symbol,
        };
      }
      const chain = chainForAddress(token.address, tweetText);
      return {
        target: { kind: "spot", chain, tokenAddress: token.address.address },
        symbol: shortAddr(token.address.address),
      };
    }

    async function processTweet(article: Element): Promise<void> {
      if (processed.has(article)) return;
      processed.add(article);

      const parsedTweet = parseTweet(article);
      if (!parsedTweet) return;
      // Rebind to a fresh, non-null const: TS doesn't retain narrowing of `parsedTweet`
      // through the nested `function togglePanel` declaration below.
      const tweet: ParsedTweet = parsedTweet;

      const token = pickToken(tweet.tokens);
      if (!token) return;

      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      if (!tweetTextEl) return;

      const resolved = await resolveTarget(token, tweet.text);
      if (!resolved) return;
      const { target, symbol } = resolved;

      let expanded = false;
      let lastVerdict: Verdict | "LOADING" = "LOADING";
      let lastHeadline = "";
      let panelMount: Awaited<ReturnType<typeof mountReact>> | null = null;
      let panelDataPromise: Promise<[ApiResult<PostIntelResponse>, ApiResult<PersonIntelResponse>]> | null = null;

      const chipMount = await mountReact(
        ctx,
        { position: "inline", anchor: tweetTextEl, append: "after" },
        <Chip verdict={lastVerdict} symbol={symbol} headline={lastHeadline} expanded={expanded} onClick={() => void togglePanel()} />,
      );
      stopHostClicks(chipMount.ui.shadowHost);

      function renderChip(): void {
        chipMount.update(
          <Chip verdict={lastVerdict} symbol={symbol} headline={lastHeadline} expanded={expanded} onClick={() => void togglePanel()} />,
        );
      }

      async function togglePanel(): Promise<void> {
        expanded = !expanded;
        renderChip();

        if (!expanded) {
          panelMount?.ui.remove();
          panelMount = null;
          return;
        }

        panelDataPromise ??= Promise.all([
          postIntel(target, tweet.timeIso ?? undefined, "panel"),
          personIntel(tweet.handle, tweet.displayName, target),
        ]);
        const openId = expanded;
        const [panelResult, personResult] = await panelDataPromise;
        if (expanded !== openId) return; // closed again before the data came back

        if (!panelResult.ok) {
          expanded = false;
          lastVerdict = "UNCHECKED";
          lastHeadline = errorHeadline(panelResult.status, panelResult.error);
          renderChip();
          panelDataPromise = null; // allow a retry on the next open
          return;
        }

        const node = (
          <Panel
            data={panelResult.data}
            title={`$${symbol}`}
            onClose={() => void togglePanel()}
            person={personResult.ok ? personResult.data : null}
          />
        );
        if (panelMount) {
          panelMount.update(node);
        } else {
          panelMount = await mountReact(ctx, { position: "inline", anchor: chipMount.ui.shadowHost, append: "after" }, node);
          stopHostClicks(panelMount.ui.shadowHost);
        }
      }

      const chipResult = await getChipIntel(target, tweet.timeIso);
      if (chipResult.ok) {
        lastVerdict = chipResult.data.verdict;
        lastHeadline = headlineFor(chipResult.data);
      } else {
        lastVerdict = "UNCHECKED";
        lastHeadline = errorHeadline(chipResult.status, chipResult.error);
      }
      renderChip();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          void processTweet(entry.target);
        }
      },
      { rootMargin: VIEWPORT_MARGIN },
    );

    function considerArticle(article: Element): void {
      if (discovered.has(article)) return;
      discovered.add(article);
      io.observe(article);
    }

    function discoverIn(root: Element | Document): void {
      if (root instanceof Element && root.matches(TWEET_SELECTOR)) considerArticle(root);
      for (const el of root.querySelectorAll(TWEET_SELECTOR)) considerArticle(el);
    }

    discoverIn(document);

    const mo = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) discoverIn(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      mo.disconnect();
      io.disconnect();
    });
  },
});
