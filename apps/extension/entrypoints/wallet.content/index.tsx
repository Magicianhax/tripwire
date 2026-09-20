import "../../lib/ui/theme.css";

import { defineContentScript } from "wxt/utils/define-content-script";
import type { WalletRef } from "@tripwire/core";
import { health } from "../../lib/api";
import { findAdapter } from "../../lib/adapters/registry";
import { claimToken, isTokenClaimed } from "../../lib/claimed-tokens";
import { warmCardSizes } from "../../lib/card-size";
import { runContentTask } from "../../lib/content-lifecycle";
import { createReplayFlag } from "../../lib/replay";
import { BUILTIN_MATCHES } from "../../lib/permissions";
import { createWalletLens } from "../../lib/wallet/lens";
import { LOCATE_MESSAGE } from "../venues.content/locate";

/** The wallet card floats above the host page's own header and menus, like the evidence card. */
const POPOVER_Z_INDEX = 2_147_483_000;
/** A page that rewrites itself constantly (a timeline, a live chart) gets one scan per second. */
const RESCAN_DEBOUNCE_MS = 700;

function stopHostClicks(host: HTMLElement): void {
  host.addEventListener("click", (event) => event.stopPropagation());
}

/**
 * The wallet lens.
 *
 * Runs on the hosts Tripwire already has permission for (X and every venue), and — through
 * `browser.scripting.registerContentScripts` in the background — on any site the user has
 * explicitly enabled from the popup. It is never injected anywhere else: Tripwire asks for no
 * host permission at install beyond the local backend and the venues it ships with.
 */
export default defineContentScript({
  matches: BUILTIN_MATCHES,
  cssInjectionMode: "ui",
  runAt: "document_idle",
  async main(ctx) {
    // The remembered compact/expanded choice, warmed once so a card can read it during
    // render: a card has to mount in the same frame as the click, and storage is asynchronous.
    void warmCardSizes();
    const replay = await createReplayFlag(health)();
    if (ctx.isInvalid) return;

    // A venue's own target token is a contract, not somebody's wallet: the strip, dock or block
    // screen is already saying everything there is to say about it.
    const adapter = findAdapter(new URL(location.href));
    const target = adapter?.readTarget(document, new URL(location.href)) ?? null;
    if (target?.kind === "spot") claimToken(target.tokenAddress);
    const skip = (ref: WalletRef) => isTokenClaimed(ref.query);

    const lens = createWalletLens({ ctx, stopHostClicks, zIndex: POPOVER_Z_INDEX, skip, replay });

    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** Scanning waits for an idle moment: a wallet marker is never worth a dropped frame. */
    function scheduleScan(): void {
      if (pending || ctx.isInvalid) return;
      pending = true;
      const run = () => {
        pending = false;
        void runContentTask(ctx, () => lens.scan(document.body));
      };
      if (typeof requestIdleCallback === "function") ctx.requestIdleCallback(run, { timeout: 2_000 });
      else ctx.setTimeout(run, 200);
    }

    scheduleScan();

    // "Where is it?" from the popup: a page whose only Tripwire display is a wallet marker
    // answers for itself (I-1). Silence when there is nothing, so this never beats the venue
    // strip's or the X chip's answer on a page that runs those scripts too.
    const onLocate = (message: unknown): Promise<boolean> | undefined => {
      if ((message as { type?: string } | null)?.type !== LOCATE_MESSAGE) return undefined;
      if (ctx.isInvalid) return undefined;
      return lens.locate() ? Promise.resolve(true) : undefined;
    };
    browser.runtime.onMessage.addListener(onLocate);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onLocate));

    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        scheduleScan();
      }, RESCAN_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      lens.destroy();
    });
  },
});
