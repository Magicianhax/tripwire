"use client";

import { HostedGate } from "../_components/HostedGate";
import { HistoryView, type HistoryData } from "./HistoryView";

export function HostedHistory() {
  return (
    <HostedGate<HistoryData> tokenName="t" path="/api/history" noToken="Open History from the Tripwire extension's popup to see your own checks and overrides.">
      {(data) => <HistoryView {...data} />}
    </HostedGate>
  );
}
