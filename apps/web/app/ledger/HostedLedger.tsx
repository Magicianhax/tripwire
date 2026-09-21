"use client";

import type { LedgerSummary } from "@/lib/store";
import { HostedGate } from "../_components/HostedGate";
import { LedgerView } from "./LedgerView";

export function HostedLedger() {
  return (
    <HostedGate<LedgerSummary> tokenName="owner" path="/api/ledger" noToken="The ledger is only available to the operator.">
      {(data) => <LedgerView s={data} replay={false} />}
    </HostedGate>
  );
}
