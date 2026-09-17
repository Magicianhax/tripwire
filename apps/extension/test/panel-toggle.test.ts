import { describe, expect, it, vi } from "vitest";
import { createPanelToggle } from "../lib/x/panel-toggle";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const fakeMount = () => ({ ui: { remove: vi.fn() } });

describe("createPanelToggle (D4)", () => {
  it("open, close, reopen while the first load is in flight: exactly one panel mounted", async () => {
    const loads = [deferred<void>(), deferred<void>()];
    const created: ReturnType<typeof fakeMount>[] = [];
    let call = 0;
    const onMounted = vi.fn();
    const toggle = createPanelToggle({
      open: async (isCurrent) => {
        await loads[call++]!.promise;
        const m = fakeMount();
        created.push(m);
        return isCurrent() ? m : m; // mount even when stale: the controller must discard it
      },
      onExpandedChange: () => {},
      onMounted,
    });

    const first = toggle.toggle(); // open #1
    await toggle.toggle(); // close
    const second = toggle.toggle(); // open #2
    loads[0]!.resolve();
    loads[1]!.resolve();
    await Promise.all([first, second]);

    expect(created).toHaveLength(2);
    expect(onMounted).toHaveBeenCalledTimes(1);
    expect(created[0]!.ui.remove).toHaveBeenCalledTimes(1); // the stale one
    expect(created[1]!.ui.remove).not.toHaveBeenCalled();
    expect(toggle.expanded).toBe(true);
  });

  it("closing removes the mounted panel; a failed load collapses the chip", async () => {
    const m = fakeMount();
    const changes: boolean[] = [];
    let fail = false;
    const toggle = createPanelToggle({
      open: async () => (fail ? null : m),
      onExpandedChange: (e) => changes.push(e),
    });
    await toggle.toggle();
    await toggle.toggle();
    expect(m.ui.remove).toHaveBeenCalledTimes(1);

    fail = true;
    await toggle.toggle();
    expect(toggle.expanded).toBe(false);
    expect(changes).toEqual([true, false, true, false]);
  });
});
