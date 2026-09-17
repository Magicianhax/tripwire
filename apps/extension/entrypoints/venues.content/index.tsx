import "@fontsource-variable/archivo/standard.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../../lib/ui/theme.css";

import { defineContentScript } from "wxt/utils/define-content-script";
import { findAdapter } from "../../lib/adapters/registry";
import { TIER1_MATCHES, TIER2_MATCHES } from "../../lib/venues";
import { createGuardRunner, keyFor } from "./runner";

const DOM_DEBOUNCE_MS = 400;
const URL_POLL_MS = 1000;

/**
 * The venue guard runner. Watches for a target change (URL navigation, in-page DOM churn
 * that swaps the traded token without a URL change) and re-runs `guard()` against it,
 * delegating the actual UI (BlockScreen/Strip/Dock, blocking listener, override/unlock) to
 * `createGuardRunner` in `./runner.tsx`.
 */
export default defineContentScript({
  matches: [...TIER1_MATCHES, ...TIER2_MATCHES],
  cssInjectionMode: "ui",
  async main(ctx) {
    const runner = createGuardRunner(ctx);
    let lastKey: string | null = null;
    let inFlight = false;
    let rerunPending = false;

    async function check(): Promise<void> {
      if (inFlight) {
        rerunPending = true;
        return;
      }
      inFlight = true;
      try {
        const url = new URL(location.href);
        const adapter = findAdapter(url);
        if (!adapter) {
          // The manifest's `matches` is host-wide; a specific page on that host (e.g. a
          // venue's own homepage) can still have no adapter match. Nothing to guard here.
          if (lastKey !== null) {
            lastKey = null;
            await runner.clear();
          }
          return;
        }

        const target = adapter.readTarget(document, url);
        const key = keyFor(adapter.id, target);
        // Unchanged target: no-op. The block overlay (if any) keeps itself positioned via its
        // own ResizeObserver/scroll listeners, independent of this loop.
        if (key === lastKey) return;

        lastKey = key;
        await runner.render(adapter, target, key);
      } finally {
        inFlight = false;
        if (rerunPending) {
          rerunPending = false;
          void check();
        }
      }
    }

    void check();

    // SPA navigation: WXT patches the History API and fires this on every push/replaceState
    // or popstate. A 1s poll is a safety net for venues whose router doesn't go through it
    // (e.g. hash-based routers on 1inch/cow that only touch `location.hash`).
    ctx.addEventListener(window, "wxt:locationchange", () => void check());
    const pollTimer = setInterval(() => void check(), URL_POLL_MS);

    // In-page DOM churn (debounced 400ms): the traded token or the anchor button can change
    // without a URL change (e.g. picking a different output token from a search dropdown).
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const mo = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void check(), DOM_DEBOUNCE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      clearInterval(pollTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      mo.disconnect();
      runner.dispose();
    });
  },
});
