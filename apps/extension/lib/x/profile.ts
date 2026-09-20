import { HANDLE_RE } from "@tripwire/core";

const RESERVED = new Set(["home", "explore", "search", "notifications", "messages", "i", "settings", "compose", "login", "logout", "signup", "intent", "share", "tos", "privacy", "jobs"]);
const PROFILE_TABS = new Set(["with_replies", "media", "highlights", "articles", "likes"]);

export type ProfileHeader = { owner: Element; anchor: Element; handle: string; displayName: string };

/** Restrict discovery to account pages, never a status page, sidebar recommendation or tweet. */
export function parseProfile(root: Document, pathname: string): ProfileHeader | null {
  const parts = pathname.split("/").filter(Boolean);
  const handle = parts[0] ?? "";
  if (!HANDLE_RE.test(handle) || RESERVED.has(handle.toLowerCase()) || parts.length > 2 ||
    (parts[1] && !PROFILE_TABS.has(parts[1]))) return null;
  const primary = root.querySelector('[data-testid="primaryColumn"]');
  for (const owner of Array.from(primary?.querySelectorAll('[data-testid="UserName"]') ?? []).slice(0, 8)) {
    if (owner.closest('article, [role="dialog"]')) continue;
    const handleNode = Array.from(owner.querySelectorAll("span")).find(
      (node) => node.textContent?.trim().toLowerCase() === `@${handle.toLowerCase()}`,
    );
    if (!handleNode) continue;
    // React Native can wrap both identity rows in one shared child of UserName.
    // Walk from the exact handle to their nearest sibling boundary, rather than
    // requiring the rows to be direct children of UserName.
    let handleBranch: Element = handleNode;
    while (handleBranch.parentElement && handleBranch !== owner && !handleBranch.previousElementSibling) {
      handleBranch = handleBranch.parentElement;
    }
    const nameRow = handleBranch === owner ? null : handleBranch.previousElementSibling;
    if (!nameRow || nameRow.matches("a, button, [role='button']") || nameRow.closest("a, button, [role='button']")) continue;
    const clone = nameRow.cloneNode(true) as Element;
    for (const el of clone.querySelectorAll("svg, tripwire-ui, [data-tripwire]")) el.remove();
    const displayName = clone.textContent?.trim() ?? "";
    if (!displayName) continue;
    // Append beside the entire verification control, not inside its link/button.
    const anchor = Array.from(nameRow.children).filter((el) => el.localName !== "tripwire-ui").at(-1);
    if (anchor) return { owner, anchor, handle, displayName };
  }
  // X also ships a semantic header without React Native's test IDs. Its account h1 and
  // @handle occupy adjacent rows in one identity block; never search broader ancestors.
  const headings = Array.from(root.querySelectorAll("h1")).filter(
    (heading) => !heading.closest('article, aside, nav, [role="dialog"], a, button, [role="button"]'),
  );
  if (headings.length !== 1) return null;
  const heading = headings[0]!;
  const nameRow = heading.parentElement;
  const owner = nameRow?.parentElement;
  if (!nameRow || !owner || owner.matches("body, main, a, button, [role='button']")) return null;
  const handleRow = nameRow.nextElementSibling;
  if (handleRow?.textContent?.trim().toLowerCase() !== `@${handle.toLowerCase()}`) return null;
  const displayName = heading.textContent?.trim();
  const anchor = Array.from(nameRow.children).filter((el) => el.localName !== "tripwire-ui").at(-1);
  if (displayName && anchor) return { owner, anchor, handle, displayName };
  return null;
}

type Attachment = { dispose(): void; retry: boolean };

/** One bounded scan per tick; at most three attempts for transient lookup failures per header. */
export function createProfileDiscovery(options: {
  read(): ProfileHeader | null;
  attach(profile: ProfileHeader, isCurrent: () => boolean): Promise<Attachment>;
}) {
  let active: { profile: ProfileHeader; attempts: number; pending: boolean; attachment?: Attachment } | null = null;
  let stopped = false;
  function clear() { active?.attachment?.dispose(); active = null; }
  async function tick() {
    if (stopped) return;
    const profile = options.read();
    if (!profile) { clear(); return; }
    if (!active || active.profile.owner !== profile.owner || active.profile.anchor !== profile.anchor ||
      active.profile.handle.toLowerCase() !== profile.handle.toLowerCase() || active.profile.displayName !== profile.displayName) {
      clear();
      active = { profile, attempts: 0, pending: false };
    }
    const record = active;
    if (record.pending || record.attempts >= 3 || (record.attachment && !record.attachment.retry)) return;
    record.attachment?.dispose();
    record.attachment = undefined;
    record.pending = true;
    record.attempts++;
    const isCurrent = () => {
      const now = options.read();
      return !stopped && active === record && now?.owner === profile.owner && now.anchor === profile.anchor &&
        now.handle.toLowerCase() === profile.handle.toLowerCase() && now.displayName === profile.displayName;
    };
    try {
      const attachment = await options.attach(profile, isCurrent);
      if (!isCurrent()) attachment.dispose();
      else record.attachment = attachment;
    } catch {
      // A transport/mount rejection can retry on the next tick, within the same attempt cap.
    } finally { record.pending = false; }
  }
  return { tick, stop() { stopped = true; clear(); } };
}
