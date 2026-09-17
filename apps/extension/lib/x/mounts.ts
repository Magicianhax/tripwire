/**
 * Tracks the shadow-root UIs mounted for each tweet `article`, so they can be unmounted when X's
 * virtualized timeline drops the article from the DOM. Without this, every scrolled-past tweet
 * keeps a live React root (and its shadow-root styles) for the life of the tab.
 */
export type Removable = { ui: { remove(): void } };

export function createMountTracker() {
  const byArticle = new Map<Element, Set<Removable>>();

  return {
    track(article: Element, mount: Removable): void {
      let set = byArticle.get(article);
      if (!set) byArticle.set(article, (set = new Set()));
      set.add(mount);
    },

    untrack(article: Element, mount: Removable): void {
      const set = byArticle.get(article);
      set?.delete(mount);
      if (set && set.size === 0) byArticle.delete(article);
    },

    /** Unmounts everything belonging to disconnected articles; returns those articles. */
    sweep(): Element[] {
      const gone: Element[] = [];
      for (const [article, mounts] of byArticle) {
        if (article.isConnected) continue;
        for (const mount of mounts) mount.ui.remove();
        byArticle.delete(article);
        gone.push(article);
      }
      return gone;
    },

    get size(): number {
      return byArticle.size;
    },
  };
}
