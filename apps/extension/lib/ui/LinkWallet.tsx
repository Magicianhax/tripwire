import { useState } from "react";
import { venueLogo, WALLET_VENUES, type WalletVenue } from "@tripwire/core";
import { ExternalLink, Link2, Link2Off } from "lucide-react";
import type { BadgeLink } from "../api-types";
import { shortAddr } from "./format";
import { Icon } from "./icons";
import { BrandMark } from "./Logo";
import { parseLinkAddress } from "../x/link-form";

const VENUE_NAME: Record<WalletVenue, string> = { hyperliquid: "Hyperliquid", polymarket: "Polymarket" };

/** How this handle's wallet on a venue became known, and how to undo it: a user link can be
 * unlinked, a curated one links out to the post or profile where the owner stated the address. */
export function LinkStatus({ venue, link, onUnlink }: { venue: WalletVenue; link: BadgeLink; onUnlink: (venue: WalletVenue) => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <p className="tw-link-status">
      <span className="tw-mono">{shortAddr(link.address)}</span>
      {link.source === "user" ? (
        <>
          <span className="tw-meta">Linked by you</span>
          <button type="button" className="tw-link-action" onClick={() => void onUnlink(venue).then(setError)}>
            <Icon icon={Link2Off} size={14} />
            Unlink
          </button>
        </>
      ) : (
        <a className="tw-link-action tw-link-source" href={link.sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer">
          <Icon icon={ExternalLink} size={14} />
          Source
        </a>
      )}
      {error ? <span className="tw-link-error">{error}</span> : null}
    </p>
  );
}

/**
 * "Link wallet": the inline form that ties an X handle to a Hyperliquid account or Polymarket
 * proxy wallet. The link is stored by the local backend only (PUT /api/links) and is the only way
 * a venue badge appears for an account Tripwire has no source-verified entry for.
 */
export function LinkWallet({
  handle,
  links,
  onSave,
  onUnlink,
}: {
  handle: string;
  links: Partial<Record<WalletVenue, BadgeLink>>;
  onSave: (venue: WalletVenue, address: string) => Promise<string | null>;
  onUnlink: (venue: WalletVenue) => Promise<string | null>;
}) {
  const open = WALLET_VENUES.filter((v) => !links[v]);
  const [form, setForm] = useState<WalletVenue | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const venue = form && open.includes(form) ? form : open[0];

  if (open.length === 0) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!venue || saving) return;
    const parsed = parseLinkAddress(venue, address);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    const failure = await onSave(venue, parsed.address);
    setSaving(false);
    setError(failure);
    if (!failure) {
      setAddress("");
      setForm(null);
    }
  }

  if (form === null) {
    return (
      <div className="tw-link-wallet">
        {Object.keys(links).length === 0 ? <p className="tw-empty">Link a Hyperliquid or Polymarket wallet to see positions.</p> : null}
        <button type="button" className="tw-link-btn" onClick={() => setForm(open[0] ?? null)}>
          <Icon icon={Link2} size={14} />
          Link wallet
        </button>
      </div>
    );
  }

  return (
    <form className="tw-link-wallet" onSubmit={submit}>
      <fieldset className="tw-link-venues">
        <legend className="tw-sr-only">Venue</legend>
        {open.map((v) => (
          <label key={v} className="tw-link-venue" data-on={v === venue ? "" : undefined}>
            <input
              type="radio"
              name={`tw-venue-${handle}`}
              value={v}
              checked={v === venue}
              onChange={() => setForm(v)}
              onClick={() => setForm(v)}
              className="tw-sr-only"
            />
            <BrandMark logo={venueLogo(v)!} size={16} />
            {VENUE_NAME[v]}
          </label>
        ))}
      </fieldset>
      <label className="tw-link-field">
        <span className="tw-link-label">Wallet address</span>
        <input
          className="tw-link-input tw-mono"
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="0x…"
          value={address}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `tw-link-error-${handle}` : undefined}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error ? (
        <p className="tw-link-error" id={`tw-link-error-${handle}`} role="alert">
          {error}
        </p>
      ) : null}
      <div className="tw-link-buttons">
        <button type="submit" className="tw-link-save" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="tw-link-cancel"
          onClick={() => {
            setForm(null);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
