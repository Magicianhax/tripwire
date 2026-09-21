import type { KeySource } from "../../lib/api-types";

export type PopupStatus = { text: string; state: "connected" | "offline" | "not-ready" | undefined };

/** The popup's one status line, from the health check (`null` while it's in flight). A backend
 * without a Nansen key is reachable but not ready: every check would come back UNCHECKED --
 * except in replay mode, where every check is served from recorded fixtures and no key is
 * needed at all, so that combination is ready, not a warning.
 *
 * One short phrase, because it sits beside the wordmark in a 56px header: the state first, the
 * detail or the fix after a middot. */
export function popupStatus(health: { ok: true; keySource: KeySource; replay: boolean } | { ok: false; status?: number } | null): PopupStatus {
  if (!health) return { text: "Connecting…", state: undefined };
  // 401 is the backend answering and not recognising this install (registration was refused, or
  // the token is from another deployment). It is reachable, so "offline" would send the user
  // looking at their Wi-Fi for a problem that is not there.
  if (!health.ok && health.status === 401) return { text: "Couldn't register · try again later", state: "not-ready" };
  if (!health.ok && health.status === 429) return { text: "Busy · try again later", state: "not-ready" };
  if (!health.ok) return { text: "Offline · check connection", state: "offline" };
  if (health.replay) return { text: "Sample data", state: "connected" };
  if (health.keySource === "none") return { text: "Data service needs setup", state: "not-ready" };
  return { text: "Connected", state: "connected" };
}
