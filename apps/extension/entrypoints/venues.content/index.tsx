import "../../lib/ui/theme.css";

import { defineContentScript } from "wxt/utils/define-content-script";
import type { Chain, Target } from "@tripwire/core";
import { findAdapter } from "../../lib/adapters/registry";
import { readDexscreenerPair } from "../../lib/adapters/dexscreener";
import type { TargetGap } from "../../lib/adapters/types";
import { health, resolve, resolvePair } from "../../lib/api";
import { warmCardSizes } from "../../lib/card-size";
import { runContentTask } from "../../lib/content-lifecycle";
import { createReplayFlag } from "../../lib/replay";
import { TIER1_MATCHES, TIER2_MATCHES } from "../../lib/venues";
import { createResultCache } from "../../lib/x/cache";
import { LOCATE_MESSAGE } from "./locate";
import { createGuardRunner, gapKey, keyFor } from "./runner";

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
    // The remembered compact/expanded choice, warmed once so a card can read it during
    // render: a card has to mount in the same frame as the click, and storage is asynchronous.
    void warmCardSizes();
    const runner = createGuardRunner(ctx, createReplayFlag(health));
    // Symbol -> token, for the venues that keep their tokens out of the URL. `search/general`
    // is free, and a failure evicts itself so a later tick retries.
    const symbols = createResultCache<string, Awaited<ReturnType<typeof resolve>>>();
    const pairs = createResultCache<string, Awaited<ReturnType<typeof resolvePair>>>();
    let lastKey: string | null = null;
    let inFlight = false;
    let rerunPending = false;
    let lastUrl: string | null = null;

    async function check(): Promise<void> {
      if (ctx.isInvalid) return;
      const visibleUrl = new URL(location.href);
      if (findAdapter(visibleUrl)?.shouldHide?.(document, visibleUrl)) {
        lastKey = null;
        await runner.clear();
        return;
      }
      if (inFlight) {
        rerunPending = true;
        return;
      }
      inFlight = true;
      try {
        const url = new URL(location.href);
        if (lastUrl !== url.href) {
          lastUrl = url.href;
          lastKey = null;
          await runner.clear();
        }
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

        let target = adapter.readTarget(document, url);
        if (!target && adapter.id === "dexscreener") {
          const pair = readDexscreenerPair(url);
          if (pair) {
            const pairKey = `${pair.chain}:${pair.pairAddress}`;
            const result = await pairs.get(pairKey, () => resolvePair(pair.chain, pair.pairAddress));
            if (result.ok && !result.data.target) pairs.drop(pairKey);
            if (ctx.isInvalid || location.href !== url.href) return;
            if (result.ok) target = result.data.target;
          }
        }
        // Only when the URL yielded nothing: what is the page actually pointing at? A symbol
        // read off the swap form is resolved through the backend and guarded like any other
        // token; a native coin or an uncovered chain is the answer itself.
        let gap: TargetGap | null = target ? null : (adapter.readGap?.(document, url) ?? null);
        if (gap?.kind === "symbol" && !gap.chainHint) gap = { kind: "missing-chain", symbol: gap.symbol };
        if (!target && gap?.kind === "symbol") {
          const resolved = await resolveSymbol(gap.symbol, gap.chainHint);
          if (ctx.isInvalid || location.href !== url.href) return;
          if (resolved) {
            target = resolved;
            gap = null;
          }
        }
        if (adapter.shouldHide?.(document, new URL(location.href))) return;
        const key = `${keyFor(adapter.id, target)}|${gapKey(gap)}`;
        // Unchanged target: the block overlay (if any) keeps itself positioned via its own
        // ResizeObserver/scroll listeners, independent of this loop -- but the venue's SPA can
        // still replace the anchor NODE itself (same Target, new DOM element) between ticks,
        // which those listeners don't catch (they're bound to the old node). resyncAnchor()
        // re-queries adapter.anchor(document) and rebinds the blocker/overlay onto whatever
        // node is live now, or falls back to the Dock if none is found.
        if (key === lastKey) {
          await runner.resyncAnchor();
          return;
        }

        lastKey = key;
        await runner.render(adapter, target, key, gap);
      } finally {
        inFlight = false;
        if (rerunPending) {
          rerunPending = false;
          void runContentTask(ctx, check);
        }
      }
    }

    /** A symbol the venue named, turned into the token Nansen knows, or null. */
    async function resolveSymbol(symbol: string, chainHint?: Chain): Promise<Target | null> {
      if (!chainHint) return null;
      const result = await symbols.get(`${symbol}|${chainHint ?? ""}`, () => resolve(symbol, chainHint));
      if (!result.ok || !result.data.best) return null;
      const best = result.data.best;
      if (best.chain !== chainHint) return null;
      return { kind: "spot", chain: best.chain, tokenAddress: best.tokenAddress, symbol: best.symbol };
    }

    void runContentTask(ctx, check);

    // "Where is it?" from the popup: light whatever this page has mounted. The reply is the
    // truth of the page -- false when nothing is mounted here -- so the popup can say that
    // instead of claiming it flashed something the user then fails to find.
    const onLocate = (message: unknown): Promise<boolean> | undefined => {
      if ((message as { type?: string } | null)?.type !== LOCATE_MESSAGE) return undefined;
      return Promise.resolve(ctx.isInvalid ? false : runner.locate());
    };
    browser.runtime.onMessage.addListener(onLocate);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onLocate));

    // SPA navigation: WXT patches the History API and fires this on every push/replaceState
    // or popstate. A 1s poll is a safety net for venues whose router doesn't go through it
    // (e.g. hash-based routers on 1inch/cow that only touch `location.hash`).
    ctx.addEventListener(window, "wxt:locationchange", () => void runContentTask(ctx, check));
    const pollTimer = ctx.setInterval(() => void runContentTask(ctx, check), URL_POLL_MS);

    // In-page DOM churn (debounced 400ms): the traded token or the anchor button can change
    // without a URL change (e.g. picking a different output token from a search dropdown).
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const mo = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runContentTask(ctx, check), DOM_DEBOUNCE_MS);
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
