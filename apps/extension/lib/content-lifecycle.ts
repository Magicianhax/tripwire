import type { ContentScriptContext } from "wxt/utils/content-script-context";

/** Reloaded extensions leave old content scripts alive until their page reloads. */
export function isContextInvalidated(error: unknown): boolean {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /extension context invalidated/i.test(message);
}

/** Event callbacks cannot await work; terminate obsolete contexts and report real failures. */
export async function runContentTask(ctx: ContentScriptContext, task: () => unknown | Promise<unknown>): Promise<void> {
  try {
    if (ctx.isInvalid) return;
    await task();
  } catch (error) {
    if (isContextInvalidated(error)) ctx.notifyInvalidated();
    else console.error("Tripwire content task failed", error);
  }
}
