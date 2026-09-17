import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { chainLogo, venueLogo, type BrandLogo } from "@tripwire/core";
import { tokenLogoDataUrl } from "../token-logo";

/** A file bundled under the extension's public/ dir, as a chrome-extension:// URL. Brand marks
 * are never fetched from their owners' sites at runtime. Outside an extension context (unit
 * tests) the bare path is returned. */
export function assetUrl(file: string): string {
  try {
    return browser.runtime.getURL(`/${file}` as "/");
  } catch {
    return `/${file}`;
  }
}

type Size = 14 | 16 | 20 | 24 | 28;

/** A bundled brand mark. `alt` is empty when the brand is already named in adjacent text. */
export function BrandMark({ logo, size = 16, labelled = false, className }: { logo: BrandLogo; size?: Size; labelled?: boolean; className?: string }) {
  return (
    <img
      className={className ? `tw-logo ${className}` : "tw-logo"}
      src={assetUrl(logo.file)}
      alt={labelled ? logo.name : ""}
      width={size}
      height={size}
      decoding="async"
      draggable={false}
    />
  );
}

export function VenueLogo({ venue, size = 16, labelled = false }: { venue?: string | null; size?: Size; labelled?: boolean }) {
  const logo = venue ? venueLogo(venue) : null;
  return logo ? <BrandMark logo={logo} size={size} labelled={labelled} className="tw-logo-venue" /> : null;
}

export function ChainLogo({ chain, size = 16, labelled = true }: { chain?: string | null; size?: Size; labelled?: boolean }) {
  const logo = chain ? chainLogo(chain) : null;
  return logo ? <BrandMark logo={logo} size={size} labelled={labelled} className="tw-logo-chain" /> : null;
}

/** First letters of a symbol or name for the monogram tile: "$WIF" -> "WI", "EKpQ…zcjm" -> "EK". */
export function monogram(text: string): string {
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

/**
 * The token's mark: its real picture when the local backend can serve it, a monogram otherwise.
 *
 * Nansen's `logo` is a third-party CDN URL (CoinGecko's, today). Requesting it from the host
 * page would tell that CDN which token this user is looking at, on every card — so Tripwire
 * doesn't. `GET /api/token-logo` on the local backend fetches those bytes instead, from a URL
 * Nansen already gave it, and the background hands them here as a data URL (see
 * lib/token-logo.ts for why it cannot be a plain `src`). The host page requests nothing.
 */
export function TokenLogo({
  symbol,
  size = 28,
  chain,
  tokenAddress,
}: {
  url?: string | null;
  symbol: string;
  size?: 20 | 24 | 28;
  chain?: string | null;
  tokenAddress?: string | null;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    void tokenLogoDataUrl(chain, tokenAddress).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [chain, tokenAddress]);

  // The monogram is what shows while the bytes are on their way, and what stays if they never
  // arrive: the header never flashes a broken image.
  if (!dataUrl) {
    return (
      <span className="tw-token-logo tw-monogram" aria-hidden="true" style={{ width: size, height: size }}>
        {monogram(symbol)}
      </span>
    );
  }
  return <img className="tw-token-logo tw-token-image" src={dataUrl} alt="" width={size} height={size} decoding="async" draggable={false} />;
}
