import { describe, expect, it } from "vitest";
import { capWalletMarkers } from "../lib/wallet/marker-budget";

const marker = (query: string, presentation?: "profile") => ({ ref: {kind:"evm" as const,query}, presentation });

describe("wallet marker budget", () => {
  it("keeps a leaderboard profile instead of a later generic duplicate", () => {
    const profile = marker("0xabc", "profile");
    const later = marker("0xabc");
    const result = capWalletMarkers([profile, later]);
    expect(result.keep).toEqual([profile]);
    expect(result.drop).toEqual([later]);
  });

  it("retains newest-first deduplication and recycling for ordinary wallet markers", () => {
    const oldest = marker("0xabc");
    const other = marker("0xdef");
    const newest = marker("0xABC");
    expect(capWalletMarkers([oldest, other, newest]).keep).toEqual([other, newest]);
    expect(capWalletMarkers([oldest, other, newest], 1).keep).toEqual([newest]);
  });

  it("does not exceed the budget even when every marker is a profile", () => {
    const markers = Array.from({length:50}, (_, i) => marker(String(i), "profile"));
    const result = capWalletMarkers(markers);
    expect(result.keep).toHaveLength(40);
    expect(result.drop).toHaveLength(10);
    expect(result.keep).toEqual(markers.slice(10));
  });
});
