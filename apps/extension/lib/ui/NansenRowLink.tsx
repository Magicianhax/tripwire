import { ExternalLink } from "lucide-react";
import { Icon } from "./icons";
import { Tooltip } from "./Tooltip";

/** Row-specific navigation, separate from copy and card-opening actions. */
export function NansenRowLink({ href, subject }: { href: string | null; subject: string }) {
  if (!href) return null;
  return (
    <Tooltip label="View on Nansen" placement="bottom">
      {() => (
        <a className="tw-addr-copy" href={href} aria-label={`View ${subject} on Nansen`} target="_blank" rel="noopener noreferrer">
          <Icon icon={ExternalLink} size={14} />
        </a>
      )}
    </Tooltip>
  );
}
