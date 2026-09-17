import { ReplayBadge } from "./ReplayBadge";

export type StripProps = {
  /** LOADING is the neutral "Checking…" state between a target change and its verdict. */
  verdict: "CAUTION" | "UNCHECKED" | "CLEAR" | "LOADING";
  text: string;
  /** Secondary mono clause for the top hit's rule, e.g. "rule: > $100K". */
  rule?: string | null;
  onDetails?: () => void;
  replay?: boolean;
};

/** 32px line above the anchor for CAUTION, UNCHECKED and CLEAR. CAUTION: ink with a full
 * 1.5px yellow border and yellow text. UNCHECKED and LOADING: grey. CLEAR: quiet, green text. */
export function Strip({ verdict, text, rule, onDetails, replay }: StripProps) {
  return (
    <div className="tw-strip" data-verdict={verdict} role="status">
      <span className="tw-strip-text">
        <span className="tw-strip-finding">{text}</span>
        {rule ? <span className="tw-strip-rule tw-mono">{rule}</span> : null}
      </span>
      <ReplayBadge replay={replay} />
      {onDetails ? (
        <button type="button" className="tw-strip-details" onClick={onDetails}>
          Details
        </button>
      ) : null}
    </div>
  );
}
