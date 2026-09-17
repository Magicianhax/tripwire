import { getRules } from "@/lib/store";
import { RulesEditor } from "./RulesEditor";

export const dynamic = "force-dynamic";

export default function RulesPage() {
  const state = getRules();
  return <RulesEditor initial={state} />;
}
