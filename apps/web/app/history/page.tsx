import { SELF_HOST_INSTALL } from "@/lib/db";
import { isHosted } from "@/lib/install";
import { getRules, recentChecks, recentOverrides, recentSettingsChanges } from "@/lib/store";
import { HostedHistory } from "./HostedHistory";
import { HistoryView } from "./HistoryView";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  if (isHosted()) return <HostedHistory />;
  return (
    <HistoryView
      overrides={recentOverrides(SELF_HOST_INSTALL, 50)}
      changes={recentSettingsChanges(SELF_HOST_INSTALL, 50)}
      checks={recentChecks(SELF_HOST_INSTALL, 50)}
      currentRules={getRules(SELF_HOST_INSTALL).rules}
    />
  );
}
