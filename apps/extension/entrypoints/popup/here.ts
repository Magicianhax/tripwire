import { isBuiltinOrigin, isEnableableUrl } from "../../lib/permissions";

/**
 * What Tripwire does on the tab the popup was opened over.
 *
 * Derived entirely from what the popup already knows — the tab's URL, the manifest's own hosts
 * and the origins the user granted — so the row costs no message to the page and cannot
 * disagree with the Sites tab. Whether anything is *mounted* right now is a different question,
 * and the only honest answer to it is the one the locate action gets from the page itself.
 */

export type HereState = "builtin" | "granted" | "off" | "none";
export type Here = { host: string | null; origin: string | null; state: HereState };

export const HERE_TEXT: Record<HereState, string> = {
  builtin: "Tripwire runs here",
  granted: "Wallet lens enabled here",
  off: "Not enabled here",
  none: "No page here to watch",
};

export const NOWHERE: Here = { host: null, origin: null, state: "none" };

export function hereFrom(url: string | undefined, sites: string[] | null): Here {
  if (!isEnableableUrl(url)) return NOWHERE;
  let parsed: URL;
  try {
    parsed = new URL(url!);
  } catch {
    return NOWHERE;
  }
  const origin = parsed.origin;
  const host = parsed.host;
  if (isBuiltinOrigin(origin)) return { host, origin, state: "builtin" };
  return { host, origin, state: (sites ?? []).includes(origin) ? "granted" : "off" };
}
