import { useContext, useId } from "react";
import { cleanLabel, NANSEN_LOGO, venueLogo, type WalletVenue } from "@tripwire/core";
import { BadgeCheck, CircleAlert } from "lucide-react";
import type { AuthorBadgesResponse, BadgeLink, HyperliquidBadge, NansenBadge, PolymarketBadge } from "../api-types";
import { badgeVenues, type BadgeVenue } from "./BadgeRow";
import { pct, timeAgo, usd } from "./format";
import { CloseIcon, Icon, LABEL_KIND_ICON } from "./icons";
import { LinkStatus, LinkWallet } from "./LinkWallet";
import { BrandMark, ChainLogo, monogram } from "./Logo";
import { Empty, Problems, Readouts, Section, signOf as sign, Sources } from "./panel-parts";
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

const rate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct(v * 100));

function NansenTab({ badge, handle }: { badge: NansenBadge | undefined; handle: string }) {
  if (!badge) return <Empty>No Nansen label for @{handle}.</Empty>;
  return (
    <>
      <p className="tw-person">
        <Icon icon={BadgeCheck} size={16} />
        <span>
          Nansen label: <b>{badge.entity}</b>
        </span>
      </p>
      {badge.tags.length > 0 ? (
        <ul className="tw-tags">
          {badge.tags.map((tag) => {
            const clean = cleanLabel(tag);
            return (
              <li key={tag} className="tw-tag">
                <Icon icon={LABEL_KIND_ICON[clean.kind]} size={14} />
                {clean.text || tag}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Readouts
        items={[
          { label: "Holdings", value: usd(badge.totalHoldingsUsd) },
          { label: `Realized PnL ${badge.pnlWindowDays}d`, value: usd(badge.realizedPnlUsd, true), sign: sign(badge.realizedPnlUsd) },
          { label: "Win rate", value: rate(badge.winRate) },
        ]}
      />
      <Section title="Top holdings">
        {badge.topHoldings.length === 0 ? (
          <Empty>No holdings came back for this entity.</Empty>
        ) : (
          <ul className="tw-rows tw-holding-rows">
            {badge.topHoldings.map((h) => (
              <li key={`${h.chain}-${h.symbol}`}>
                <span className="tw-holding-name">
                  <span className="tw-token-logo tw-monogram" aria-hidden="true" style={{ width: 20, height: 20 }}>
                    {monogram(h.symbol)}
                  </span>
                  <span className="tw-row-name">{h.symbol}</span>
                  <ChainLogo chain={h.chain} size={14} />
                </span>
                <span className="tw-fig">{usd(h.valueUsd)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Problems errors={badge.errors} />
      <Sources>Nansen entity balances and PnL summary</Sources>
    </>
  );
}

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
        <NansenTab badge={badges?.nansen} handle={handle} />
      ) : venue === "hyperliquid" ? (
        <HyperliquidBody badge={badges!.hyperliquid!} head={<LinkStatus venue="hyperliquid" link={badges!.hyperliquid!.link} onUnlink={onUnlink} />} />
      ) : (
        <PolymarketBody badge={badges!.polymarket!} head={<LinkStatus venue="polymarket" link={badges!.polymarket!.link} onUnlink={onUnlink} />} />
      );
    return { id: venue, label, icon: <BrandMark logo={logo} size={14} />, content };
  };

  return (
    <section className="tw-card tw-badge-card">
      <header className="tw-card-header">
        <div className="tw-card-heading">
          <h2 id={headingId} className="tw-card-title" tabIndex={-1}>
            {displayName || `@${handle}`}
          </h2>
          <span className="tw-card-sub">
            <span className="tw-meta">@{handle}</span>
          </span>
        </div>
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
