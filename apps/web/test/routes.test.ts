import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { recentOverrides } from "@/lib/store";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as resolvePOST } from "@/app/api/resolve/route";
import { POST as postIntelPOST } from "@/app/api/post-intel/route";
import { POST as guardPOST } from "@/app/api/guard/route";
import { POST as personIntelPOST } from "@/app/api/person-intel/route";
import { GET as rulesGET, PUT as rulesPUT } from "@/app/api/rules/route";
import { GET as ledgerGET } from "@/app/api/ledger/route";
import { POST as overridePOST } from "@/app/api/override/route";

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const PREDICTION_SLUG = "bitcoin-above-72k-on-september-17-2026";
const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const VALID_EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const ALLOWED_VERDICTS = new Set(["CLEAR", "CAUTION", "TRIPWIRE", "UNCHECKED"]);

function req(url: string, opts: { method?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.origin !== undefined) headers.origin = opts.origin;
  return new Request(`http://127.0.0.1:3000${url}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeAll(() => {
  process.env.TRIPWIRE_REPLAY = "1";
  process.env.TRIPWIRE_FIXTURES = FIXTURES;
  process.env.TRIPWIRE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tw-routes-")), "t.db");
  resetDb();
  _resetClientState();
});
afterAll(() => {
  delete process.env.TRIPWIRE_REPLAY;
  resetDb();
});

describe("/api/guard", () => {
  it("returns a verdict for a spot target", async () => {
    const res = await guardPOST(
      req("/api/guard", { body: { target: { kind: "spot", chain: "solana", tokenAddress: WIF }, venue: "x" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ALLOWED_VERDICTS.has(body.verdict)).toBe(true);
    expect(body.target.kind).toBe("spot");
    expect(Array.isArray(body.hits)).toBe(true);
    expect(Array.isArray(body.signals)).toBe(true);
    expect(body.panel).toBeTruthy();
    expect(typeof body.rulesPreset).toBe("string");
  });

  it("returns a verdict for a perp target", async () => {
    const res = await guardPOST(req("/api/guard", { body: { target: { kind: "perp", coin: "ETH", side: "long" }, venue: "x" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ALLOWED_VERDICTS.has(body.verdict)).toBe(true);
    expect(body.target.kind).toBe("perp");
  });

  it("returns a verdict for a prediction target", async () => {
    const res = await guardPOST(
      req("/api/guard", { body: { target: { kind: "prediction", slug: PREDICTION_SLUG, outcome: "yes" }, venue: "x" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ALLOWED_VERDICTS.has(body.verdict)).toBe(true);
    expect(body.target.kind).toBe("prediction");
  });

  it("400s on an invalid body", async () => {
    const res = await guardPOST(req("/api/guard", { body: { target: { kind: "spot" }, venue: "x" } }));
    expect(res.status).toBe(400);
  });

  it("403s on a disallowed Origin", async () => {
    const res = await guardPOST(
      req("/api/guard", { body: { target: { kind: "perp", coin: "ETH" }, venue: "x" }, origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("200s with the origin echoed for a chrome-extension Origin", async () => {
    const res = await guardPOST(
      req("/api/guard", { body: { target: { kind: "perp", coin: "ETH" }, venue: "x" }, origin: VALID_EXTENSION_ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_EXTENSION_ORIGIN);
  });
});

describe("/api/post-intel", () => {
  it("evaluates a spot target and records the check under venue x", async () => {
    const res = await postIntelPOST(req("/api/post-intel", { body: { target: { kind: "spot", chain: "solana", tokenAddress: WIF } } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ALLOWED_VERDICTS.has(body.verdict)).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(typeof body.rulesPreset).toBe("string");
  });
});

describe("/api/resolve", () => {
  it("resolves a cashtag", async () => {
    const res = await resolvePOST(req("/api/resolve", { body: { symbol: "wif" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.best?.tokenAddress).toBe(WIF);
    expect(Array.isArray(body.candidates)).toBe(true);
  });
});

describe("/api/person-intel", () => {
  it("returns an author_holds_token signal when a target is given and an entity matches", async () => {
    const res = await personIntelPOST(
      req("/api/person-intel", {
        body: { handle: "VitalikButerin", displayName: "Vitalik Buterin", target: { kind: "spot", chain: "solana", tokenAddress: WIF } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity).toBe("Vitalik Buterin");
    expect(body.signal?.id).toBe("author_holds_token");
  });

  it("omits signal when there is no entity match", async () => {
    const res = await personIntelPOST(req("/api/person-intel", { body: { handle: "randomdegen", displayName: "random degen" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity).toBeNull();
    expect(body.signal).toBeUndefined();
  });
});

describe("/api/rules", () => {
  it("PUT preset paranoid, then GET reflects it", async () => {
    const put = await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "paranoid" } }));
    expect(put.status).toBe(200);
    const get = await rulesGET(req("/api/rules"));
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.preset).toBe("paranoid");
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThan(0);
  });
});

describe("/api/ledger", () => {
  it("returns numeric totals", async () => {
    const res = await ledgerGET(req("/api/ledger"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totalCalls).toBe("number");
    expect(typeof body.creditsToday).toBe("number");
    expect(Array.isArray(body.byEndpoint)).toBe(true);
    expect(Array.isArray(body.recent)).toBe(true);
  });
});

describe("/api/health", () => {
  it("never leaks the Nansen key", async () => {
    const prev = process.env.NANSEN_API_KEY;
    process.env.NANSEN_API_KEY = "secret-test-key";
    try {
      const res = await healthGET(req("/api/health"));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("secret-test-key");
      const body = JSON.parse(text);
      expect(body.ok).toBe(true);
      expect(body.keySource).toBe("env");
      expect(body.replay).toBe(true);
      expect(typeof body.creditsToday).toBe("number");
      expect(typeof body.cap).toBe("number");
    } finally {
      if (prev === undefined) delete process.env.NANSEN_API_KEY;
      else process.env.NANSEN_API_KEY = prev;
    }
  });
});

describe("/api/override", () => {
  it("records an override", async () => {
    const target = { kind: "spot", chain: "solana", tokenAddress: WIF };
    const res = await overridePOST(
      req("/api/override", { body: { target, verdict: "TRIPWIRE", ruleIds: ["spot-exit"], venue: "x" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const overrides = recentOverrides(5);
    expect(overrides[0]?.verdict).toBe("TRIPWIRE");
    expect(JSON.parse(overrides[0]!.rule_ids)).toEqual(["spot-exit"]);
  });
});
