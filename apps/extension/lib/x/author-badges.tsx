import type { ReactNode } from "react";
import type { WalletVenue } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { authorBadges, health, linkWallet, unlinkWallet, type ApiResult } from "../api";
import type { AuthorBadgesResponse, BadgeLink } from "../api-types";
import { cardSize, setCardSize, type CardSize } from "../card-size";
import { runContentTask } from "../content-lifecycle";
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
  const waitingForBackend = new Set<() => Promise<void>>();
  let recovering = false;
  // A stopped local server must not leave already-discovered authors permanently blank.
  // Probe health once, then retry a bounded batch through the existing deduplicating queue.
  ctx.setInterval(() => void runContentTask(ctx, async () => {
    if (!waitingForBackend.size || recovering) return;
    recovering = true;
    try {
      const status = await health();
      if (!status.ok || ctx.isInvalid) return;
      await Promise.all([...waitingForBackend].slice(0, 20).map(reload => reload()));
    } finally { recovering = false; }
  }), 10000);
  ctx.onInvalidated(() => waitingForBackend.clear());

  const key = (handle: string) => handle.toLowerCase();

  function load(handle: string, displayName: string): Promise<ApiResult<AuthorBadgesResponse>> {
    return cache.get(key(handle), () => queue.run(() => authorBadges(handle, displayName))).then((result) => {
      // Lookup failures are carried in an otherwise successful response so linked venues can
      // still render. Do not cache that missing entity as a definitive no-match.
      if (result.ok && result.data.errors.some(error => error.startsWith("Nansen label lookup:"))) cache.drop(key(handle));
      return result;
    });
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
    await attachAt(article, tweet, anchor);
  }

  /** Shared attachment for a tweet or the current profile header; callers own its lifetime. */
  async function attachAt(article: Element, tweet: Pick<ParsedTweet, "handle" | "displayName">, anchor: Element,
    isCurrent: () => boolean = () => article.isConnected) {
    let disposed = false;
    const current = () => !disposed && !ctx.isInvalid && article.isConnected && anchor.isConnected && isCurrent();

    let badges: AuthorBadgesResponse | null = null;
    let row: Mount | null = null;
    let card: Mount | null = null;
    let open: BadgeVenue | null = null;
    let size: CardSize = cardSize("badge");

    function rowNode() {
      return <BadgeRow handle={tweet.handle} badges={badges} open={open} onOpen={(venue) => void runContentTask(ctx, () => toggleCard(venue))} />;
    }

    function cardNode(initial: BadgeVenue, badgeButton: Element | null) {
      return (
        <Popover
          anchor={badgeButton}
          returnFocus={() => badgeButton as HTMLElement | null}
          onClose={() => void closeCard()}
          size={size}
          onToggleSize={() => {
            size = size === "expanded" ? "compact" : "expanded";
            setCardSize("badge", size);
            card?.update(cardNode(initial, badgeButton));
          }}
        >
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
      size = cardSize("badge");
      row?.update(rowNode());
      const button = row?.ui.shadow.querySelector(`.tw-badge[data-venue="${venue}"]`) ?? null;
      const mount = await mountReact(ctx, { position: "modal", zIndex }, cardNode(venue, button));
      stopHostClicks(mount.ui.shadowHost);
      if (open !== venue || !current()) {
        mount.ui.remove();
        return;
      }
      card = mount;
      mounts.track(article, mount);
    }

    async function sync(): Promise<void> {
      const has = badgeVenues(badges).length > 0;
      if (!has || !current()) {
        await closeCard();
        if (row) {
          mounts.untrack(article, row);
          row.ui.remove();
          row = null;
        }
        return;
      }
      if (!row) {
        let restoreLayout = () => {};
        const existingGap = anchor.parentElement ? Number.parseFloat(getComputedStyle(anchor.parentElement).columnGap) : 0;
        const margin = Number.isFinite(existingGap) ? Math.max(0, 4 - existingGap) : 4;
        row = await mountReact(ctx, {
          position: "inline", anchor, append: "after",
          onRemove: () => restoreLayout(),
          css: `:host { display: inline-flex !important; vertical-align: middle !important; margin-left: ${margin}px !important; flex-shrink: 0 !important; }
                :host > div { display: inline-flex; align-items: center; }`,
        }, rowNode());
        // X's name link is often a block inside a column flex wrapper. Keep its new sibling
        // beside the name/verification mark, without putting a button inside X's profile link.
        const parent = anchor?.parentElement;
        if (parent && parent.getAttribute("data-testid") !== "User-Name") {
          const properties = { display: "inline-flex", "flex-direction": "row", "align-items": "center" };
          const previous = Object.keys(properties).map((property) => [property, parent.style.getPropertyValue(property), parent.style.getPropertyPriority(property)]);
          for (const [property, value] of Object.entries(properties)) parent.style.setProperty(property, value);
          restoreLayout = () => {
            for (const [property, value, priority] of previous) {
              if (parent.style.getPropertyValue(property!) === properties[property as keyof typeof properties]) {
                if (value) parent.style.setProperty(property!, value, priority);
                else parent.style.removeProperty(property!);
              }
            }
          };
        }
        stopHostClicks(row.ui.shadowHost);
        if (!current()) {
          row.ui.remove();
          row = null;
          return;
        }
        mounts.track(article, row);
      }
      row.update(rowNode());
      if (card && open) card.update(cardNode(open, row.ui.shadow.querySelector(`.tw-badge[data-venue="${open}"]`)));
    }

    let retry = false;
    async function reload(): Promise<void> {
      if (!current()) {
        listeners.get(key(tweet.handle))?.delete(reload);
        waitingForBackend.delete(reload);
        return;
      }
      const result = await load(tweet.handle, tweet.displayName);
      retry = !result.ok || result.data.errors.some(error => error.startsWith("Nansen label lookup:"));
      if (!result.ok && result.status === 0) waitingForBackend.add(reload);
      else waitingForBackend.delete(reload);
      badges = result.ok ? result.data : null;
      await sync();
    }

    let set = listeners.get(key(tweet.handle));
    if (!set) listeners.set(key(tweet.handle), (set = new Set()));
    set.add(reload);
    await reload();
    return { retry, dispose() {
      disposed = true;
      listeners.get(key(tweet.handle))?.delete(reload);
      waitingForBackend.delete(reload);
      void closeCard();
      if (row) {
        mounts.untrack(article, row);
        row.ui.remove();
        row = null;
      }
    } };
  }

  return { attach, attachAt, authorSection, load, save, unlink, refresh };
}
