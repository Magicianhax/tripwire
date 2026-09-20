import { CircleCheck, CircleX, History, Info, LoaderCircle, ScrollText, Settings, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { NANSEN_LOGO } from "@tripwire/core";
import { Icon } from "../../lib/ui/icons";
import { BrandMark } from "../../lib/ui/Logo";
import { Tooltip } from "../../lib/ui/Tooltip";
import type { PopupStatus } from "./status";

/** The status icon's shape carries the state, so no state is told apart by colour alone. */
const STATUS_ICON = { connected: CircleCheck, offline: CircleX, "not-ready": TriangleAlert } as const;

/** The one sentence about where inspected addresses go. It is a footnote, not a paragraph in
 * the middle of the Wallets tab, so it lives behind the footer's info icon. */
export const PRIVACY_LINE = "Addresses you inspect go to your own local backend and then to Nansen; the recent list stays in this browser profile.";

/** Pinned header: who this is, whether the backend is there, and the way into the one setting. */
export function PopupHead({ status, settingsOpen, onToggleSettings }: { status: PopupStatus; settingsOpen: boolean; onToggleSettings: () => void }) {
  return (
    <header className="tw-popup-head">
      <h1 className="tw-wordmark">Tripwire</h1>
      <p className="tw-status" data-state={status.state} role="status" aria-live="polite">
        <Icon icon={status.state ? STATUS_ICON[status.state] : LoaderCircle} size={14} className={status.state ? undefined : "tw-spin"} />
        <span className="tw-status-text">{status.text}</span>
      </p>
      <button type="button" className="tw-gear" aria-expanded={settingsOpen} aria-label="Settings" onClick={onToggleSettings}>
        <Icon icon={Settings} size={16} />
      </button>
    </header>
  );
}

const FOOT_LINKS = [
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/ledger", label: "Ledger", icon: ScrollText },
  { href: "/history", label: "History", icon: History },
] as const;

/** Pinned footer: the Nansen credit, the three local pages, and the privacy line as a tooltip. */
export function PopupFoot({ backendUrl }: { backendUrl: string }) {
  return (
    <footer className="tw-popup-foot">
      <span className="tw-powered">
        <BrandMark logo={NANSEN_LOGO} size={14} />
        <span className="tw-powered-name">Nansen</span>
      </span>
      <nav className="tw-foot-links" aria-label="Local pages">
        {FOOT_LINKS.map((link) => (
          <a key={link.href} href={`${backendUrl}${link.href}`} target="_blank" rel="noopener noreferrer">
            <Icon icon={link.icon} size={14} />
            {link.label}
          </a>
        ))}
      </nav>
      <Tooltip label={PRIVACY_LINE} align="end">
        {(labelId) => (
          <button type="button" className="tw-foot-info" aria-describedby={labelId} aria-label="Where your data goes">
            <Icon icon={Info} size={14} />
          </button>
        )}
      </Tooltip>
    </footer>
  );
}
