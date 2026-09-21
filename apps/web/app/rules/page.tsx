import { SELF_HOST_INSTALL } from "@/lib/db";
import { getRules } from "@/lib/store";
import { RulesEditor } from "./RulesEditor";

export const dynamic = "force-dynamic";

export default function RulesPage() {
  const state = getRules(SELF_HOST_INSTALL);
  return <RulesEditor initial={state} />;
}
