import { capMarkers, MAX_WALLET_MARKERS, walletKey, type WalletRef } from "@tripwire/core";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { walletLabels, walletLens, type ApiResult } from "../api";
import type { WalletLensResponse } from "../api-types";
import { rememberWallet } from "../recent-wallets";
import { mountReact } from "../ui/mount";
import { Popover } from "../ui/Popover";
import { WalletCard, walletTitle } from "../ui/WalletCard";
import { WalletMarker } from "../ui/WalletMarker";
import { createResultCache } from "../x/cache";
import { createQueue } from "../x/queue";
import { createScanState, removeSlot, scanForWallets, type WalletHit } from "./scan";

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
  const markers: Marker[] = [];

  let open: { key: string; card: Mount; draw: () => void } | null = null;

  const find = (key: string) => markers.find((m) => m.key === key);

  function drawMarker(key: string): void {
    const marker = find(key);
    marker?.mount.update(<WalletMarker ref={marker.ref} open={open?.key === key} onClick={() => void toggle(key)} />);
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

    const card = await mountReact(ctx, { position: "modal", zIndex }, <></>);
    stopHostClicks(card.ui.shadowHost);

    const draw = () => {
      const lens = loaded.get(walletKey(marker.ref)) ?? null;
      card.update(
        <Popover anchor={button} returnFocus={() => button} onClose={() => closeCard()}>
          <WalletCard
            walletRef={marker.ref}
            lens={lens}
            error={error}
            replay={replay}
            onClose={() => closeCard()}
            onLoadLabels={premium && lens?.address ? () => loadLabels(key) : null}
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
      const mount = await mountReact(ctx, { position: "inline", anchor: hit.slot, append: "last" }, <></>);
      // Inline-flex on the host keeps the marker on the host's own text baseline, so the line
      // it sits in never grows and the page never gains a scrollbar.
      mount.ui.shadowHost.style.display = "inline-flex";
      mount.ui.shadowHost.style.verticalAlign = "text-bottom";
      stopHostClicks(mount.ui.shadowHost);
      markers.push({ ...hit, mount });
      drawMarker(hit.key);
    }
    for (const marker of capMarkers(markers, MAX_WALLET_MARKERS).drop) retire(marker);
  }

  function destroy(): void {
    closeCard();
    for (const marker of markers.slice()) retire(marker);
  }

  return {
    scan,
    sweep,
    destroy,
    get count() {
      return markers.length;
    },
  };
}
