import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { VENUE_LOGOS, type VenueId } from "@tripwire/core";
import { Icon } from "../../lib/ui/icons";
import { BrandMark } from "../../lib/ui/Logo";
import type { Here } from "./here";

/** Where Tripwire runs without being asked: tier 1 venues get a block screen over the trade
 * button, tier 2 an evidence dock. */
const VENUES: { tier: string; ids: VenueId[] }[] = [
  { tier: "Blocks trades", ids: ["jupiter", "pumpfun", "uniswap", "jumper", "hyperliquid", "polymarket"] },
  { tier: "Evidence dock", ids: ["raydium", "aerodrome", "pancakeswap", "1inch", "matcha", "cow", "axiom", "photon", "gmgn", "bullx", "dexscreener", "birdeye"] },
];

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

export function SitesTab({
  here,
  sites,
  error,
  onEnable,
  onDisable,
}: {
  here: Here;
  sites: string[] | null;
  error: string;
  onEnable: () => void;
  onDisable: (site: string) => void;
}) {
  return (
    <>
      <section className="tw-block" aria-labelledby="tw-sites-label">
        <h2 className="tw-block-label" id="tw-sites-label">
          Anywhere else
        </h2>
        <p className="tw-note">The wallet lens is off until you turn it on, one site at a time.</p>

        {here.state === "off" && here.host ? (
          <button type="button" className="tw-button-primary" onClick={onEnable}>
            <Icon icon={Plus} size={16} />
            Enable on {here.host}
          </button>
        ) : here.state === "none" ? null : (
          <p className="tw-here-on">
            <Icon icon={CircleCheck} size={16} />
            {here.state === "builtin" ? `${here.host} is built in.` : `${here.host} is enabled.`}
          </p>
        )}
        {error ? (
          <p className="tw-hint" role="status">
            {error}
          </p>
        ) : null}

        {sites && sites.length > 0 ? (
          <ul className="tw-site-list">
            {sites.map((site) => (
              <li key={site}>
                <span className="tw-site-host">{hostOf(site)}</span>
                <button type="button" className="tw-row-action" onClick={() => onDisable(site)} aria-label={`Turn Tripwire off on ${hostOf(site)}`}>
                  <Icon icon={Trash2} size={14} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tw-empty">No sites added yet.</p>
        )}
      </section>

      <section className="tw-block" aria-labelledby="tw-venues-label">
        <h2 className="tw-block-label" id="tw-venues-label">
          Built in
        </h2>
        <p className="tw-note">Tripwire checks these venues and X without being asked.</p>
        {VENUES.map((group) => (
          <div key={group.tier} className="tw-venue-group">
            <p className="tw-sub-label">{group.tier}</p>
            <ul className="tw-venue-grid">
              {group.ids.map((id) => (
                <li key={id} className="tw-venue-cell">
                  <BrandMark logo={VENUE_LOGOS[id]} size={16} />
                  <span className="tw-venue-name">{VENUE_LOGOS[id].name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
