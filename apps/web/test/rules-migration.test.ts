import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS, GuardBodySchema, PostIntelRequestSchema, type Rule } from "@tripwire/core";
import { getDb, resetDb } from "@/lib/db";
import { _resetRuleMigrationWarning, dropUnknownSignalRules, getRules, setRules } from "@/lib/store";

beforeAll(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-migration-")), "t.db");
  resetDb();
});
afterAll(() => resetDb());
beforeEach(() => {
  getDb().prepare("DELETE FROM settings WHERE key = 'rules'").run();
  _resetRuleMigrationWarning();
});

/** The public dogwifhat mint, as used by every other replay test. */
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

/** A rule set saved before the 2026-09-17 recalibration, thresholds in USD and percent-of-buying. */
const LEGACY = [
  { id: "spot-exit", kind: "spot", signal: "exit_pressure", op: "<", threshold: -100_000, action: "block", enabled: true, text: "smart money dump more than ${n}" },
  { id: "spot-fresh", kind: "spot", signal: "fresh_buy_share", op: ">", threshold: 70, action: "warn", enabled: true, text: "fresh wallets are more than {n}% of buying" },
  { id: "spot-sm24", kind: "spot", signal: "sm_netflow_24h", op: "<", threshold: -50_000, action: "warn", enabled: true, text: "Smart Money 24h net outflow exceeds ${n}" },
  { id: "perp-opp", kind: "perp", signal: "sm_opposite_side_pct", op: ">", threshold: 70, action: "block", enabled: true, text: "more than {n}% of Smart Money is on the other side" },
];

describe("stored rules that name a removed signal", () => {
  it("dropUnknownSignalRules keeps what this build understands and counts the rest", () => {
    const { rules, dropped } = dropUnknownSignalRules(LEGACY);
    expect(rules.map((r) => r.id)).toEqual(["perp-opp"]);
    expect(dropped).toBe(3);
  });

  it("a rule set that still has something usable loads, minus the dead rules, and logs once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rules', ?)").run(JSON.stringify({ preset: "custom", rules: LEGACY }));
      const first = getRules();
      expect(first.preset).toBe("custom");
      expect(first.rules.map((r) => r.signal)).toEqual(["sm_opposite_side_pct"]);
      getRules();
      getRules();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/dropped 3 saved rule/);
    } finally {
      warn.mockRestore();
    }
  });

  it("a rule set where nothing survives falls back to the balanced preset, not to no rules at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      getDb()
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rules', ?)")
        .run(JSON.stringify({ preset: "custom", rules: LEGACY.filter((r) => r.kind === "spot") }));
      const state = getRules();
      expect(state.preset).toBe("balanced");
      expect(state.rules).toEqual(PRESETS.balanced);
    } finally {
      warn.mockRestore();
    }
  });

  it("a rule set saved by this build round-trips untouched", () => {
    setRules({ preset: "paranoid", rules: PRESETS.paranoid });
    expect(getRules().rules.map((r: Rule) => r.id)).toEqual(PRESETS.paranoid.map((r) => r.id));
  });

  it("unreadable JSON still falls back rather than throwing", () => {
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rules', ?)").run("{not json");
    expect(getRules().preset).toBe("balanced");
  });
});

describe("the view timeframe is validated, and is optional", () => {
  const target = { kind: "spot", chain: "solana", tokenAddress: WIF };

  it("accepts every offered window on both routes", () => {
    for (const timeframe of ["5m", "1h", "6h", "1d", "7d"]) {
      expect(PostIntelRequestSchema.safeParse({ target, mode: "panel", timeframe }).success, timeframe).toBe(true);
      expect(GuardBodySchema.safeParse({ target, venue: "jupiter", mode: "panel", timeframe }).success, timeframe).toBe(true);
    }
  });

  it("rejects a window that is not on the control", () => {
    for (const timeframe of ["12h", "30d", "1m", "", "1d; DROP TABLE", 7]) {
      expect(PostIntelRequestSchema.safeParse({ target, mode: "panel", timeframe }).success, String(timeframe)).toBe(false);
      expect(GuardBodySchema.safeParse({ target, venue: "jupiter", mode: "panel", timeframe }).success, String(timeframe)).toBe(false);
    }
  });

  it("is optional: an older extension sends no timeframe at all", () => {
    expect(PostIntelRequestSchema.safeParse({ target }).success).toBe(true);
    expect(GuardBodySchema.safeParse({ target, venue: "jupiter" }).success).toBe(true);
  });
});
