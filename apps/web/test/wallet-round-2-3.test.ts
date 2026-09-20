// Round 2.3 — wallet depth: the activity feed, the origin story and the counterparties.
// Brief: docs/IMPROVEMENT-PLAN.md §3, Round 2.3.
//
// Everything asserted here is pinned to the fixtures recorded on 2026-09-20 by
// scripts/record-wallet-relations-fixtures.mjs (8 credits), so a change to the mapper that
// quietly invents a figure fails rather than passes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { pickRelatedChain, utcIso } from "@/lib/intel/wallet";
import { POST as activityPOST } from "@/app/api/wallet/activity/route";
import { POST as originPOST } from "@/app/api/wallet/origin/route";
import { POST as counterpartiesPOST } from "@/app/api/wallet/counterparties/route";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
/** The wallet's own chain order, largest first, exactly as the card sends it. */
const CHAINS = ["hyperevm", "arbitrum", "bnb", "base", "ethereum"];

function req(url: string, opts: { body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.origin !== undefined) headers.origin = opts.origin;
  return new Request(`http://127.0.0.1:3000${url}`, {
    method: "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-wallet-23-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

describe("utcIso — the timestamps Nansen sends two different ways", () => {
  it("restores the zone `profiler/address/transactions` leaves off", () => {
    // Without this the row would be read as local time: on UTC+2 it would age two hours wrong
    // and could print as being in the future.
    expect(utcIso("2026-09-18T17:20:11")).toBe("2026-09-18T17:20:11Z");
  });

  it("leaves a timestamp that already carries one alone", () => {
    expect(utcIso("2021-11-07T16:34:35Z")).toBe("2021-11-07T16:34:35Z");
    expect(utcIso("2021-11-07T16:34:35+02:00")).toBe("2021-11-07T16:34:35+02:00");
  });

  it("is null for anything that is not a date, rather than an Invalid Date on the card", () => {
    expect(utcIso(null)).toBeNull();
    expect(utcIso("")).toBeNull();
    expect(utcIso("not a date")).toBeNull();
    expect(utcIso(12345)).toBeNull();
  });
});

describe("pickRelatedChain — related-wallets has no chain:'all'", () => {
  it("skips the wallet's largest chain when the endpoint does not carry it", () => {
    // Measured from the endpoint's own 422 (free): hyperevm is not in its enum, so passing
    // "the wallet's biggest chain" straight through would fail on the recorded wallet.
    expect(pickRelatedChain(CHAINS)).toBe("arbitrum");
  });

  it("takes the largest chain it does carry, in the order the wallet holds value", () => {
    expect(pickRelatedChain(["hyperevm", "bnb", "ethereum"])).toBe("bnb");
    expect(pickRelatedChain(["hyperevm", "ethereum"])).toBe("ethereum");
    expect(pickRelatedChain(["SOLANA"])).toBe("solana");
  });

  it("is null when no chain the wallet holds is covered, so nothing is asked or charged", () => {
    expect(pickRelatedChain(["hyperevm"])).toBeNull();
    expect(pickRelatedChain([])).toBeNull();
    expect(pickRelatedChain(undefined)).toBeNull();
  });
});

describe("POST /api/wallet/activity", () => {
  it("returns the time-ordered feed, priced at one credit, and says it is a slice", async () => {
    const res = await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(100);
    expect(body.credits).toBe(1);
    expect(body.windowDays).toBe(30);
    // `is_last_page: false` in the recorded page: 100 rows are the newest, not the window.
    expect(body.truncated).toBe(true);
    expect(body.errors).toEqual([]);
  });

  it("carries a chain on every row — chain:'all' answers, unlike profiler/address/pnl", async () => {
    const body = await (await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    expect(body.rows.every((r: { chain: string | null }) => typeof r.chain === "string")).toBe(true);
    expect(body.chains).toEqual(expect.arrayContaining(["hyperevm", "arbitrum", "ethereum", "bsc"]));
  });

  it("derives last-active from the newest returned row and nothing else", async () => {
    const body = await (await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const times: string[] = body.rows.map((r: { timeIso: string }) => r.timeIso);
    expect(body.lastActiveIso).toBe(times.reduce((a, b) => (a > b ? a : b)));
    expect(body.lastActiveIso).toMatch(/Z$/);
  });

  it("leaves an unpriced transfer null, never $0", async () => {
    const body = await (await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const unpriced = body.rows.filter((r: { valueUsd: number | null }) => r.valueUsd === null);
    // 21 of the 100 recorded rows carry no volume_usd at all.
    expect(unpriced).toHaveLength(21);
    expect(body.rows.some((r: { valueUsd: number | null }) => r.valueUsd === 0)).toBe(false);
  });

  it("reads direction and counterparty off the row Nansen sent, not off the addresses", async () => {
    const body = await (await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const first = body.rows[0];
    expect(first.direction).toBe("sent");
    expect(first.token.symbol).toBe("USDC");
    expect(first.legCount).toBe(2);
    // The other end of the leg is the `to_address` of a sent leg, with Nansen's own label.
    expect(first.counterparty.address).toBe("0x6b9e773128f453f5c2c60935ee2de2cbc5390a24");
    expect(first.counterparty.label).toBe("Token Millionaire [0x6b9e77]");
    expect(["sent", "received", "both", null]).toContain(first.direction);
  });

  it("refuses a request that is not from the extension, and one with no address", async () => {
    expect((await activityPOST(req("/api/wallet/activity", { body: { address: ADDRESS }, origin: "https://evil.example" }))).status).toBe(403);
    expect((await activityPOST(req("/api/wallet/activity", { body: { address: "nope" }, origin: ORIGIN }))).status).toBe(400);
  });
});

describe("POST /api/wallet/origin", () => {
  it("returns the first funder as Nansen named it, and prices both calls", async () => {
    const res = await originPOST(req("/api/wallet/origin", { body: { address: ADDRESS, chains: CHAINS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstFunderAsked).toBe(true);
    expect(body.firstFunder.address).toBe("0x1778767436111ec0adb10f9ba4f51a329d0e7770");
    expect(body.firstFunder.name).toBe("High Activity");
    expect(body.firstFunder.timeIso).toBe("2021-11-07T16:34:35Z");
    expect(body.firstFunderReportedNone).toBe(false);
    expect(body.relatedChain).toBe("arbitrum");
    expect(body.credits).toBe(2);
    expect(body.errors).toEqual([]);
  });

  it("carries `relation` verbatim and never a re-worded one", async () => {
    const body = await (await originPOST(req("/api/wallet/origin", { body: { address: ADDRESS, chains: CHAINS }, origin: ORIGIN }))).json();
    expect(body.related).toHaveLength(1);
    expect(body.related[0].relation).toBe("First Funder");
    expect(JSON.stringify(body)).not.toMatch(/same owner|linked to|sybil/i);
  });

  it("knows the related row and the funder row are one relationship, not two", async () => {
    // Measured: related-wallets returned the same address, the same tx and the same timestamp
    // as first-funder. Counting it twice would read as two independent pieces of evidence.
    const body = await (await originPOST(req("/api/wallet/origin", { body: { address: ADDRESS, chains: CHAINS }, origin: ORIGIN }))).json();
    expect(body.firstFunderAlsoRelated).toBe(true);
  });

  it("does not ask an EVM-only lookup about a Solana address, and charges for one call", async () => {
    const body = await (await originPOST(req("/api/wallet/origin", { body: { address: WIF, chains: ["solana"] }, origin: ORIGIN }))).json();
    expect(body.firstFunderAsked).toBe(false);
    expect(body.firstFunder).toBeNull();
    expect(body.firstFunderReportedNone).toBe(false);
    expect(body.relatedChain).toBe("solana");
    expect(body.credits).toBe(1);
  });

  it("spends nothing on related wallets when no chain the wallet holds is covered", async () => {
    const body = await (await originPOST(req("/api/wallet/origin", { body: { address: ADDRESS, chains: ["hyperevm"] }, origin: ORIGIN }))).json();
    expect(body.relatedChain).toBeNull();
    expect(body.related).toBeNull();
    expect(body.credits).toBe(1);
    expect(body.errors).toEqual([]);
  });

  it("refuses a request that is not from the extension", async () => {
    expect((await originPOST(req("/api/wallet/origin", { body: { address: ADDRESS }, origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("POST /api/wallet/counterparties", () => {
  it("returns one page of the largest counterparties and prices itself at five credits", async () => {
    const res = await counterpartiesPOST(req("/api/wallet/counterparties", { body: { address: ADDRESS }, origin: ORIGIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(50);
    expect(body.credits).toBe(5);
    expect(body.windowDays).toBe(30);
    expect(body.truncated).toBe(true);
    expect(body.errors).toEqual([]);
  });

  it("keeps volume in and volume out apart, and adds no interpretation of either", async () => {
    const body = await (await counterpartiesPOST(req("/api/wallet/counterparties", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const first = body.rows[0];
    expect(first.volumeInUsd).toBeCloseTo(136640297.1, 0);
    expect(first.volumeOutUsd).toBeCloseTo(27853718.39, 0);
    expect(first.interactions).toBe(69);
    expect(first.topToken).toBe("USDC");
    expect(JSON.stringify(body)).not.toMatch(/exposure|exchange deposit|wash/i);
  });

  it("leaves an unlabelled counterparty unlabelled — most of the page is", async () => {
    const body = await (await counterpartiesPOST(req("/api/wallet/counterparties", { body: { address: ADDRESS }, origin: ORIGIN }))).json();
    const unlabelled = body.rows.filter((r: { labels: string[] }) => r.labels.length === 0);
    expect(unlabelled).toHaveLength(36);
    expect(unlabelled.every((r: { address: string }) => /^0x[0-9a-f]{40}$/.test(r.address))).toBe(true);
    expect(body.rows[0].labels).toEqual(["Token Millionaire"]);
  });

  it("refuses a request that is not from the extension", async () => {
    expect((await counterpartiesPOST(req("/api/wallet/counterparties", { body: { address: ADDRESS }, origin: "https://evil.example" }))).status).toBe(403);
  });
});
