import "../../lib/ui/theme.css";

import type { ReactNode } from "react";
import type { SpotTarget, Verdict } from "@tripwire/core";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ApiResult } from "../../lib/api";
import { depth, health, personIntel, postIntel, resolve } from "../../lib/api";
import { cardSize, setCardSize, warmCardSizes, type CardSize } from "../../lib/card-size";
import { claimToken } from "../../lib/claimed-tokens";
import { runContentTask } from "../../lib/content-lifecycle";
import { createReplayFlag } from "../../lib/replay";
import type { PersonIntelResponse, PostIntelResponse, ResolveResponse } from "../../lib/api-types";
import { Chip } from "../../lib/ui/Chip";
import { chipLabel, shortAddr } from "../../lib/ui/format";
import { mountReact } from "../../lib/ui/mount";
import { Panel } from "../../lib/ui/Panel";
import { Popover } from "../../lib/ui/Popover";
import { attachMarketsOnly } from "../../lib/x/market-only";
import { X_MATCHES } from "../../lib/venues";
import { createBadgeController } from "../../lib/x/author-badges";
import { createResultCache } from "../../lib/x/cache";
import { createMountTracker } from "../../lib/x/mounts";
import { createPanelToggle } from "../../lib/x/panel-toggle";
import { alsoMentioned, chipErrorHeadline, chipHeadline, originPrefix, sourceNote } from "../../lib/x/headline";
import { chainForAddress, pickTokens, type ChipToken, type PickedToken } from "../../lib/x/pick";
import { parseTweet, type ParsedTweet } from "../../lib/x/parse";
import { chipAnchor } from "../../lib/x/anchor";
import { createQueue } from "../../lib/x/queue";
import { createProfileDiscovery, parseProfile } from "../../lib/x/profile";

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const CHIP_CONCURRENCY = 4;
const VIEWPORT_MARGIN = "600px 0px";
const SWEEP_DEBOUNCE_MS = 1000;
/** The evidence card floats above X's own header and menus. */
const POPOVER_Z_INDEX = 2_147_483_000;
/**
 * The chip's shadow host, styled from inside the shadow root because WXT's own
 * `:host { all: initial !important }` reset beats any outer inline style.
 *
 * The cap is the anchor-fit rule (non-negotiable #5). X lays a post out in a grid column whose
 * `min-width` is `auto`, so the pill's intrinsic width becomes that column's minimum — and the
 * finding is deliberately `nowrap`, so a long one drags the whole post wider than the timeline
 * and the page grows a horizontal scrollbar. A pixel cap bounds what the chip can contribute;
 * the finding keeps its ellipsis, its `title` and the card behind it.
 *
 * The cap is a plain pixel value on purpose: Chrome treats `min(100%, 420px)` as indefinite
 * while it computes an intrinsic contribution, so the percentage form leaves the blowout in
 * place. `.tw-chip`'s own `max-width: 100%` still keeps the pill inside a column narrower than
 * the cap, so the two rules bound it from both sides.
 *
 * `inline-block` is what lets a post's second chip sit beside the first instead of under it.
 */
const chipHostCss = (extra = ""): string =>
  `:host { display: inline-block !important; max-width: 420px !important; ${extra} }`;
/** The gap between two chips sits on the first one's right, not the second one's left: at 380px
 * two chips usually wrap onto separate lines in X's column, and a left margin would indent the
 * wrapped one out of alignment with the first. A trailing right margin is invisible there. */
