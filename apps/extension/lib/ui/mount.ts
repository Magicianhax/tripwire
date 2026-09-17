import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

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

  const ui = await createShadowRootUi(ctx, {
    name: "tripwire-ui",
    ...opts,
    onMount(container) {
      root = createRoot(container);
      root.render(node);
      return root;
    },
    onRemove(mountedRoot) {
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
      root?.render(next);
    },
  };
}
