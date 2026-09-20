import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { ensureFontFaces } from "./fonts";

type AnchorOption = string | Element | null | undefined | (() => string | Element | null | undefined);
type AppendOption = "last" | "first" | "replace" | "before" | "after" | ((anchor: Element, ui: Element) => void);
type OverlayAlignment = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type MountReactOptions =
  | { position: "inline"; anchor?: AnchorOption; append?: AppendOption; css?: string; onRemove?: () => void }
  | { position: "overlay"; anchor?: AnchorOption; append?: AppendOption; zIndex?: number; alignment?: OverlayAlignment }
  | { position: "modal"; anchor?: AnchorOption; append?: AppendOption; zIndex?: number };

/**
 * Thin helper around WXT's `createShadowRootUi`. Mounts `node` into a shadow root named
 * "tripwire-ui" (CSS imported by the calling content-script entry — see theme.css's header
 * comment — is injected into that shadow root automatically via `cssInjectionMode: "ui"").
 * Returns `{ ui, update }` so callers can re-render on new data without remounting the
 * shadow root itself.
 */
export async function mountReact(ctx: ContentScriptContext, opts: MountReactOptions, node: ReactNode) {
  if (ctx.isInvalid) throw new Error("Extension context invalidated.");
  let root: Root | undefined;
  // Set by onRemove, which WXT calls synchronously from `ui.remove()`. Guards `update()`
  // against firing after removal: a caller can still hold this mount object (e.g. a chip whose
  // `getChipIntel` was still pending when the tweet's article scrolled out and got swept) and
  // call `update()` once its async work resolves -- without this flag that would call
  // `root.render()` on an already-unmounted root, which React reports as an unhandled
  // rejection ("Cannot update an unmounted root").
  let removed = false;
  // Once per document, not per mount: see lib/ui/fonts.ts.
  ensureFontFaces(document, (publicPath) => browser.runtime.getURL(publicPath as "/"));

  const ui = await createShadowRootUi(ctx, {
    name: "tripwire-ui",
    ...opts,
    // WXT writes these values as ordinary light-DOM inline styles after mounting, but its own
    // shadow reset is `:host { all: initial !important }`. Important declarations reverse
    // shadow-boundary precedence, so even an outer inline `!important` cannot beat that reset.
    // Put the overlay host contract after the reset in the same shadow stylesheet instead.
    css:
      opts.position === "inline"
        ? opts.css
        : `:host {
            position: relative !important;
            overflow: visible !important;
            width: 0 !important;
            height: 0 !important;
            display: block !important;
            ${opts.zIndex === undefined ? "" : `z-index: ${opts.zIndex} !important;`}
          }`,
    onMount(container) {
      root = createRoot(container);
      root.render(node);
      return root;
    },
    onRemove(mountedRoot) {
      removed = true;
      if (opts.position === "inline") opts.onRemove?.();
      mountedRoot?.unmount();
    },
  });

  if (ctx.isInvalid) {
    ui.remove();
    throw new Error("Extension context invalidated.");
  }
  ui.mount();
  const unsubscribe = ctx.onInvalidated(() => ui.remove());
  // Removing a UI also removes its context listener; otherwise timeline scrolling
  // would retain every former React root until this content script is invalidated.
  const remove = ui.remove.bind(ui);
  ui.remove = () => { unsubscribe(); remove(); };
  if (opts.position !== "inline") {
    // WXT positions a modal/overlay container `fixed; inset:0` over the whole viewport. It must
    // be click-through: only the children that opt back in (`pointer-events:auto`, e.g. the
    // block rectangle) may take pointer events, so the rest of the venue page stays usable.
    ui.uiContainer.style.pointerEvents = "none";
  }

  return {
    ui,
    update(next: ReactNode) {
      if (removed || ctx.isInvalid) return; // no-op after this mount's shadow root was removed
      root?.render(next);
    },
  };
}

/**
 * Guards an async mount against a target/session change that lands while `mountFn()` is still
 * in flight (the residual A2 race: `onBind`/`renderFrame` in venues.content/displays.tsx call
 * `mountReact()` without the caller awaiting the outer `sync()`, so a page can move on to a new
 * target before the mount resolves). `key` is the render key captured at the start of the
 * caller; if `getKey()` no longer matches it once `mountFn()` resolves, the just-created mount
 * is removed immediately and `null` is returned so the caller never assigns it as the current
 * mount.
 */
export async function mountIfCurrent<M extends { ui: { remove(): void } }>(
  getKey: () => string | null,
  key: string,
  mountFn: () => Promise<M>,
): Promise<M | null> {
  const mount = await mountFn();
  if (getKey() !== key) {
    mount.ui.remove();
    return null;
  }
  return mount;
}
