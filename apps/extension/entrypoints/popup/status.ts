import type { KeySource } from "../../lib/api-types";

export type PopupStatus = { text: string; state: "connected" | "offline" | "not-ready" | undefined };

/** The popup's one status line, from the health check (`null` while it's in flight). A backend
 * without a Nansen key is reachable but not ready: every check would come back UNCHECKED --
 * except in replay mode, where every check is served from recorded fixtures and no key is
 * needed at all, so that combination is ready, not a warning. */
export function popupStatus(health: { ok: true; keySource: KeySource; replay: boolean } | { ok: false } | null): PopupStatus {
  if (!health) return { text: "Checking backend…", state: undefined };
  if (!health.ok) return { text: "Backend offline: run pnpm dev", state: "offline" };
  if (health.replay && health.keySource === "none") {
    return { text: "Replay mode: recorded data, no key needed", state: "connected" };
  }
  switch (health.keySource) {
    case "nansen-cli":
      return { text: "Backend connected, key via Nansen CLI", state: "connected" };
    case "env":
      return { text: "Backend connected, key via NANSEN_API_KEY", state: "connected" };
    default:
      return { text: "No Nansen key: set NANSEN_API_KEY or run nansen login", state: "not-ready" };
  }
}
