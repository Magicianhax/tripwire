import { useState } from "react";
import { browser } from "wxt/browser";
import { chainLogo, venueLogo, type BrandLogo } from "@tripwire/core";

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

/** The token's logo from Nansen token information, else a monogram tile. The one remote image
 * Tripwire renders, and only inside the evidence card: no referrer, and any load failure falls
 * back to the monogram. */
export function TokenLogo({ url, symbol, size = 28 }: { url?: string | null; symbol: string; size?: 24 | 28 }) {
  const [failed, setFailed] = useState(false);
  if (url && /^https:\/\//.test(url) && !failed) {
    return <img className="tw-token-logo" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" decoding="async" draggable={false} onError={() => setFailed(true)} />;
  }
  return (
    <span className="tw-token-logo tw-monogram" aria-hidden="true" style={{ width: size, height: size }}>
      {monogram(symbol)}
    </span>
  );
}
