import type { ReactNode } from "react";
import type { WalletVenue } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { authorBadges, linkWallet, unlinkWallet, type ApiResult } from "../api";
import type { AuthorBadgesResponse, BadgeLink } from "../api-types";
import { BadgeCard } from "../ui/BadgeCard";
import { BadgeRow, badgeVenues, type BadgeVenue } from "../ui/BadgeRow";
import { LinkWallet } from "../ui/LinkWallet";
import { mountReact } from "../ui/mount";
import { Popover } from "../ui/Popover";
import { badgeAnchor } from "./badge-anchor";
import { createResultCache } from "./cache";
import type { createMountTracker } from "./mounts";
import type { ParsedTweet } from "./parse";
import { createQueue } from "./queue";

const BADGE_CONCURRENCY = 4;

type Mount = Awaited<ReturnType<typeof mountReact>>;

export type BadgeControllerOptions = {
  ctx: ContentScriptContext;
  mounts: ReturnType<typeof createMountTracker>;
  /** Keeps clicks inside a Tripwire shadow root away from X's own handlers. */
  stopHostClicks: (host: HTMLElement) => void;
  /** The badge card floats above X's header, like the evidence card. */
  zIndex: number;
};

const linksOf = (badges: AuthorBadgesResponse | null): Partial<Record<WalletVenue, BadgeLink>> => ({
  ...(badges?.hyperliquid ? { hyperliquid: badges.hyperliquid.link } : {}),
  ...(badges?.polymarket ? { polymarket: badges.polymarket.link } : {}),
});

const failure = (result: { ok: false; status: number; error: string }): string =>
  result.status === 0 ? "Tripwire's backend is offline." : result.error;

/**
 * Author badges on X: one fetch per handle per page session (4 in flight at most, failures
 * evicted), the logo badges mounted right after the username, and the badge card they open.
 *
 * A wallet link saved anywhere — a badge card or a post card's author section — drops that
 * handle's cached result and re-renders every tweet by that author on the page.
 */
export function createBadgeController({ ctx, mounts, stopHostClicks, zIndex }: BadgeControllerOptions) {
  const cache = createResultCache<string, ApiResult<AuthorBadgesResponse>>();
  const queue = createQueue(BADGE_CONCURRENCY);
  /** Every mounted badge row per handle, so a link change refreshes all of them. */
  const listeners = new Map<string, Set<() => Promise<void>>>();

  const key = (handle: string) => handle.toLowerCase();

  function load(handle: string, displayName: string): Promise<ApiResult<AuthorBadgesResponse>> {
    return cache.get(key(handle), () => queue.run(() => authorBadges(handle, displayName)));
  }

  async function refresh(handle: string): Promise<void> {
    cache.drop(key(handle));
    const set = listeners.get(key(handle));
    if (!set) return;
    await Promise.all([...set].map((reload) => reload()));
  }

  /** Saves a link and refreshes every badge row for that handle; returns an error line, or null. */
  async function save(handle: string, venue: WalletVenue, address: string): Promise<string | null> {
    const result = await linkWallet(handle, venue, address);
    if (!result.ok) return failure(result);
    await refresh(handle);
    return null;
  }

  async function unlink(handle: string, venue: WalletVenue): Promise<string | null> {
    const result = await unlinkWallet(handle, venue);
    if (!result.ok) return failure(result);
    await refresh(handle);
    return null;
  }

  /** The "Link wallet" block for the post card's author section, plus the no-label line. */
  function authorSection(tweet: ParsedTweet, hasNansenLabel: boolean, badges: AuthorBadgesResponse | null): ReactNode {
    if (!tweet.handle) return null;
    return (
      <div className="tw-card-author">
        {hasNansenLabel ? null : <p className="tw-empty">No Nansen label for @{tweet.handle}.</p>}
        <LinkWallet
          handle={tweet.handle}
          links={linksOf(badges)}
          onSave={(venue, address) => save(tweet.handle, venue, address)}
          onUnlink={(venue) => unlink(tweet.handle, venue)}
        />
      </div>
    );
  }

  /** Badges for one tweet's author. Safe to call for every tweet: an account with no badge and no
   * link mounts nothing at all. */
  async function attach(article: Element, tweet: ParsedTweet): Promise<void> {
    const anchor = tweet.handle ? badgeAnchor(article, tweet.handle) : null;
    if (!anchor) return;

    let badges: AuthorBadgesResponse | null = null;
    let row: Mount | null = null;
    let card: Mount | null = null;
    let open: BadgeVenue | null = null;

    function rowNode() {
      return <BadgeRow handle={tweet.handle} badges={badges} open={open} onOpen={(venue) => void toggleCard(venue)} />;
    }

    function cardNode(initial: BadgeVenue, badgeButton: Element | null) {
      return (
        <Popover anchor={badgeButton} returnFocus={() => badgeButton as HTMLElement | null} onClose={() => void closeCard()}>
          <BadgeCard
            handle={tweet.handle}
            displayName={tweet.displayName}
            badges={badges}
            initial={initial}
            onClose={() => void closeCard()}
            onSave={(venue, address) => save(tweet.handle, venue, address)}
            onUnlink={(venue) => unlink(tweet.handle, venue)}
          />
        </Popover>
      );
    }

    async function closeCard(): Promise<void> {
      if (card) {
        mounts.untrack(article, card);
        card.ui.remove();
        card = null;
      }
      open = null;
      row?.update(rowNode());
    }

    async function toggleCard(venue: BadgeVenue): Promise<void> {
      if (open === venue) {
        await closeCard();
        return;
      }
      await closeCard();
      open = venue;
      row?.update(rowNode());
      const button = row?.ui.shadow.querySelector(`.tw-badge[data-venue="${venue}"]`) ?? null;
      const mount = await mountReact(ctx, { position: "modal", zIndex }, cardNode(venue, button));
      stopHostClicks(mount.ui.shadowHost);
      if (open !== venue || !article.isConnected) {
        mount.ui.remove();
        return;
      }
      card = mount;
      mounts.track(article, mount);
    }

    async function sync(): Promise<void> {
      const has = badgeVenues(badges).length > 0;
      if (!has || !article.isConnected) {
        await closeCard();
        if (row) {
          mounts.untrack(article, row);
          row.ui.remove();
          row = null;
        }
        return;
      }
      if (!row) {
        row = await mountReact(ctx, { position: "inline", anchor, append: "after" }, rowNode());
        row.ui.shadowHost.style.display = "inline-flex";
        row.ui.shadowHost.style.verticalAlign = "text-bottom";
        stopHostClicks(row.ui.shadowHost);
        mounts.track(article, row);
      }
      row.update(rowNode());
      if (card && open) card.update(cardNode(open, row.ui.shadow.querySelector(`.tw-badge[data-venue="${open}"]`)));
    }

    async function reload(): Promise<void> {
      if (!article.isConnected) {
        listeners.get(key(tweet.handle))?.delete(reload);
        return;
      }
      const result = await load(tweet.handle, tweet.displayName);
      badges = result.ok ? result.data : null;
      await sync();
    }

    let set = listeners.get(key(tweet.handle));
    if (!set) listeners.set(key(tweet.handle), (set = new Set()));
    set.add(reload);
    await reload();
  }

  return { attach, authorSection, load, save, unlink, refresh };
}
