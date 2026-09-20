import { describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { runContentTask } from "../lib/content-lifecycle";

function context(isInvalid = false) {
  return { isInvalid, notifyInvalidated: vi.fn() } as unknown as ContentScriptContext;
}

describe("content script lifetime", () => {
  it("drains both synchronous and async invalidation failures into teardown", async () => {
    const ctx = context();
    await runContentTask(ctx, () => { throw new Error("Extension context invalidated."); });
    await runContentTask(ctx, async () => { throw new Error("Extension context invalidated."); });
    await runContentTask(ctx, async () => { throw { message: "Extension context invalidated." }; });
    expect(ctx.notifyInvalidated).toHaveBeenCalledTimes(3);
  });
  it("does not start new work in an invalid context", async () => {
    const task = vi.fn();
    await runContentTask(context(true), task);
    expect(task).not.toHaveBeenCalled();
  });
  it("reports real implementation failures instead of hiding them as reloads", async () => {
    const ctx = context();
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("bad adapter");
    try {
      await runContentTask(ctx, async () => { throw error; });
      expect(report).toHaveBeenCalledWith("Tripwire content task failed", error);
      expect(ctx.notifyInvalidated).not.toHaveBeenCalled();
    } finally { report.mockRestore(); }
  });
});
