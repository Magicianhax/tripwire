import { ReplayBadge } from "./ReplayBadge";

export type StripProps = {
  /** LOADING is the neutral "Checking…" state between a target change and its verdict. */
  verdict: "CAUTION" | "UNCHECKED" | "CLEAR" | "LOADING";
  text: string;
  onDetails?: () => void;
  replay?: boolean;
};

/** 32px line above the anchor for CAUTION, UNCHECKED and CLEAR. CAUTION: ink with a 4px
 * yellow left border and yellow text. UNCHECKED and LOADING: grey. CLEAR: quiet, green text. */
export function Strip({ verdict, text, onDetails, replay }: StripProps) {
  return (
    <div className="tw-strip" data-verdict={verdict} role="status">
      <span>{text}</span>
      <ReplayBadge replay={replay} />
      {onDetails ? (
        <button type="button" className="tw-strip-details" onClick={onDetails}>
          Details
        </button>
      ) : null}
    </div>
  );
}
