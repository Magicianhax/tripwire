import { useContext, useId } from "react";
import { cleanLabel, NANSEN_LOGO, venueLogo, type WalletVenue } from "@tripwire/core";
import { BadgeCheck, CircleAlert } from "lucide-react";
import type { AuthorBadgesResponse, BadgeLink, HyperliquidBadge, NansenBadge, PolymarketBadge } from "../api-types";
import { badgeVenues, type BadgeVenue } from "./BadgeRow";
import { pct, timeAgo, usd } from "./format";
import { CloseIcon, Icon, LABEL_KIND_ICON } from "./icons";
import { LinkStatus, LinkWallet } from "./LinkWallet";
import { BrandMark, ChainLogo, monogram } from "./Logo";
import { Empty, Section } from "./panel-parts";
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

const sign = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "zero" : v < 0 ? "neg" : "pos");
const rate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct(v * 100));

/** Figure tiles: a label and its value, red or mint when the value is signed. */
function Readouts({ items }: { items: { label: string; value: string; sign?: "pos" | "neg" | "zero" }[] }) {
  return (
    <dl className="tw-readouts">
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd className="tw-fig" data-sign={it.sign}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Sources({ children }: { children: string }) {
  return <p className="tw-sources tw-meta">Data: {children}</p>;
}

function Problems({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="tw-errors">
      {errors.map((e, i) => (
        <li key={i}>
          <Icon icon={CircleAlert} size={14} />
          Unavailable: {e}
        </li>
      ))}
    </ul>
  );
}

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

function HyperliquidTab({ badge, onUnlink }: { badge: HyperliquidBadge; onUnlink: (venue: WalletVenue) => Promise<string | null> }) {
  const positions = badge.positions ?? [];
  const fills = badge.fills ?? [];
  return (
    <>
      <LinkStatus venue="hyperliquid" link={badge.link} onUnlink={onUnlink} />
      <Readouts
        items={[
          { label: "Account value", value: usd(badge.accountValueUsd) },
          { label: "Margin used", value: usd(badge.marginUsedUsd) },
          { label: `Realized PnL ${badge.nansenPerp?.windowDays ?? 30}d`, value: usd(badge.nansenPerp?.realizedPnlUsd, true), sign: sign(badge.nansenPerp?.realizedPnlUsd) },
          { label: "Win rate", value: rate(badge.nansenPerp?.winRate) },
        ]}
      />
      <Section title="Open positions">
        {positions.length === 0 ? (
          <Empty>No open positions on Hyperliquid.</Empty>
        ) : (
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Coin</th>
                <th scope="col">Side</th>
                <th scope="col" className="tw-num">
                  Entry / Mark
                </th>
                <th scope="col" className="tw-num">
                  Liq.
                </th>
                <th scope="col" className="tw-num">
                  uPnL
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.slice(0, 5).map((p) => (
                <tr key={p.coin}>
                  <td>{p.coin}</td>
                  <td>
                    <span className="tw-side" data-side={p.side}>
                      {p.side === "short" ? "Short" : "Long"}
                      {p.leverage ? ` ${p.leverage}x` : ""}
                    </span>
                  </td>
                  <td className="tw-fig tw-num">
                    {usd(p.entryPx)} / {usd(p.markPx)}
                  </td>
                  <td className="tw-fig tw-num">{p.liquidationPx === null ? "—" : usd(p.liquidationPx)}</td>
                  <td className="tw-fig tw-num" data-sign={sign(p.unrealizedPnlUsd)}>
                    {usd(p.unrealizedPnlUsd, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section
        title="Recent fills"
        aside={badge.fillsWindow ? `${usd(badge.fillsRealizedPnlUsd, true)} over ${badge.fillsWindow.count} fills` : undefined}
      >
        {fills.length === 0 ? (
          <Empty>No fills in Hyperliquid's recent window.</Empty>
        ) : (
          <ul className="tw-trade-list" data-cols="3">
            {fills.map((f) => (
              <li key={`${f.time}-${f.coin}-${f.px}`}>
                <span>
                  {f.dir} {f.coin}
                </span>
                <span className="tw-fig" data-sign={sign(f.closedPnlUsd)}>
                  {usd(f.closedPnlUsd, true)}
                </span>
                <span className="tw-fig tw-meta">{timeAgo(new Date(f.time).toISOString())}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Problems errors={badge.errors} />
      <Sources>Hyperliquid API (public, backend only) · Nansen perp PnL</Sources>
    </>
  );
}

function PolymarketTab({ badge, onUnlink }: { badge: PolymarketBadge; onUnlink: (venue: WalletVenue) => Promise<string | null> }) {
  const open = badge.openPositions ?? [];
  const trades = badge.trades ?? [];
  return (
    <>
      <LinkStatus venue="polymarket" link={badge.link} onUnlink={onUnlink} />
      <Readouts
        items={[
          { label: "Total PnL", value: usd(badge.totalPnlUsd, true), sign: sign(badge.totalPnlUsd) },
          { label: "Realized", value: usd(badge.realizedPnlUsd, true), sign: sign(badge.realizedPnlUsd) },
          { label: "Unrealized", value: usd(badge.unrealizedPnlUsd, true), sign: sign(badge.unrealizedPnlUsd) },
          { label: "Win rate", value: rate(badge.winRate) },
        ]}
      />
      <Section
        title="Open positions"
        aside={badge.marketsTraded !== null ? `${badge.marketsWon ?? 0} won of ${badge.marketsTraded} markets` : undefined}
      >
        {open.length === 0 ? (
          <Empty>No open positions on Polymarket.</Empty>
        ) : (
          <ul className="tw-market-rows">
            {open.map((p) => (
              <li key={p.marketId}>
                <span className="tw-market-question">{p.question}</span>
                <span className="tw-market-figures">
                  <span className="tw-side" data-side={p.side.toLowerCase() === "yes" ? "long" : "short"}>
                    {p.side}
                  </span>
                  <span className="tw-fig">{usd(p.valueUsd)}</span>
                  <span className="tw-fig" data-sign={sign(p.pnlUsd)}>
                    {usd(p.pnlUsd, true)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Recent trades">
        {trades.length === 0 ? (
          <Empty>No recent Polymarket trades.</Empty>
        ) : (
          <ul className="tw-trade-list" data-cols="3">
            {trades.map((t, i) => (
              <li key={`${t.timestamp}-${i}`}>
                <span>
                  {t.action ?? "Trade"} {t.side ?? ""} at {t.price === null ? "—" : `${Math.round(t.price * 100)}¢`}
                </span>
                <span className="tw-fig">{usd(t.usdcValue)}</span>
                <span className="tw-fig tw-meta">{timeAgo(`${t.timestamp}${/[Zz]|[+-]\d\d:?\d\d$/.test(t.timestamp) ? "" : "Z"}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Problems errors={badge.errors} />
      <Sources>Nansen prediction market</Sources>
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
        <HyperliquidTab badge={badges!.hyperliquid!} onUnlink={onUnlink} />
      ) : (
        <PolymarketTab badge={badges!.polymarket!} onUnlink={onUnlink} />
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
