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
import { Popover } from "../../lib/ui/Popover";
import { X_MATCHES } from "../../lib/venues";
import { createBadgeController } from "../../lib/x/author-badges";
import { createResultCache } from "../../lib/x/cache";
import { createMountTracker } from "../../lib/x/mounts";
import { createPanelToggle } from "../../lib/x/panel-toggle";
import { chipErrorHeadline, chipHeadline } from "../../lib/x/headline";
import { chainForAddress, pickToken, type ChipToken } from "../../lib/x/pick";
import { parseTweet, type ParsedTweet } from "../../lib/x/parse";
import { createQueue } from "../../lib/x/queue";

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const CHIP_CONCURRENCY = 4;
const VIEWPORT_MARGIN = "600px 0px";
const SWEEP_DEBOUNCE_MS = 1000;
/** The evidence card floats above X's own header and menus. */
const POPOVER_Z_INDEX = 2_147_483_000;

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
    // Author badges (Nansen label, linked Hyperliquid/Polymarket wallets) next to the username.
    const badges = createBadgeController({ ctx, mounts, stopHostClicks, zIndex: POPOVER_Z_INDEX });

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

      // Badges are about the author, so they run for every post, token or not.
      void badges.attach(article, tweet);

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
      let panelDataPromise: Promise<[ApiResult<PostIntelResponse>, ApiResult<PersonIntelResponse>]> | null = null;

      const chipMount = await mountReact(
        ctx,
        { position: "inline", anchor: tweetTextEl, append: "after" },
        <Chip verdict={lastVerdict} symbol={symbol} chain={target.chain} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void panel.toggle()} />,
      );
      stopHostClicks(chipMount.ui.shadowHost);
      mounts.track(article, chipMount);

      function renderChip(): void {
        chipMount.update(
          <Chip verdict={lastVerdict} symbol={symbol} chain={target.chain} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void panel.toggle()} />,
        );
      }

      // Sequenced open/close: rapid clicks never mount two cards (lib/x/panel-toggle.ts). The
      // card is tracked against this article, so the sweep removes it with the chip.
      const panel = createPanelToggle({
        onExpandedChange(value) {
          expanded = value;
          renderChip();
        },
        async open(isCurrent) {
          panelDataPromise ??= Promise.all([
            postIntel(target, tweet.timeIso ?? undefined, "panel"),
            personIntel(tweet.handle, tweet.displayName, target),
          ]);
          const [panelResult, personResult] = await panelDataPromise;
          // Already loaded for the badge row (one fetch per handle per page session).
          const badgeResult = tweet.handle ? await badges.load(tweet.handle, tweet.displayName) : null;
          if (!isCurrent()) return null; // closed again before the data came back

          if (!panelResult.ok) {
            lastVerdict = "UNCHECKED";
            lastHeadline = chipErrorHeadline(panelResult.status, panelResult.error);
            panelDataPromise = null; // allow a retry on the next open
            return null;
          }

          // The chip's own button: the card opens beside it, clicks on it toggle instead of
          // counting as "outside", and focus returns to it on close.
          const chipButton = chipMount.ui.shadow.querySelector<HTMLButtonElement>(".tw-chip");
          const node = (
            <Popover
              anchor={chipButton}
              returnFocus={() => chipButton}
              verdict={panelResult.data.verdict}
              onClose={() => {
                if (panel.expanded) void panel.toggle();
              }}
            >
              <Panel
                data={panelResult.data}
                title={token.kind === "cashtag" ? `$${symbol}` : symbol}
                onClose={() => void panel.toggle()}
                replay={replay}
                person={personResult.ok ? personResult.data : null}
                headline={chipHeadline(panelResult.data)}
                postTimeIso={tweet.timeIso}
                chain={target.chain}
                author={badges.authorSection(
                  tweet,
                  personResult.ok && personResult.data.entity !== null,
                  badgeResult?.ok ? badgeResult.data : null,
                )}
              />
            </Popover>
          );
          // Its own shadow root on <body>, never inside the tweet: X's layout can't clip or
          // restyle it, and the post's height never changes.
          const panelMount = await mountReact(ctx, { position: "modal", zIndex: POPOVER_Z_INDEX }, node);
          stopHostClicks(panelMount.ui.shadowHost);
          return panelMount;
        },
        onMounted: (m) => mounts.track(article, m),
        onRemoved: (m) => mounts.untrack(article, m),
      });

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
