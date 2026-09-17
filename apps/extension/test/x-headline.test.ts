import { describe, expect, it } from "vitest";
import type { PostIntelResponse } from "../lib/api-types";
import { chipErrorHeadline, chipHeadline } from "../lib/x/headline";

const base = (o: Partial<PostIntelResponse>): PostIntelResponse =>
  ({ verdict: "CLEAR", headline: null, hits: [], unavailable: [], signals: [], panel: { errors: [] }, rulesPreset: "balanced", ...o }) as PostIntelResponse;

describe("chip headline", () => {
  it("shows the credit-cap reason for an UNCHECKED result", () => {
    expect(chipHeadline(base({ verdict: "UNCHECKED", headline: "Nansen credit cap reached" }))).toBe("Nansen credit cap reached");
  });

  it("a hit label wins; otherwise the exit_pressure label", () => {
    const hit = { ruleId: "r", action: "warn" as const, text: "t", signalId: "exit_pressure" as const, label: "Dumping", value: -1, evidence: [] };
    expect(chipHeadline(base({ verdict: "CAUTION", hits: [hit] }))).toBe("Dumping");
    const signal = { id: "exit_pressure" as const, kind: "spot" as const, severity: "info" as const, value: 5, label: "Labeled wallets net +$5", evidence: [] };
    expect(chipHeadline(base({ signals: [signal] }))).toBe("Labeled wallets net +$5");
  });

  it("maps a 429 to the credit cap", () => {
    expect(chipErrorHeadline(429, "budget")).toBe("Nansen credit cap reached");
    expect(chipErrorHeadline(0, "")).toBe("Tripwire backend offline");
  });
});
