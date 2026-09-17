export type ResultCache<K, T> = {
  /** Returns the cached, in-flight-or-settled promise for `key`, calling `load()` once per
   * key on a cache miss. A settled result with `ok: false`, or a rejected `load()`, evicts the
   * entry so the next `get()` for that key calls `load()` again instead of being stuck on a
   * stale failure for the rest of the page session. A settled `ok: true` result stays cached. */
  get(key: K, load: () => Promise<T>): Promise<T>;
  /** Forget a cached success on purpose (the author's wallet links changed), so the next `get()`
   * reloads it. */
  drop(key: K): void;
};

/** A page-session promise cache for `{ok: boolean}`-shaped results (Tripwire's `ApiResult<T>`).
 * Used by the X content script for both the per-cashtag `resolve()` cache and the per-token
 * `postIntel("chip")` cache, so a transient backend-offline blip or a 429 doesn't permanently
 * freeze every future chip for that key. */
export function createResultCache<K, T extends { ok: boolean }>(): ResultCache<K, T> {
  const entries = new Map<K, Promise<T>>();

  function get(key: K, load: () => Promise<T>): Promise<T> {
    const cached = entries.get(key);
    if (cached) return cached;

    const started = load().then(
      (result) => {
        if (!result.ok) entries.delete(key);
        return result;
      },
      (error: unknown) => {
        entries.delete(key);
        throw error;
      },
    );
    entries.set(key, started);
    return started;
  }

  return {
    get,
    drop(key: K): void {
      entries.delete(key);
    },
  };
}