const FIRST_OF_TWO_CSS = chipHostCss("margin-right: 6px !important;");

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
    // The remembered compact/expanded choice, warmed once so a card can read it during render:
    // a card has to mount in the same frame as the click, and storage is asynchronous.
    void warmCardSizes();

    const discovered = new WeakSet<Element>();
    const processed = new WeakSet<Element>();
    // A post's second chip spends nothing until it is opened, but it is still DOM on a timeline
    // that can be thousands of posts long: it is not built until the post is actually on screen.
    const visibleWaiters = new WeakMap<Element, () => void>();
    const visible = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visible.unobserve(entry.target);
        visibleWaiters.get(entry.target)?.();
        visibleWaiters.delete(entry.target);
      }
    });
    const whenVisible = (el: Element): Promise<void> =>
      new Promise((done) => {
        visibleWaiters.set(el, done);
        visible.observe(el);
      });
    // Chip/panel mounts per tweet article, unmounted once X drops the article from the DOM.
    const mounts = createMountTracker();
    // Author badges (Nansen label, linked Hyperliquid/Polymarket wallets) next to the username.
    const badges = createBadgeController({ ctx, mounts, stopHostClicks, zIndex: POPOVER_Z_INDEX });
    const profiles = createProfileDiscovery({
      read: () => parseProfile(document, location.pathname),
      attach: (profile, isCurrent) => badges.attachAt(profile.owner, profile, profile.anchor, isCurrent),
    });
    // Polling bounds scans on X's busy timeline and catches pushState navigation plus late hydration.
    void runContentTask(ctx, profiles.tick);
    const profileTimer = ctx.setInterval(() => void runContentTask(ctx, profiles.tick), 2000);

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
      if (processed.has(article) || ctx.isInvalid) return;
      processed.add(article);

      const parsedTweet = parseTweet(article);
      if (!parsedTweet) return;
      // Rebind to a fresh, non-null const: TS doesn't retain narrowing of `parsedTweet`
      // through the nested `function togglePanel` declaration below.
      const tweet: ParsedTweet = parsedTweet;

      // Badges are about the author, so they run for every post, token or not.
      void runContentTask(ctx, () => badges.attach(article, tweet));

      // Every token the post puts on screen, not just the first in its own body: a quoted post,
      // a link preview and an image description are token sources too. Capped at two.
      const picks = pickTokens(tweet.sources);
      const first = picks[0];
      if (!first) return;

      // Never `article.querySelector('[data-testid="tweetText"]')`: on a post with no body of
      // its own that returns the *quoted* post's text element, and the chip would mount inside
      // someone else's post.
      const anchor = chipAnchor(article, first.origin);
      if (!anchor) return;

      const host = await attachTokenChip(article, tweet, first, anchor.el, anchor.append, true, picks.length > 1);
      const second = picks[1];
      if (!second || !host) return;
      // The second chip costs nothing until it is opened, and it is not even built until the
      // post is actually on screen.
      void runContentTask(ctx, async () => {
        await whenVisible(article);
        if (ctx.isInvalid || !article.isConnected || !host.isConnected) return;
        await attachTokenChip(article, tweet, second, host, "after", false);
      });
    }

    /**
     * One token's chip, and the card it opens. Returns the chip's shadow host so the next
     * token's chip can be appended after it rather than ahead of it.
     *
     * `eager` is the credit decision. The first chip pays for its own `postIntel("chip")` check
     * on sight, as it always has. A second chip does not: it mounts as an explicit unchecked
     * affordance and spends only when the reader opens it.
     */
    async function attachTokenChip(
      article: Element,
      tweet: ParsedTweet,
      picked: PickedToken,
      anchorEl: Element,
      append: "after" | "before",
      eager: boolean,
      hasSibling = false,
    ): Promise<HTMLElement | null> {
      const { token, origin } = picked;
      const css = hasSibling ? FIRST_OF_TWO_CSS : chipHostCss();

      // A cashtag names an asset search, not a chain/contract. Start with explicit market
      // choice instead of presenting one chain's automatically selected verdict as universal.
      if (token.kind === "cashtag") {
        if (!article.isConnected) return null;
        return await attachMarketsOnly({ctx,mounts,article,anchor:anchorEl,append,symbol:token.symbol,origin,css,zIndex:POPOVER_Z_INDEX,stopHostClicks});
      }

      // The chain hint reads the post's own words plus the words the token itself came from, so
      // a "on base" inside a quoted post still reaches the address it sits next to.
      const resolved = await resolveTarget(token, `${tweet.text} ${picked.text}`);
      if (!resolved) return null;
      const replay = await getReplay();
      if (!article.isConnected || ctx.isInvalid) {
        processed.delete(article); // scrolled away while resolving; retry if X re-inserts it
        return null;
      }
      const { target, symbol } = resolved;
      // This address is a token, not a wallet: the wallet lens must not also mark it.
      claimToken(target.tokenAddress);

      // The chip opens carrying the only name the post gave us -- the short contract address --
      // and relabels to the ticker once `tgm/token-information` answers (1.1.5). The chip's own
      // check already pays for that call, so this costs nothing and adds no request.
      let chipName = chipLabel(symbol, null);

      let expanded = false;
      // A second chip has not been checked and does not pretend otherwise: UNCHECKED with the
      // reason, never a verdict pill that could be mistaken for CLEAR.
      let checked = eager;
      let lastVerdict: Verdict | "LOADING" = eager ? "LOADING" : "UNCHECKED";
      let lastHeadline = eager ? "" : alsoMentioned(origin);
      let panelDataPromise: Promise<[ApiResult<PostIntelResponse>, ApiResult<PersonIntelResponse>]> | null = null;

      const chipMount = await mountReact(
        ctx,
        { position: "inline", anchor: anchorEl, append, css },
        <Chip verdict={lastVerdict} symbol={chipName.text} isSymbol={chipName.isSymbol} chain={target.chain} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void runContentTask(ctx, panel.toggle)} />,
      );
      stopHostClicks(chipMount.ui.shadowHost);
      mounts.track(article, chipMount);

      function renderChip(): void {
        // An update, never a remount: the chip keeps its element, so relabelling cannot move the
        // anchor or reflow the post around it.
        chipMount.update(
          <Chip verdict={lastVerdict} symbol={chipName.text} isSymbol={chipName.isSymbol} chain={target.chain} headline={lastHeadline} expanded={expanded} replay={replay} onClick={() => void runContentTask(ctx, panel.toggle)} />,
        );
      }

      // Sequenced open/close: rapid clicks never mount two cards (lib/x/panel-toggle.ts). The
      // card is tracked against this article, so the sweep removes it with the chip.
      const panel = createPanelToggle({
        onExpandedChange(value) {
          expanded = value;
          renderChip();
        },
        /**
         * The card goes up first; the data catches up.
         *
         * The old order was fetch, then mount, which is why "it takes some time to load": the
         * click produced nothing at all until the slowest call answered. Now the click mounts a
         * card carrying what it already knows -- the symbol, the chain, the post's age -- with a
         * skeleton per section, and each answer re-renders it in place. Nothing below a section
         * moves when its numbers land, because the skeleton reserved the height.
         */
        async open(isCurrent) {
          // An unchecked second chip announces its check the moment it is asked for one, so the
          // pill never sits on UNCHECKED while the call it just paid for is in flight.
          if (!checked) {
            lastVerdict = "LOADING";
            renderChip();
          }
          // The chip's own button: the card opens beside it, clicks on it toggle instead of
          // counting as "outside", and focus returns to it on close.
          const chipButton = chipMount.ui.shadow.querySelector<HTMLButtonElement>(".tw-chip");
          // Captured here, not read inside the render closure: `token` is the resolved one this
          // chip was built from, and TS can't see that it stays non-null across the callback.
          // The card's first frame names the token the same way its last one will: once the
          // chip's own check has resolved a ticker, the cashtag is already correct, so the
          // header never flips from `0x1234…abcd` to `$WIF` under the reader.
          const cardTitle = chipName.isSymbol ? `$${chipName.text}` : chipName.text;
          let size: CardSize = cardSize("spot");
          let panelResult: ApiResult<PostIntelResponse> | null = null;
          let personResult: ApiResult<PersonIntelResponse> | null = null;
          let badgeResult: Awaited<ReturnType<typeof badges.load>> | null = null;
          let panelMount: Awaited<ReturnType<typeof mountReact>> | null = null;

          function cardNode(): ReactNode {
            const ok = panelResult?.ok ? panelResult.data : null;
            return (
              <Popover
                anchor={chipButton}
                returnFocus={() => chipButton}
                verdict={ok?.verdict ?? "LOADING"}
                size={size}
                onToggleSize={() => {
                  size = size === "expanded" ? "compact" : "expanded";
                  setCardSize("spot", size);
                  panelMount?.update(cardNode());
                }}
                onClose={() => {
                  if (panel.expanded) void runContentTask(ctx, panel.toggle);
                }}
              >
                <Panel
                  enableMarkets
                  data={ok}
                  error={panelResult && !panelResult.ok ? chipErrorHeadline(panelResult.status, panelResult.error) : null}
                  title={cardTitle}
                  onClose={() => void runContentTask(ctx, panel.toggle)}
                  replay={replay}
                  person={personResult?.ok ? personResult.data : null}
                  headline={ok ? chipHeadline(ok) : undefined}
                  postTimeIso={tweet.timeIso}
                  chain={target.chain}
                  address={target.tokenAddress}
                  target={target}
                  onDepth={async (sections) => {
                    const result = await depth(target, sections);
                    return result.ok
                      ? { ok: true as const, data: result.data }
                      : { ok: false as const, error: chipErrorHeadline(result.status, result.error) };
                  }}
                  onTimeframe={async (timeframe) => {
                    const result = await postIntel(target, tweet.timeIso ?? undefined, "panel", timeframe);
                    return result.ok ? result.data.panel : null;
                  }}
                  // Only once the lookup has answered: "No Nansen label for @x" is a claim, and
                  // the card must not make it before it knows. The source note travels with it:
                  // a label line about an author who never typed this token is the same claim.
                  author={personResult ? badges.authorSection(tweet, personResult.ok && personResult.data.entity !== null, badgeResult?.ok ? badgeResult.data : null, sourceNote(picked, cardTitle, tweet.handle)) : null}
                />
              </Popover>
            );
          }

          // Its own shadow root on <body>, never inside the tweet: X's layout can't clip or
          // restyle it, and the post's height never changes. Mounted before anything is awaited.
          panelMount = await mountReact(ctx, { position: "modal", zIndex: POPOVER_Z_INDEX }, cardNode());
          stopHostClicks(panelMount.ui.shadowHost);
          if (!isCurrent()) {
            panelMount.ui.remove();
            return null;
          }

          panelDataPromise ??= Promise.all([
            postIntel(target, tweet.timeIso ?? undefined, "panel"),
            personIntel(tweet.handle, tweet.displayName, target),
          ]);
          void runContentTask(ctx, async () => {
            const [intel, person] = await panelDataPromise!;
            panelResult = intel;
            personResult = person;
            // Already loaded for the badge row (one fetch per handle per page session).
            badgeResult = tweet.handle ? await badges.load(tweet.handle, tweet.displayName) : null;
            if (!intel.ok) {
              // The chip carries the failure too, and the next open retries.
              lastVerdict = "UNCHECKED";
              lastHeadline = chipErrorHeadline(intel.status, intel.error);
              panelDataPromise = null;
              renderChip();
            } else if (!checked) {
              // The second chip's only check is the one the reader just asked for: its verdict
              // comes from the card's own answer rather than a second paid call.
              checked = true;
              lastVerdict = intel.data.verdict;
              lastHeadline = originPrefix(origin, chipHeadline(intel.data));
              chipName = chipLabel(symbol, intel.data.panel.token?.symbol);
              renderChip();
            }
            panelMount?.update(cardNode());
          });

          return panelMount;
        },
        onMounted: (m) => mounts.track(article, m),
        onRemoved: (m) => mounts.untrack(article, m),
      });

      if (eager) {
        void runContentTask(ctx, async () => {
          const chipResult = await getChipIntel(target, tweet.timeIso);
          if (chipResult.ok) {
            lastVerdict = chipResult.data.verdict;
            lastHeadline = originPrefix(origin, chipHeadline(chipResult.data));
            // A failed or empty tokenInformation leaves the short address standing.
            chipName = chipLabel(symbol, chipResult.data.panel.token?.symbol);
          } else {
            lastVerdict = "UNCHECKED";
            lastHeadline = chipErrorHeadline(chipResult.status, chipResult.error);
          }
          renderChip();
        });
      }
      return chipMount.ui.shadowHost;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          void runContentTask(ctx, () => processTweet(entry.target));
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
      visible.disconnect();
      clearInterval(profileTimer);
      profiles.stop();
    });
  },
});
