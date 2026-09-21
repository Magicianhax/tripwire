import { SELF_HOST_INSTALL } from "@/lib/db";
import { isHosted } from "@/lib/install";
import { getRules } from "@/lib/store";
import { HostedRules } from "./HostedRules";
import { RulesEditor } from "./RulesEditor";

export const dynamic = "force-dynamic";

export default function RulesPage() {
  if (isHosted()) return <HostedRules />;
  return <RulesEditor initial={getRules(SELF_HOST_INSTALL)} />;
}
