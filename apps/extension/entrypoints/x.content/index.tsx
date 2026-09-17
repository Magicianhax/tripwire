import "../../lib/ui/theme.css";

import type { SpotTarget, Verdict } from "@tripwire/core";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ApiResult } from "../../lib/api";
import { health, personIntel, postIntel, resolve } from "../../lib/api";
import { createReplayFlag } from "../../lib/replay";
import type { PersonIntelResponse, PostIntelResponse, ResolveResponse } from "../../lib/api-types";
import { Chip } from "../../lib/ui/Chip";
import { shortAddr } from "../../lib/ui/format";
import { mountReact } from "../../lib/ui/mount";
import { Panel } from "../../lib/ui/Panel";
import { X_MATCHES } from "../../lib/venues";
import { createResultCache } from "../../lib/x/cache";
import { createMountTracker } from "../../lib/x/mounts";
import { chipErrorHeadline, chipHeadline } from "../../lib/x/headline";
import { chainForAddress, pickToken, type ChipToken } from "../../lib/x/pick";
import { parseTweet, type ParsedTweet } from "../../lib/x/parse";
import { createQueue } from "../../lib/x/queue";

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const CHIP_CONCURRENCY = 4;
const VIEWPORT_MARGIN = "600px 0px";
const SWEEP_DEBOUNCE_MS = 1000;

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
    // A failed lookup (backend offline, budget, no match) evicts itself so a later tweet with
    // the same cashtag retries instead of being stuck on the first failure for the whole tab.
    const resolveCache = createResultCache<string, ApiResult<ResolveResponse>>();
    // Per-token postIntel("chip") cache, keyed "chain:address", dedupes across tweets that
    // mention the same token — same eviction-on-failure behavior as resolveCache.
    const chipIntelCache = createResultCache<string, ApiResult<PostIntelResponse>>();
    // At most CHIP_CONCURRENCY postIntel("chip") calls in flight at once.
    const chipQueue = createQueue(CHIP_CONCURRENCY);

    // Backend replay mode, asked once per page session: every chip and panel shows REPLAY.
    const getReplay = createReplayFlag(health);

    const discovered = new WeakSet<Element>();
    const processed = new WeakSet<Element>();
    // Chip/panel mounts per tweet article, unmounted once X drops the article from the DOM.
    const mounts = createMountTracker();

    function getChipIntel(target: SpotTarget, timeIso: string | null): Promise<ApiResult<PostIntelResponse>> {
      const key = `${target.chain}:${target.tokenAddress}`;
      return chipIntelCache.get(key, () => chipQueue.run(() => postIntel(target, timeIso ?? undefined, "chip")));
    }

    async function resolveTarget(
      token: ChipToken,
      tweetText: string,
    ): Promise<{ target: SpotTarget; symbol: string } | null> {
      if (token.kind === "cashtag") {
        const result = await resolveCache.get(token.symbol, () => resolve(token.symbol));
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
      const replay = await getReplay();
      if (!article.isConnected) {
        processed.delete(article); // scrolled away while resolving; retry if X re-inserts it
        return;
      }
      const { target, symbol } = resolved;

      let expanded = false;
      let lastVerdict: Verdict | "LOADING" = "LOADING";
      let lastHeadline = "";
      let panelMount: Awaited<ReturnType<typeof mountReact>> | null = null;
      let panelDataPromise: Promise<[ApiResult<PostIntelResponse>, ApiResult<PersonIntelResponse>]> | null = null;

      const chipMount = await mountReact(
        ctx,
        { position: "inline", anchor: tweetTextEl, append: "after" },
        <Chip verdict={lastVerdict} symbol={symbol} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void togglePanel()} />,
      );
      stopHostClicks(chipMount.ui.shadowHost);
      mounts.track(article, chipMount);

      function renderChip(): void {
        chipMount.update(
          <Chip verdict={lastVerdict} symbol={symbol} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void togglePanel()} />,
        );
      }

      async function togglePanel(): Promise<void> {
        expanded = !expanded;
        renderChip();

        if (!expanded) {
          if (panelMount) {
            panelMount.ui.remove();
            mounts.untrack(article, panelMount);
          }
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
          lastHeadline = chipErrorHeadline(panelResult.status, panelResult.error);
          renderChip();
          panelDataPromise = null; // allow a retry on the next open
          return;
        }

        const node = (
          <Panel
            data={panelResult.data}
            title={`$${symbol}`}
            onClose={() => void togglePanel()}
            replay={replay}
            person={personResult.ok ? personResult.data : null}
          />
        );
        if (panelMount) {
          panelMount.update(node);
        } else {
          panelMount = await mountReact(ctx, { position: "inline", anchor: chipMount.ui.shadowHost, append: "after" }, node);
          stopHostClicks(panelMount.ui.shadowHost);
          mounts.track(article, panelMount);
        }
      }

      const chipResult = await getChipIntel(target, tweet.timeIso);
      if (chipResult.ok) {
        lastVerdict = chipResult.data.verdict;
        lastHeadline = chipHeadline(chipResult.data);
      } else {
        lastVerdict = "UNCHECKED";
        lastHeadline = chipErrorHeadline(chipResult.status, chipResult.error);
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

    let sweepTimer: ReturnType<typeof setTimeout> | null = null;
    function sweepDetached(): void {
      sweepTimer = null;
      for (const article of mounts.sweep()) {
        // Forget it entirely: if X re-inserts the same element later, it gets a fresh chip.
        processed.delete(article);
        discovered.delete(article);
      }
    }

    const mo = new MutationObserver((mutations) => {
      let removed = false;
      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) removed = true;
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) discoverIn(node);
        }
      }
      if (removed && !sweepTimer) sweepTimer = setTimeout(sweepDetached, SWEEP_DEBOUNCE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      if (sweepTimer) clearTimeout(sweepTimer);
      mo.disconnect();
      io.disconnect();
    });
  },
});
