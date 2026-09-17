// @vitest-environment happy-dom
import { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

// @wxt-dev/browser reads globalThis.chrome at import time (WXT's own dist imports it too, so a
// vi.mock of "wxt/browser" wouldn't reach it): install a minimal runtime before importing.
vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { getURL: (p: string) => `chrome-extension://tripwiretest${p}` },
  };
});

const { mountReact, mountIfCurrent } = await import("../lib/ui/mount");

/** Just enough of WXT's ContentScriptContext for createShadowRootUi: no CSS injection (the
 * entry stylesheet fetch needs a real extension runtime) and a no-op invalidation hook. */
function fakeCtx(): ContentScriptContext {
  return { options: {}, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

/** A context with WXT's real cssInjectionMode "ui" path, serving the content scripts' actual
 * entry stylesheet (theme.css) to createShadowRootUi's fetch. */
function uiCssCtx(): ContentScriptContext {
  const css = readFileSync(path.resolve(__dirname, "..", "lib", "ui", "theme.css"), "utf8");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(css)));
  return { options: { cssInjectionMode: "ui" }, onInvalidated: () => () => {} } as unknown as ContentScriptContext;
}

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

  it("mounting many chips adds at most one font-face style to document.head", async () => {
    const ctx = uiCssCtx();
    const mounts: Awaited<ReturnType<typeof mountReact>>[] = [];
    await act(async () => {
      for (let i = 0; i < 12; i++) mounts.push(await mountReact(ctx, { position: "inline" }, <span>chip {i}</span>));
    });
    const headStyles = [...document.head.querySelectorAll("style")];
    const fontStyles = headStyles.filter((s) => (s.textContent ?? "").includes("@font-face"));
    expect(fontStyles.length).toBe(1);
    expect(headStyles.length).toBe(1);
    // Fonts come from packaged extension files, never inlined data: URIs.
    expect(fontStyles[0]!.textContent).toContain("chrome-extension://tripwiretest/fonts/");
    expect(fontStyles[0]!.textContent).not.toContain("data:");
    // Each shadow root carries only the (small) theme, without @font-face.
    const shadowCss = mounts[0]!.ui.shadow.querySelector("style")?.textContent ?? "";
    expect(shadowCss).not.toContain("@font-face");
    expect(shadowCss.length).toBeLessThan(40_000);
    for (const m of mounts) m.ui.remove();
  });

  it("update() after the mount is removed is a no-op (React #409 guard)", async () => {
    let mount!: Awaited<ReturnType<typeof mountReact>>;
    await act(async () => {
      mount = await mountReact(fakeCtx(), { position: "inline" }, <span>chip</span>);
    });
    const host = mount.ui.shadowHost;
    mount.ui.remove();
    expect(host.isConnected).toBe(false);
    // A pending async result (e.g. getChipIntel resolving after a detached-tweet sweep)
    // landing after removal must never throw or attempt to render on the unmounted root.
    expect(() => mount.update(<span>late update</span>)).not.toThrow();
    expect(host.shadowRoot?.textContent ?? "").not.toContain("late update");
  });
});

describe("mountIfCurrent", () => {
  it("assigns the mount when the key is still current once mountFn resolves", async () => {
    const removeCalls: string[] = [];
    const fakeMount = { ui: { remove: () => removeCalls.push("removed") } };
    const result = await mountIfCurrent(
      () => "key-a",
      "key-a",
      async () => fakeMount,
    );
    expect(result).toBe(fakeMount);
    expect(removeCalls).toEqual([]);
  });

  it("removes and drops a stale mount when the key changed while mountFn was in flight", async () => {
    let currentKey = "key-a";
    const removeCalls: string[] = [];
    const fakeMount = { ui: { remove: () => removeCalls.push("removed") } };
    const result = await mountIfCurrent(
      () => currentKey,
      "key-a",
      async () => {
        currentKey = "key-b"; // the page moved on to a new target while this mount was mounting
        return fakeMount;
      },
    );
    expect(result).toBeNull();
    expect(removeCalls).toEqual(["removed"]);
  });
});
