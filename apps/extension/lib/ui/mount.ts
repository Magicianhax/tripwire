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
  | { position: "inline"; anchor?: AnchorOption; append?: AppendOption }
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
    onMount(container) {
      root = createRoot(container);
      root.render(node);
      return root;
    },
    onRemove(mountedRoot) {
      removed = true;
      mountedRoot?.unmount();
    },
  });

  ui.mount();
  if (opts.position !== "inline") {
    // WXT positions a modal/overlay container `fixed; inset:0` over the whole viewport. It must
    // be click-through: only the children that opt back in (`pointer-events:auto`, e.g. the
    // block rectangle) may take pointer events, so the rest of the venue page stays usable.
    ui.uiContainer.style.pointerEvents = "none";
  }

  return {
    ui,
    update(next: ReactNode) {
      if (removed) return; // no-op after this mount's shadow root was removed
      root?.render(next);
    },
  };
}
