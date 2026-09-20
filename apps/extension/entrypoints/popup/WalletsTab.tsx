import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { nansenWalletUrl } from "@tripwire/core";
import { Icon } from "../../lib/ui/icons";
import { ChainLogo } from "../../lib/ui/Logo";
import { shortAddr, timeAgo } from "../../lib/ui/format";
import type { RecentWallet } from "../../lib/recent-wallets";

/** An address or a hash sets in the mono face; a name somebody typed does not. */
const looksLikeAddress = (text: string) => /^(0x[0-9a-fA-F]{6,}|[1-9A-HJ-NP-Za-km-z]{32,})$/.test(text);

/** What the row says, and the full string it keeps in `title`. A 42-character address does not
 * fit a 420px row, and an address clipped mid-hash by the ellipsis reads as a broken value
 * rather than an abbreviated one, so it is shortened at both ends instead. */
function identity(entry: RecentWallet): { text: string; full: string; mono: boolean } {
  const name = entry.label ?? entry.query;
  const full = entry.address ?? name;
  return looksLikeAddress(name) ? { text: shortAddr(name), full, mono: true } : { text: name, full, mono: false };
}

export function WalletsTab({ recent, onClear }: { recent: RecentWallet[]; onClear: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(entry: RecentWallet) {
    const text = entry.address ?? entry.query;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(entry.query);
      setTimeout(() => setCopied((c) => (c === entry.query ? null : c)), 1400);
    } catch {
      // A refused clipboard is not worth an error state: the address is on screen either way.
    }
  }

  return (
    <section className="tw-block" aria-labelledby="tw-recent-label">
      <p className="tw-note">A Nansen mark appears on every address a page shows, and opens what Nansen knows about that wallet.</p>
      <div className="tw-block-head">
        <h2 className="tw-block-label" id="tw-recent-label">
          Recent wallets
        </h2>
        {recent.length > 0 ? (
          <button type="button" className="tw-row-action" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {recent.length === 0 ? (
        <p className="tw-empty">Wallets you open will be listed here.</p>
      ) : (
        <ul className="tw-recent-scroll">
          {recent.map((entry) => {
            const { text, full, mono } = identity(entry);
            const href = entry.address ? nansenWalletUrl(entry.address, entry.chain) : null;
            const isCopied = copied === entry.query;
            return (
              <li key={entry.query} className="tw-recent-row">
                {href ? (
                  <a className="tw-recent-id" data-mono={mono} href={href} target="_blank" rel="noopener noreferrer" title={full}>
                    {text}
                  </a>
                ) : (
                  <span className="tw-recent-id" data-mono={mono} title={full}>
                    {text}
                  </span>
                )}
                {entry.chain ? (
                  <span className="tw-chain-chip">
                    <ChainLogo chain={entry.chain} size={14} labelled={false} />
                    {entry.chain}
                  </span>
                ) : null}
                <span className="tw-recent-when">{timeAgo(new Date(entry.seenAt).toISOString())}</span>
                <button
                  type="button"
                  className="tw-icon-action"
                  onClick={() => void copy(entry)}
                  aria-label={isCopied ? `Copied ${text}` : `Copy ${text}`}
                  data-copied={isCopied || undefined}
                >
                  <Icon icon={isCopied ? Check : Copy} size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
