// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { mountReact } from "../lib/ui/mount";

/** Just enough of WXT's ContentScriptContext for createShadowRootUi: no CSS injection (the
 * entry stylesheet fetch needs a real extension runtime) and a no-op invalidation hook. */
function fakeCtx(): ContentScriptContext {
  return { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("mountReact", () => {
  it("modal mounts never intercept pointer events outside their own interactive children", async () => {
    let mount!: Awaited<ReturnType<typeof mountReact>>;
    await act(async () => {
      mount = await mountReact(fakeCtx(), { position: "modal", zIndex: 10 }, <div data-testid="inner" style={{ pointerEvents: "auto" }} />);
    });
    const container = mount.ui.uiContainer;
    // WXT makes the modal container position:fixed; inset:0 -- it must be click-through.
    expect(container.style.position).toBe("fixed");
    expect(container.style.pointerEvents).toBe("none");
    mount.ui.remove();
  });

  it("inline mounts keep default pointer events", async () => {
    let mount!: Awaited<ReturnType<typeof mountReact>>;
    await act(async () => {
      mount = await mountReact(fakeCtx(), { position: "inline" }, <span>chip</span>);
    });
    expect(mount.ui.uiContainer.style.pointerEvents).toBe("");
    mount.ui.remove();
  });
});
