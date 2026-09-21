import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PRESETS } from "@tripwire/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb, SELF_HOST_INSTALL } from "@/lib/db";
import { mintInstall, MintRefused, resolveInstall } from "@/lib/install";
import { deleteUserLink, listLinks, upsertUserLink } from "@/lib/links";
import { getRules, recentChecks, recordCheck, setRules } from "@/lib/store";

const ADDR = "0x" + "ab".repeat(20);
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-install-"));
  process.env.TRIPWIRE_DB = path.join(dir, "t.db");
  delete process.env.TRIPWIRE_HOSTED;
  process.env.TRIPWIRE_IP_SALT = "test-salt";
  resetDb();
});
afterEach(() => {
  resetDb();
  delete process.env.TRIPWIRE_HOSTED;
  delete process.env.TRIPWIRE_MINTS_PER_IP;
});

const bearer = (t: string) => new Headers({ authorization: `Bearer ${t}` });

describe("migrating a pre-hosting database", () => {
  it("keeps a self-hoster's rules and wallet links under the self-host install", () => {
    const legacy = new DatabaseSync(process.env.TRIPWIRE_DB!);
    legacy.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE wallet_links (handle TEXT NOT NULL, venue TEXT NOT NULL, address TEXT NOT NULL,
        source TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (handle, venue));
      CREATE TABLE checks (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, venue TEXT NOT NULL,
        target TEXT NOT NULL, verdict TEXT NOT NULL, signals TEXT NOT NULL);
    `);
    legacy.prepare("INSERT INTO settings (key, value) VALUES ('rules', ?)").run(JSON.stringify({ preset: "paranoid", rules: PRESETS.paranoid }));
    legacy.prepare("INSERT INTO wallet_links VALUES ('alice', 'hyperliquid', ?, 'user', 1)").run(ADDR);
    legacy.prepare("INSERT INTO checks (ts, venue, target, verdict, signals) VALUES (1, 'jupiter', '{}', 'CLEAR', '[]')").run();
    legacy.close();

    expect(getRules(SELF_HOST_INSTALL).preset).toBe("paranoid");
    expect(listLinks(SELF_HOST_INSTALL).map((l) => l.address)).toEqual([ADDR]);
    expect(recentChecks(SELF_HOST_INSTALL)).toHaveLength(1);
  });

  it("is idempotent across restarts", () => {
    setRules(SELF_HOST_INSTALL, { preset: "degen", rules: PRESETS.degen });
    resetDb();
    getDb();
    resetDb();
    expect(getRules(SELF_HOST_INSTALL).preset).toBe("degen");
  });
});

describe("installs are isolated from each other", () => {
  it("never shows one install's rules, history or wallet links to another", () => {
    setRules("a", { preset: "paranoid", rules: PRESETS.paranoid });
    upsertUserLink("a", { handle: "alice", venue: "hyperliquid", address: ADDR });
    recordCheck("a", "jupiter", { kind: "spot", chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112" }, "CLEAR", []);

    expect(getRules("b").preset).toBe("balanced");
    expect(listLinks("b")).toEqual([]);
    expect(recentChecks("b")).toEqual([]);
    expect(deleteUserLink("b", "alice", "hyperliquid")).toBe(false);
    expect(listLinks("a")).toHaveLength(1);
  });
});

describe("resolveInstall", () => {
  it("answers the self-host id without a token when not hosted", () => {
    expect(resolveInstall(new Headers())).toBe(SELF_HOST_INSTALL);
    expect(resolveInstall(bearer("anything"))).toBe(SELF_HOST_INSTALL);
  });

  it("hosted: accepts only minted tokens", () => {
    process.env.TRIPWIRE_HOSTED = "1";
    const token = mintInstall("1.2.3.4");
    expect(resolveInstall(bearer(token))).toBe(token);
    expect(resolveInstall(bearer("forged"))).toBeNull();
    expect(resolveInstall(new Headers())).toBeNull();
    // The self-host id is not a skeleton key on a hosted backend.
    expect(resolveInstall(bearer(SELF_HOST_INSTALL))).toBeNull();
  });
});

describe("mintInstall", () => {
  it("caps mints per address per day and never stores the address", () => {
    process.env.TRIPWIRE_HOSTED = "1";
    process.env.TRIPWIRE_MINTS_PER_IP = "2";
    resetDb();
    mintInstall("9.9.9.9");
    mintInstall("9.9.9.9");
    expect(() => mintInstall("9.9.9.9")).toThrow(MintRefused);
    expect(() => mintInstall("8.8.8.8")).not.toThrow();
    const raw = JSON.stringify(getDb().prepare("SELECT * FROM install_mints").all());
    expect(raw).not.toContain("9.9.9.9");
  });

  it("refuses to hash addresses with no salt on a hosted backend", () => {
    process.env.TRIPWIRE_HOSTED = "1";
    delete process.env.TRIPWIRE_IP_SALT;
    expect(() => mintInstall("1.1.1.1")).toThrow(/TRIPWIRE_IP_SALT/);
  });

  it("issues unguessable, distinct tokens", () => {
    const a = mintInstall(null);
    const b = mintInstall(null);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
