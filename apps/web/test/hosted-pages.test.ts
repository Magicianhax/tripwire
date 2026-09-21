import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRESETS } from "@tripwire/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as historyGET } from "@/app/api/history/route";
import { GET as ledgerGET } from "@/app/api/ledger/route";
import { resetDb } from "@/lib/db";
import { mintInstall } from "@/lib/install";
import { recordCheck, setRules } from "@/lib/store";

const HOST = "tripwire.magician.wtf";
const get = (p: string, token?: string) =>
  new Request(`https://${HOST}${p}`, { headers: { host: HOST, "sec-fetch-site": "same-origin", ...(token ? { authorization: `Bearer ${token}` } : {}) } });

beforeEach(() => {
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-hosted-")), "t.db");
  process.env.TRIPWIRE_HOSTED = "1";
  process.env.TRIPWIRE_HOSTED_HOST = HOST;
  process.env.TRIPWIRE_IP_SALT = "salt";
  resetDb();
});
afterEach(() => {
  resetDb();
  for (const k of ["TRIPWIRE_HOSTED", "TRIPWIRE_HOSTED_HOST", "TRIPWIRE_OWNER_TOKEN"]) delete process.env[k];
});

describe("hosted /api/history", () => {
  it("shows an install its own rows and nobody else's", async () => {
    const a = mintInstall("1.1.1.1");
    const b = mintInstall("2.2.2.2");
    setRules(a, { preset: "paranoid", rules: PRESETS.paranoid });
    recordCheck(a, "jupiter", { kind: "spot", chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112" }, "CLEAR", []);

    const mine = await (await historyGET(get("/api/history", a))).json();
    expect(mine.checks).toHaveLength(1);
    const theirs = await (await historyGET(get("/api/history", b))).json();
    expect(theirs.checks).toHaveLength(0);
    expect(theirs.currentRules.map((r: { id: string }) => r.id)).toEqual(PRESETS.balanced.map((r) => r.id));
  });

  it("refuses a request with no install", async () => {
    expect((await historyGET(get("/api/history"))).status).toBe(401);
  });
});

describe("hosted /api/ledger", () => {
  it("is closed to installs, and to everyone when no owner token is configured", async () => {
    const a = mintInstall("1.1.1.1");
    expect((await ledgerGET(get("/api/ledger", a))).status).toBe(403);
    expect((await ledgerGET(get("/api/ledger"))).status).toBe(403);
  });

  it("opens to the operator's token only", async () => {
    process.env.TRIPWIRE_OWNER_TOKEN = "operator-secret";
    expect((await ledgerGET(get("/api/ledger", "operator-secre"))).status).toBe(403);
    const res = await ledgerGET(get("/api/ledger", "operator-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("totalCalls");
  });
});
