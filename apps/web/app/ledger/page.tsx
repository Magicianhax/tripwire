import { isHosted } from "@/lib/install";
import { isReplay } from "@/lib/nansen/client";
import { ledgerSummary } from "@/lib/store";
import { HostedLedger } from "./HostedLedger";
import { LedgerView } from "./LedgerView";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  // Hosted, the ledger is everyone's calls on our key: the operator's to see, nobody else's.
  if (isHosted()) return <HostedLedger />;
  return <LedgerView s={ledgerSummary()} replay={isReplay()} />;
}
