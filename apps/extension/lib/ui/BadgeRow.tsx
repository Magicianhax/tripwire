import { NANSEN_LOGO, venueLogo, type BrandLogo } from "@tripwire/core";
import type { AuthorBadgesResponse } from "../api-types";
import { BrandMark } from "./Logo";
import { Tooltip } from "./Tooltip";

export type BadgeVenue = "nansen" | "hyperliquid" | "polymarket";

const MARK: Record<BadgeVenue, { logo: BrandLogo; label: string }> = {
  nansen: { logo: NANSEN_LOGO, label: "Nansen label" },
  hyperliquid: { logo: venueLogo("hyperliquid")!, label: "Hyperliquid account" },
  polymarket: { logo: venueLogo("polymarket")!, label: "Polymarket account" },
};

/** Which badges this author has earned, in a fixed order (never a guess: see lib/intel/badges.ts). */
export function badgeVenues(badges: AuthorBadgesResponse | null): BadgeVenue[] {
  if (!badges) return [];
  return (["nansen", "hyperliquid", "polymarket"] as const).filter((v) => badges[v] !== undefined);
}

/**
 * The logo badges that sit right after the author's username on X. Each opens the badge card on
 * its own venue; the open one is marked expanded. Renders nothing when the author has no badge,
 * so an ordinary account's header is untouched.
 */
export function BadgeRow({
  handle,
  badges,
  open,
  onOpen,
}: {
  handle: string;
  badges: AuthorBadgesResponse | null;
  open: BadgeVenue | null;
  onOpen: (venue: BadgeVenue) => void;
}) {
  const venues = badgeVenues(badges);
  if (venues.length === 0) return null;
  return (
    <span className="tw-badges">
      {venues.map((venue) => {
        const label = `${MARK[venue].label} for @${handle}`;
        return (
          <Tooltip key={venue} label={label}>
            {(labelId) => (
              <button
                type="button"
                className="tw-badge"
                data-venue={venue}
                aria-labelledby={labelId}
                aria-haspopup="dialog"
                aria-expanded={open === venue}
                onClick={() => onOpen(venue)}
              >
                <BrandMark logo={MARK[venue].logo} size={14} />
              </button>
            )}
          </Tooltip>
        );
      })}
    </span>
  );
}
