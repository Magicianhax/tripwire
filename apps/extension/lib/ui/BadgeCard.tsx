import { useContext, useId } from "react";
import { NANSEN_LOGO, venueLogo, type WalletVenue } from "@tripwire/core";
import { Maximize2, Minimize2 } from "lucide-react";
import type { AuthorBadgesResponse, BadgeLink } from "../api-types";
import { badgeVenues, type BadgeVenue } from "./BadgeRow";
import { CloseIcon, Icon } from "./icons";
import { LinkStatus, LinkWallet } from "./LinkWallet";
import { BrandMark } from "./Logo";
import { Empty, NansenLink, Problems } from "./panel-parts";
import { EntityProfile } from "./EntityProfile";
import { ReplayBadge } from "./ReplayBadge";
import { HyperliquidBody, PolymarketBody } from "./VenueBody";
import { PopoverContext } from "./Popover";
import { Tabs, type TabDef } from "./Tabs";

export type BadgeCardProps = {
  handle: string;
  displayName: string;
  badges: AuthorBadgesResponse | null;
  /** The badge that was clicked: its tab opens first. */
  initial: BadgeVenue;
  onClose: () => void;
  onSave: (venue: WalletVenue, address: string) => Promise<string | null>;
  onUnlink: (venue: WalletVenue) => Promise<string | null>;
};

/**
 * The author badge card: the same floating card as the post evidence, with one tab per badge the
 * author has (Nansen · Hyperliquid · Polymarket) and the wallet-link controls. Nothing here is
 * shown for an account without an exact Nansen match or an explicit wallet link.
 */
export function BadgeCard({ handle, displayName, badges, initial, onClose, onSave, onUnlink }: BadgeCardProps) {
  const pop = useContext(PopoverContext);
  const ownId = useId();
  const headingId = pop?.headingId ?? ownId;
  const close = pop ? () => pop.close("close-button") : onClose;
  const toggleSize = pop?.onToggleSize;
  const size = pop?.size ?? "compact";
  const venues = badgeVenues(badges);
  const shown: BadgeVenue[] = venues.length > 0 ? venues : ["nansen"];
  const links: Partial<Record<WalletVenue, BadgeLink>> = {};
  if (badges?.hyperliquid) links.hyperliquid = badges.hyperliquid.link;
  if (badges?.polymarket) links.polymarket = badges.polymarket.link;

  const tab = (venue: BadgeVenue): TabDef => {
    const logo = venue === "nansen" ? NANSEN_LOGO : venueLogo(venue)!;
    const label = venue === "nansen" ? "Nansen" : venue === "hyperliquid" ? "Hyperliquid" : "Polymarket";
    const content =
      venue === "nansen" ? (
        badges?.nansen ? <EntityProfile badge={badges.nansen} expanded={size === "expanded"} /> : <Empty>No Nansen label for @{handle}.</Empty>
      ) : venue === "hyperliquid" ? (
        <HyperliquidBody badge={badges!.hyperliquid!} head={<LinkStatus venue="hyperliquid" link={badges!.hyperliquid!.link} onUnlink={onUnlink} />} />
      ) : (
        <PolymarketBody badge={badges!.polymarket!} head={<LinkStatus venue="polymarket" link={badges!.polymarket!.link} onUnlink={onUnlink} />} />
      );
    return { id: venue, label, icon: <BrandMark logo={logo} size={14} />, content };
  };

  return (
    <section className="tw-card tw-badge-card" data-size={size}>
      <header className="tw-card-header">
        <div className="tw-card-heading">
          <h2 id={headingId} className="tw-card-title" tabIndex={-1}>
            {displayName || `@${handle}`}
          </h2>
          <span className="tw-card-sub">
            <span className="tw-meta">@{handle}</span>
          </span>
        </div>
        <ReplayBadge replay={badges?.replay} />
        {/* Named rather than tooltipped, for the same reason as the evidence card's control
            (see `CardHeader` in panel-parts.tsx). */}
        {toggleSize ? (
          <button type="button" className="tw-card-size" aria-label={size === "expanded" ? "Collapse card" : "Expand card"} onClick={toggleSize}>
            <Icon icon={size === "expanded" ? Minimize2 : Maximize2} size={16} />
          </button>
        ) : null}
        <button type="button" className="tw-card-close" aria-label="Close" onClick={close}>
          <CloseIcon />
        </button>
      </header>
      <div className="tw-card-scroll">
        <Tabs label="Author badges" tabs={shown.map(tab)} initial={venues.includes(initial) ? initial : shown[0]} />
        <div className="tw-card-links">
          <LinkWallet handle={handle} links={links} onSave={onSave} onUnlink={onUnlink} />
        </div>
      </div>
      <footer className="tw-card-footer">
        <div className="tw-card-credit">
          {badges?.nansen ? <NansenLink href={badges.nansen.nansenUrl ?? `https://app.nansen.ai/profiler?chain=all&entity=${encodeURIComponent(badges.nansen.entity)}&tab=overview`} /> : null}
          <p className="tw-meta tw-powered">
            Powered by <BrandMark logo={NANSEN_LOGO} size={14} /> <span className="tw-powered-name">Nansen</span>
          </p>
          <p className="tw-meta">Links stay on this machine</p>
        </div>
        <Problems errors={badges?.errors ?? []} />
      </footer>
    </section>
  );
}
