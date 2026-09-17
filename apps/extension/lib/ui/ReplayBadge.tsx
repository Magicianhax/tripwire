import { History } from "lucide-react";
import { Icon } from "./icons";

/** "Replay" tag: the backend is serving recorded fixtures, not live Nansen data. A quiet
 * outlined pill, never an alert. */
export function ReplayBadge({ replay }: { replay?: boolean }) {
  if (!replay) return null;
  return (
    <span className="tw-replay-badge" title="Replay mode: recorded Nansen data, not live">
      <Icon icon={History} size={12} />
      Replay
    </span>
  );
}
