import { ChevronRight, LoaderCircle } from "lucide-react";
import { Icon } from "./icons";
import { VenueLogo } from "./Logo";
import { RuleClause } from "./panel-parts";
import { Plate } from "./Plate";
import { ReplayBadge } from "./ReplayBadge";

export type StripProps = {
  /** LOADING is the neutral "Checking…" state between a target change and its verdict. */
  verdict: "CAUTION" | "UNCHECKED" | "CLEAR" | "LOADING";
  text: string;
  /** Secondary clause for the top hit's rule, e.g. "rule: > $100K". */
  rule?: string | null;
  /** Opens the evidence card, anchored to the Details button it receives. */
  onDetails?: (trigger: HTMLElement) => void;
  replay?: boolean;
  /** Adapter id: the venue's logo leads the strip. */
  venue?: string;
};

/** 32px pill above the anchor for CAUTION, UNCHECKED and CLEAR: the venue logo, the verdict
 * pill, the finding, its rule clause, and Details. LOADING shows a spinner and "Checking…". */
export function Strip({ verdict, text, rule, onDetails, replay, venue }: StripProps) {
  return (
    <div className="tw-strip" data-verdict={verdict} role="status">
      <VenueLogo venue={venue} size={16} />
      {verdict === "LOADING" ? <Icon icon={LoaderCircle} size={16} className="tw-spin tw-spinner" /> : <Plate verdict={verdict} className="tw-strip-plate" />}
      <span className="tw-strip-text">
        <span className="tw-strip-finding">{text}</span>
        {rule ? <RuleClause className="tw-strip-rule" text={rule} /> : null}
      </span>
      <ReplayBadge replay={replay} />
      {onDetails ? (
        <button type="button" className="tw-strip-details" aria-haspopup="dialog" onClick={(e) => onDetails(e.currentTarget)}>
          Details
          <Icon icon={ChevronRight} size={14} />
        </button>
      ) : null}
    </div>
  );
}
