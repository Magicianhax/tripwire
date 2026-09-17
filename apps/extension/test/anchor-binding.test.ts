// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createAnchorBinding } from "../lib/adapters/anchor-binding";
import { installBlocker } from "../lib/adapters/blocker";

describe("createAnchorBinding", () => {
  it("binds once on the first sync() when find() returns a connected node", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onBind = vi.fn();
    const onUnbind = vi.fn();

    const binding = createAnchorBinding({ find: () => anchor, onBind, onUnbind });
    binding.sync();

    expect(onBind).toHaveBeenCalledTimes(1);
    expect(onBind).toHaveBeenCalledWith(anchor);
    expect(onUnbind).not.toHaveBeenCalled();
    expect(binding.anchor).toBe(anchor);
  });

  it("does not rebind on repeated sync() calls when find() keeps returning the same node", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onBind = vi.fn();
    const onUnbind = vi.fn();

    const binding = createAnchorBinding({ find: () => anchor, onBind, onUnbind });
    binding.sync();
    binding.sync();
    binding.sync();

    expect(onBind).toHaveBeenCalledTimes(1);
    expect(onUnbind).not.toHaveBeenCalled();
  });

  it("rebinds when the SPA replaces the node: old released, new bound", () => {
    const oldAnchor = document.createElement("button");
    const newAnchor = document.createElement("button");
    document.body.appendChild(oldAnchor);

    let live: HTMLElement | null = oldAnchor;
    const onBind = vi.fn();
    const onUnbind = vi.fn();
    const binding = createAnchorBinding({ find: () => live, onBind, onUnbind });

    binding.sync();
    expect(onBind).toHaveBeenNthCalledWith(1, oldAnchor);

    // The venue replaces the node: old one removed from the DOM, a new one takes its place.
    oldAnchor.remove();
    document.body.appendChild(newAnchor);
    live = newAnchor;

    binding.sync();

    expect(onUnbind).toHaveBeenCalledTimes(1);
    expect(onBind).toHaveBeenCalledTimes(2);
    expect(onBind).toHaveBeenNthCalledWith(2, newAnchor);
    expect(binding.anchor).toBe(newAnchor);
  });

  it("integration: the blocker actually moves to the new node when the anchor is replaced", () => {
    const oldAnchor = document.createElement("button");
    const newAnchor = document.createElement("button");
    document.body.appendChild(oldAnchor);

    let live: HTMLElement | null = oldAnchor;
    let release: (() => void) | null = null;
    const binding = createAnchorBinding({
      find: () => live,
      onBind: (a) => {
        release = installBlocker(a).release;
      },
      onUnbind: () => {
        release?.();
        release = null;
      },
    });
    binding.sync();

    let oldClicked = false;
    oldAnchor.addEventListener("click", () => {
      oldClicked = true;
    });
    oldAnchor.click();
    expect(oldClicked).toBe(false); // blocked while bound

    oldAnchor.remove();
    document.body.appendChild(newAnchor);
    live = newAnchor;
    binding.sync();

    // Old node: released, a click on it (if it were still reachable) would go through.
    let oldClickedAfterRelease = false;
    oldAnchor.addEventListener("click", () => {
      oldClickedAfterRelease = true;
    });
    oldAnchor.click();
    expect(oldClickedAfterRelease).toBe(true);

    // New node: blocked.
    let newClicked = false;
    newAnchor.addEventListener("click", () => {
      newClicked = true;
    });
    newAnchor.click();
    expect(newClicked).toBe(false);
  });

  it("node removed entirely: unbind() fires, no new bind", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    let live: HTMLElement | null = anchor;
    const onBind = vi.fn();
    const onUnbind = vi.fn();
    const binding = createAnchorBinding({ find: () => live, onBind, onUnbind });
    binding.sync();

    anchor.remove();
    live = null;
    binding.sync();

    expect(onUnbind).toHaveBeenCalledTimes(1);
    expect(onBind).toHaveBeenCalledTimes(1); // still just the original bind
    expect(binding.anchor).toBeNull();
  });

  it("detects a detached-but-still-referenced node (find() didn't notice) via isConnected", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    const onBind = vi.fn();
    const onUnbind = vi.fn();
    const binding = createAnchorBinding({ find: () => anchor, onBind, onUnbind });
    binding.sync();

    anchor.remove(); // find() still returns `anchor` (same reference), but it's detached now
    binding.sync();

    expect(onUnbind).toHaveBeenCalledTimes(1);
    expect(binding.anchor).toBeNull();
  });

  it("unbind() force-releases regardless of find()", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onUnbind = vi.fn();
    const binding = createAnchorBinding({ find: () => anchor, onBind: () => {}, onUnbind });
    binding.sync();

    binding.unbind();

    expect(onUnbind).toHaveBeenCalledTimes(1);
    expect(binding.anchor).toBeNull();

    // A further sync() re-finds and re-binds (unbind() doesn't permanently disable the binding).
    binding.sync();
    expect(binding.anchor).toBe(anchor);
  });
});
