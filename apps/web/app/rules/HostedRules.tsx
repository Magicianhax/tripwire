"use client";

import type { RulesState } from "@/lib/store";
import { HostedGate } from "../_components/HostedGate";
import { RulesEditor } from "./RulesEditor";

export function HostedRules() {
  return (
    <HostedGate<RulesState> tokenName="t" path="/api/rules" noToken="Open Rules from the Tripwire extension's popup to edit your own rules.">
      {(data, token) => <RulesEditor initial={data} authToken={token} />}
    </HostedGate>
  );
}
