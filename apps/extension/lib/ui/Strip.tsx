import { Plate } from "./Plate";
import { ReplayBadge } from "./ReplayBadge";

export type StripProps = {
  /** LOADING is the neutral "Checking…" state between a target change and its verdict. */
  verdict: "CAUTION" | "UNCHECKED" | "CLEAR" | "LOADING";
  text: string;
  /** Secondary mono clause for the top hit's rule, e.g. "rule: > $100K". */
  rule?: string | null;
  /** Opens the evidence card, anchored to the Details button it receives. */
  onDetails?: (trigger: HTMLElement) => void;
  replay?: boolean;
};

/** 32px annunciator line above the anchor for CAUTION, UNCHECKED and CLEAR: the verdict plate,
 * the finding, its rule clause, and Details. LOADING shows an unlit lamp and "Checking…". */
export function Strip({ verdict, text, rule, onDetails, replay }: StripProps) {
  return (
    <div className="tw-strip" data-verdict={verdict} role="status">
      {verdict === "LOADING" ? <i className="tw-lamp" aria-hidden="true" /> : <Plate verdict={verdict} className="tw-strip-plate" />}
      <span className="tw-strip-text">
        <span className="tw-strip-finding">{text}</span>
        {rule ? <span className="tw-strip-rule tw-mono">{rule}</span> : null}
      </span>
      <ReplayBadge replay={replay} />
      {onDetails ? (
        <button type="button" className="tw-strip-details" aria-haspopup="dialog" onClick={(e) => onDetails(e.currentTarget)}>
          Details
        </button>
      ) : null}
    </div>
  );
}
