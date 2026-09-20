// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMountTracker } from "../lib/x/mounts";

function article(): HTMLElement {
  const el = document.createElement("article");
  document.body.append(el);
  return el;
}

describe("createMountTracker", () => {
  it("removes every mount of an article that left the DOM, and reports that article", () => {
    const tracker = createMountTracker();
    const gone = article();
    const kept = article();
    const chip = { ui: { remove: vi.fn() } };
    const panel = { ui: { remove: vi.fn() } };
    const keptChip = { ui: { remove: vi.fn() } };
    tracker.track(gone, chip);
    tracker.track(gone, panel);
    tracker.track(kept, keptChip);

    gone.remove();
    expect(tracker.sweep()).toEqual([gone]);
    expect(chip.ui.remove).toHaveBeenCalledTimes(1);
    expect(panel.ui.remove).toHaveBeenCalledTimes(1);
    expect(keptChip.ui.remove).not.toHaveBeenCalled();
    expect(tracker.size).toBe(1);

    // idempotent
    expect(tracker.sweep()).toEqual([]);
    expect(chip.ui.remove).toHaveBeenCalledTimes(1);
  });

  it("untrack forgets a mount the caller already removed", () => {
    const tracker = createMountTracker();
    const a = article();
    const panel = { ui: { remove: vi.fn() } };
    tracker.track(a, panel);
    tracker.untrack(a, panel);
    a.remove();
    expect(tracker.sweep()).toEqual([]);
    expect(panel.ui.remove).not.toHaveBeenCalled();
  });

  // I-1: "where is it?" on x.com lights one of these, so it must only ever offer live ones.
  it("lists the mounts of articles the page still has, and no others", () => {
    const tracker = createMountTracker();
    const here = article();
    const gone = article();
    const chip = { ui: { remove: vi.fn() } };
    const stale = { ui: { remove: vi.fn() } };
    tracker.track(here, chip);
    tracker.track(gone, stale);
    gone.remove();
    expect(tracker.live()).toEqual([chip]);
  });
});
