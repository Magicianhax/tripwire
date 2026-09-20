import { MAX_WALLET_MARKERS, walletKey, type WalletRef } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  walletActivity,
  walletCounterparties,
  walletDefi,
  walletLabels,
  walletLens,
  walletOrigin,
  walletUnrealized,
  type ApiResult,
} from "../api";
import type {
  WalletActivityResponse,
  WalletCounterpartiesResponse,
  WalletDefiResponse,
  WalletLensResponse,
  WalletOriginResponse,
  WalletUnrealizedResponse,
} from "../api-types";
import { cardSize, setCardSize, type CardSize } from "../card-size";
import { runContentTask } from "../content-lifecycle";
import { rememberWallet } from "../recent-wallets";
import { mountReact } from "../ui/mount";
import { Popover } from "../ui/Popover";
import { WalletCard, walletTitle } from "../ui/WalletCard";
import { WalletMarker } from "../ui/WalletMarker";
import { createResultCache } from "../x/cache";
import { createQueue } from "../x/queue";
import { locateAnyMounted } from "../../entrypoints/venues.content/locate";
import { createScanState, removeSlot, scanForWallets, type WalletHit } from "./scan";
import { capWalletMarkers } from "./marker-budget";

type Mount = Awaited<ReturnType<typeof mountReact>>;
type Marker = WalletHit & { mount: Mount };

/** Each lookup spends the user's Nansen credits, so two at a time is plenty. */
const LOOKUP_CONCURRENCY = 2;

export type LensOptions = {
  ctx: ContentScriptContext;
  /** Keeps clicks inside a Tripwire shadow root away from the host page's own handlers. */
  stopHostClicks: (host: HTMLElement) => void;
  zIndex: number;
  /** Wallets this page already handles as something else (a venue's own target token). */
  skip?: (ref: WalletRef) => boolean;
  replay?: boolean;
  /** The backend allows the 100-credit label lookup; without it the button isn't offered. */
  premium?: boolean;
};

const failure = (result: { ok: false; status: number; error: string }): string =>
  result.status === 0 ? "Tripwire's backend is offline." : result.error;

/**
 * The wallet lens on one page: a marker wherever a wallet was shared, and the card one opens.
 *
 * Budget: at most `MAX_WALLET_MARKERS` markers live at once, oldest recycled, one per wallet —
 * a page that names the same address forty times gets one marker, and a page that names four
 * hundred different ones keeps the last forty. A wallet is looked up once per page session.
 */
