import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Globe, Plus, Trash2, Wallet } from "lucide-react";
import { nansenWalletUrl } from "@tripwire/core";
import { Icon } from "../../lib/ui/icons";
import { isBuiltinOrigin, isEnableableUrl, listEnabledSites, removeSite, requestSite } from "../../lib/permissions";
import { forgetWallets, readRecent, type RecentWallet } from "../../lib/recent-wallets";

/** Where the popup's tab is, as an origin, when Tripwire could be enabled there. */
async function currentOrigin(): Promise<string | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!isEnableableUrl(tab?.url)) return null;
    return new URL(tab!.url!).origin;
  } catch {
    return null;
  }
}

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

/**
 * Per-site consent and the recent-wallet list.
 *
 * Tripwire ships with permission for X and its venues and nothing else. Everywhere else the
 * wallet lens is off until the user turns it on here, one site at a time, through Chrome's own
 * prompt — and it can be turned back off from the same list.
 */
export function WalletLensSection() {
  const [sites, setSites] = useState<string[] | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentWallet[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setSites(await listEnabledSites());
    setRecent(await readRecent());
  }, []);

  useEffect(() => {
    void refresh();
    void currentOrigin().then(setOrigin);
  }, [refresh]);

  const builtin = origin !== null && isBuiltinOrigin(origin);
  const alreadyOn = origin !== null && (builtin || (sites ?? []).includes(origin));

  async function enableHere() {
    if (!origin) return;
    setError("");
    const granted = await requestSite(origin).catch(() => false);
    if (!granted) {
      setError(`${hostOf(origin)} wasn't enabled: the browser declined the permission.`);
      return;
    }
    await refresh();
  }

  async function disable(site: string) {
    setError("");
    if (!(await removeSite(site).catch(() => false))) {
      setError(`${hostOf(site)} couldn't be turned off. Remove it from the browser's extension settings.`);
      return;
    }
    await refresh();
  }

  return (
    <section className="tw-lens" aria-labelledby="tw-lens-label">
      <h2 className="tw-field-label" id="tw-lens-label">
        Wallet lens
      </h2>
      <p className="tw-lens-note">
        Wherever an address or ENS name appears, a Nansen mark opens what Tripwire knows about that wallet. It runs on X and the venues already. Add any
        other site here.
      </p>

      {origin === null ? null : alreadyOn ? (
        <p className="tw-lens-on">
          <Icon icon={Globe} size={16} />
          {builtin ? `${hostOf(origin)} is built in.` : `${hostOf(origin)} is enabled.`}
        </p>
      ) : (
        <button type="button" className="tw-button-primary" onClick={() => void enableHere()}>
          <Icon icon={Plus} size={16} />
          Enable Tripwire on {hostOf(origin)}
        </button>
      )}
      {error ? (
        <p className="tw-field-hint" role="status">
          {error}
        </p>
      ) : null}

      {sites && sites.length > 0 ? (
        <>
          <p className="tw-venue-tier">Enabled sites</p>
          <ul className="tw-site-list">
            {sites.map((site) => (
              <li key={site}>
                <span className="tw-site-host">{hostOf(site)}</span>
                <button type="button" className="tw-button-quiet" onClick={() => void disable(site)} aria-label={`Turn Tripwire off on ${hostOf(site)}`}>
                  <Icon icon={Trash2} size={14} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {recent.length > 0 ? (
        <>
          <p className="tw-venue-tier">
            Recent wallets
            <button
              type="button"
              className="tw-button-quiet tw-clear-recent"
              onClick={() => void forgetWallets().then(refresh)}
            >
              Clear
            </button>
          </p>
          <ul className="tw-recent-list">
            {recent.map((r) => {
              const href = r.address ? nansenWalletUrl(r.address, r.chain) : null;
              const name = r.label ?? r.query;
              return (
                <li key={r.query}>
                  <Icon icon={Wallet} size={14} />
                  {href ? (
                    <a className="tw-recent-name" href={href} target="_blank" rel="noopener noreferrer" title={r.address ?? undefined}>
                      {name}
                    </a>
                  ) : (
                    <span className="tw-recent-name">{name}</span>
                  )}
                  {r.chain ? <span className="tw-meta">{r.chain}</span> : null}
                </li>
              );
            })}
          </ul>
          <p className="tw-lens-note">
            Addresses you inspect go to your own local backend, then to Nansen, Hyperliquid and Polymarket. This list lives in this browser profile and
            nowhere else; each name opens that wallet in Nansen Profiler.
          </p>
        </>
      ) : null}
    </section>
  );
}
