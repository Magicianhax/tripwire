export type StripProps = {
  verdict: "CAUTION" | "UNCHECKED" | "CLEAR";
  text: string;
  onDetails?: () => void;
};

/** 32px line above the anchor for CAUTION, UNCHECKED and CLEAR. CAUTION: ink with a 4px
 * yellow left border and yellow text. UNCHECKED: grey. CLEAR: quiet, green text. */
export function Strip({ verdict, text, onDetails }: StripProps) {
  return (
    <div className="tw-strip" data-verdict={verdict} role="status">
      <span>{text}</span>
      {onDetails ? (
        <button type="button" className="tw-strip-details" onClick={onDetails}>
          Details
        </button>
      ) : null}
    </div>
  );
}