export function createWalletLens({ ctx, stopHostClicks, zIndex, skip, replay, premium }: LensOptions) {
  const state = createScanState();
  const cache = createResultCache<string, ApiResult<WalletLensResponse>>();
  const queue = createQueue(LOOKUP_CONCURRENCY);
  /** The last good lens per wallet, so the premium labels can be folded into it in place. */
  const loaded = new Map<string, WalletLensResponse>();
  /** Round 1.5: the two 1-credit views, kept per wallet so reopening a card does not re-buy
   * what the user already paid for in this page session. */
  const defiByWallet = new Map<string, WalletDefiResponse>();
  const unrealizedByWallet = new Map<string, WalletUnrealizedResponse>();
  /** Round 2.3: the Activity tab's three answers, kept per wallet for the same reason. */
  const activityByWallet = new Map<string, WalletActivityResponse>();
  const originByWallet = new Map<string, WalletOriginResponse>();
  const counterpartiesByWallet = new Map<string, WalletCounterpartiesResponse>();
  const markers: Marker[] = [];

  let open: { key: string; card: Mount; draw: () => void } | null = null;

  const find = (key: string) => markers.find((m) => m.key === key);

  function drawMarker(key: string): void {
    const marker = find(key);
    marker?.mount.update(<WalletMarker ref={marker.ref} presentation={marker.presentation} open={open?.key === key} onClick={() => void runContentTask(ctx, () => toggle(key))} />);
  }

  function closeCard(): void {
    if (!open) return;
    const { key, card } = open;
    open = null;
    card.ui.remove();
    drawMarker(key);
  }

  async function toggle(key: string): Promise<void> {
    const wasOpen = open?.key === key;
    closeCard();
    if (wasOpen) return;

    const marker = find(key);
    if (!marker?.slot.isConnected) return;

    const button = marker.mount.ui.shadow.querySelector<HTMLButtonElement>(".tw-wallet-marker");
    let error: string | null = null;
    let size: CardSize = cardSize("wallet");

    const card = await mountReact(ctx, { position: "modal", zIndex }, <></>);
    stopHostClicks(card.ui.shadowHost);

    const draw = () => {
      const lens = loaded.get(walletKey(marker.ref)) ?? null;
      card.update(
        <Popover
          anchor={button}
          returnFocus={() => button}
          onClose={() => closeCard()}
          size={size}
          onToggleSize={() => {
            size = size === "expanded" ? "compact" : "expanded";
            setCardSize("wallet", size);
            draw();
          }}
        >
          <WalletCard
            walletRef={marker.ref}
            lens={lens}
            error={error}
            replay={replay}
            onClose={() => closeCard()}
            onLoadLabels={premium && lens?.address ? () => loadLabels(key) : null}
            defi={defiByWallet.get(walletKey(marker.ref)) ?? null}
            onLoadDefi={() => loadDefi(key)}
            unrealized={unrealizedByWallet.get(walletKey(marker.ref)) ?? null}
            onLoadUnrealized={() => loadUnrealized(key)}
            activity={activityByWallet.get(walletKey(marker.ref)) ?? null}
            onLoadActivity={() => loadActivity(key)}
            origin={originByWallet.get(walletKey(marker.ref)) ?? null}
            onLoadOrigin={() => loadOrigin(key)}
            counterparties={counterpartiesByWallet.get(walletKey(marker.ref)) ?? null}
            onLoadCounterparties={() => loadCounterparties(key)}
          />
        </Popover>,
      );
    };

    if (!marker.slot.isConnected) {
      card.ui.remove();
      return;
    }
    open = { key, card, draw };
    draw();
    drawMarker(key);

    const result = await cache.get(walletKey(marker.ref), () => queue.run(() => walletLens(marker.ref.query, marker.ref.chainHint)));
    if (open?.key !== key) return;
    if (result.ok) {
      loaded.set(walletKey(marker.ref), result.data);
      void rememberWallet({
        query: marker.ref.query,
        address: result.data.address,
        label: result.data.resolved ? walletTitle(result.data, marker.ref) : null,
        chain: result.data.chainGuess,
        seenAt: Date.now(),
      });
    } else {
      error = failure(result);
    }
    draw();
  }

  /**
   * Round 1.5.6 + 1.5.1 — 2 credits, and Round 1.5.7 — 1 credit. Reached only from the card's
   * own buttons, which state the price; nothing here runs on a card open.
   *
   * The DeFi answer carries the wallet's trade label, so it is folded into the cached lens the
   * same way the premium labels are — the card's title and its label line read one field, and
   * a paid-for label must not depend on which view is open.
   */
  async function loadDefi(key: string): Promise<void> {
    const marker = find(key);
    const current = marker ? loaded.get(walletKey(marker.ref)) : undefined;
    if (!marker || !current?.address) return;

    const result = await walletDefi(current.address, current.portfolio?.chains?.[0] ?? current.chainGuess ?? null);
    if (!result.ok) throw new Error(failure(result));

    defiByWallet.set(walletKey(marker.ref), result.data);
    loaded.set(walletKey(marker.ref), {
      ...current,
      label: result.data.label ?? current.label,
      sources: current.sources.includes("Nansen Portfolio") ? current.sources : [...current.sources, "Nansen Portfolio"],
      credits: current.credits + result.data.credits,
    });
    if (open?.key === key) open.draw();
  }

  async function loadUnrealized(key: string): Promise<void> {
    const marker = find(key);
    const current = marker ? loaded.get(walletKey(marker.ref)) : undefined;
    if (!marker || !current?.address) return;

    const result = await walletUnrealized(current.address);
    if (!result.ok) throw new Error(failure(result));

    unrealizedByWallet.set(walletKey(marker.ref), result.data);
    loaded.set(walletKey(marker.ref), { ...current, credits: current.credits + result.data.credits });
    if (open?.key === key) open.draw();
  }

  /**
   * Round 2.3 — the Activity tab's three calls: 1 credit, up to 2, and 5. Reached only from the
   * buttons inside that tab, which state their price; opening the tab itself spends nothing.
   *
   * `walletOrigin` is handed the wallet's own chain order rather than one chain, because
   * `profiler/address/related-wallets` takes a single chain, has no `"all"`, and frequently does
   * not cover the wallet's largest one. The backend picks the largest chain it does cover.
   */
  async function loadActivity(key: string): Promise<void> {
    await loadInto(key, activityByWallet, (address) => walletActivity(address), "Nansen Profiler");
  }

  async function loadOrigin(key: string): Promise<void> {
    await loadInto(key, originByWallet, (address, lens) => walletOrigin(address, lens.portfolio?.chains ?? null), "Nansen Profiler");
  }

  async function loadCounterparties(key: string): Promise<void> {
    await loadInto(key, counterpartiesByWallet, (address) => walletCounterparties(address), "Nansen Profiler");
  }

  /** One lazy call: fetch it, remember it per wallet, and add what it cost to the card's total. */
  async function loadInto<T extends { credits: number }>(
    key: string,
    store: Map<string, T>,
    fetcher: (address: string, lens: WalletLensResponse) => Promise<ApiResult<T>>,
    source: string,
  ): Promise<void> {
    const marker = find(key);
    const current = marker ? loaded.get(walletKey(marker.ref)) : undefined;
    if (!marker || !current?.address) return;

    const result = await fetcher(current.address, current);
    if (!result.ok) throw new Error(failure(result));

    store.set(walletKey(marker.ref), result.data);
    loaded.set(walletKey(marker.ref), {
      ...current,
      sources: current.sources.includes(source) ? current.sources : [...current.sources, source],
      credits: current.credits + result.data.credits,
    });
    if (open?.key === key) open.draw();
  }

  /**
   * The 100-credit Nansen label lookup. Reached only from the card's own button, which states
   * the price, and only when the backend has `NANSEN_ALLOW_PREMIUM=1`. The answer is folded
   * into the cached lens so the card shows it as the label line, like any free one.
   */
  async function loadLabels(key: string): Promise<void> {
    const marker = find(key);
    const current = marker ? loaded.get(walletKey(marker.ref)) : undefined;
    if (!marker || !current?.address) return;

    const result = await walletLabels(current.address);
    if (!result.ok) throw new Error(failure(result));
    if (result.data.errors.length > 0) throw new Error(result.data.errors[0]!);
    if (result.data.labels.length === 0) throw new Error("Nansen returned no labels for this wallet.");

    loaded.set(walletKey(marker.ref), {
      ...current,
      label: { text: result.data.labels[0]!, kind: "other", tags: result.data.labels.slice(1) },
      sources: current.sources.includes("Nansen labels") ? current.sources : [...current.sources, "Nansen labels"],
      credits: current.credits + result.data.credits,
    });
    if (open?.key === key) open.draw();
  }

  /** Unmount everything whose slot the page has dropped. */
  function sweep(): void {
    for (let i = markers.length - 1; i >= 0; i--) {
      const marker = markers[i]!;
      if (marker.slot.isConnected) continue;
      if (open?.key === marker.key) closeCard();
      marker.mount.ui.remove();
      markers.splice(i, 1);
    }
  }

  function retire(marker: Marker): void {
    if (open?.key === marker.key) closeCard();
    marker.mount.ui.remove();
    removeSlot(marker.slot);
    const at = markers.indexOf(marker);
    if (at >= 0) markers.splice(at, 1);
  }

  async function scan(root: ParentNode): Promise<void> {
    sweep();
    // A token another surface claimed after this marker went up (the X chip resolves its token
    // asynchronously) is taken back here, so a contract never keeps a wallet marker.
    if (skip) for (const marker of markers.slice()) if (skip(marker.ref)) retire(marker);
    for (const hit of scanForWallets(root, { state, skip, limit: MAX_WALLET_MARKERS })) {
      if (!hit.slot.isConnected) continue;
      const mount = await mountReact(ctx, {
        position: "inline", anchor: hit.slot, append: "last",
        css: ":host { display: inline-flex !important; vertical-align: middle !important; pointer-events: auto !important; }",
      }, <></>);
      // Inline-flex on the host keeps the marker on the host's own text baseline, so the line
      // it sits in never grows and the page never gains a scrollbar.
      mount.ui.shadowHost.style.display = "inline-flex";
      mount.ui.shadowHost.style.verticalAlign = "text-bottom";
      stopHostClicks(mount.ui.shadowHost);
      markers.push({ ...hit, mount });
      drawMarker(hit.key);
    }
    for (const marker of capWalletMarkers(markers, MAX_WALLET_MARKERS).drop) retire(marker);
  }

  function destroy(): void {
    closeCard();
    for (const marker of markers.slice()) retire(marker);
  }

  /** "Where is it?" from the popup (I-1): light a marker this page has up — the one already on
   * screen if there is one. Markers are the lens's primary display, so this is the same answer
   * the venue strip gives, on a page that has no strip. */
  function locate(): boolean {
    return locateAnyMounted(markers.map((m) => m.mount));
  }

  return {
    scan,
    sweep,
    destroy,
    locate,
    get count() {
      return markers.length;
    },
  };
}
