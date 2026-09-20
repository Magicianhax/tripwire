import { chainLogo, venueLogo, type BrandLogo } from "@tripwire/core";

/** A bundled brand mark from /logos (apps/extension/public/logos is the source; provenance in
 * SOURCES.md). Decorative when the brand is named in adjacent text. */
export function BrandMark({ logo, size = 16, labelled = false }: { logo: BrandLogo; size?: 14 | 16 | 20 | 28; labelled?: boolean }) {
  // Tiny bundled marks: a plain img, no image optimization pipeline.
  return <img className="tw-logo" src={`/${logo.file}`} alt={labelled ? logo.name : ""} width={size} height={size} decoding="async" />;
}

/** A logged venue id as its logo and name ("x" is a post on X, which has no bundled mark). */
export function Venue({ id }: { id: string }) {
  const logo = venueLogo(id);
  if (!logo) return <span className="tw-venue">{id === "x" ? "X post" : id}</span>;
  return (
    <span className="tw-venue">
      <BrandMark logo={logo} />
      {logo.name}
    </span>
  );
}

export function ChainMark({ chain }: { chain: string }) {
  const logo = chainLogo(chain);
  return logo ? <BrandMark logo={logo} size={14} /> : null;
}
