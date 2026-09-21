import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRESETS } from "@tripwire/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb, SELF_HOST_INSTALL } from "@/lib/db";
import { getRules, setRules } from "@/lib/store";

function storeRaw(value: string) {
  getDb().prepare("INSERT OR REPLACE INTO settings (install, key, value) VALUES ('self', 'rules', ?)").run(value);
}

beforeEach(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-store-")), "t.db");
  resetDb();
});
afterEach(() => resetDb());

describe("getRules validation", () => {
  it("round-trips a valid stored state", () => {
    setRules(SELF_HOST_INSTALL, { preset: "paranoid", rules: PRESETS.paranoid });
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "paranoid", rules: PRESETS.paranoid });
  });

  it("defaults to balanced when nothing is stored", () => {
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "balanced", rules: PRESETS.balanced });
  });

  it("falls back to balanced on corrupt JSON", () => {
    storeRaw("{not json");
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "balanced", rules: PRESETS.balanced });
  });

  it("falls back to balanced when a stored rule fails the RuleSchema", () => {
    storeRaw(JSON.stringify({ preset: "custom", rules: [{ ...PRESETS.balanced[0], op: "==", threshold: "lots" }] }));
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "balanced", rules: PRESETS.balanced });
    storeRaw(JSON.stringify({ preset: "ultra", rules: PRESETS.balanced }));
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "balanced", rules: PRESETS.balanced });
    storeRaw(JSON.stringify({ rules: "nope" }));
    expect(getRules(SELF_HOST_INSTALL)).toEqual({ preset: "balanced", rules: PRESETS.balanced });
  });
});
