import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { _resetClientState } from "@/lib/nansen/client";
import { recentOverrides, recentSettingsChanges } from "@/lib/store";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as resolvePOST } from "@/app/api/resolve/route";
import { POST as postIntelPOST } from "@/app/api/post-intel/route";
import { POST as guardPOST } from "@/app/api/guard/route";
import { POST as personIntelPOST } from "@/app/api/person-intel/route";
import { GET as rulesGET, PUT as rulesPUT } from "@/app/api/rules/route";
import { PRESETS, TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { GET as ledgerGET } from "@/app/api/ledger/route";
import { POST as overridePOST } from "@/app/api/override/route";

const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const PREDICTION_SLUG = "bitcoin-above-72k-on-september-17-2026";
const FIXTURES = path.resolve(__dirname, "..", "..", "..", "fixtures", "nansen");
const VALID_EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const RANDOM_EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const ALLOWED_VERDICTS = new Set(["CLEAR", "CAUTION", "TRIPWIRE", "UNCHECKED"]);

function req(url: string, opts: { method?: string; body?: unknown; origin?: string; headers?: Record<string, string>; base?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.origin !== undefined) headers.origin = opts.origin;
  return new Request(`${opts.base ?? "http://127.0.0.1:3000"}${url}`, {
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

  // The recalibration's own headline case: WIF sheds 0.6% of a day's volume, which is ordinary
  // rotation on Balanced and worth a warning only to someone who asked for one.
  it("balanced clears the recorded WIF data; paranoid warns on it", async () => {
    expect((await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "balanced" } }))).status).toBe(200);
    const clear = await (await guardPOST(req("/api/guard", { body: { target: { kind: "spot", chain: "solana", tokenAddress: WIF }, venue: "jupiter" } }))).json();
    expect(clear.verdict).toBe("CLEAR");
    expect(clear.hits).toEqual([]);
    expect(clear.headline).toBeNull();

    expect((await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "paranoid" } }))).status).toBe(200);
    const caution = await (await guardPOST(req("/api/guard", { body: { target: { kind: "spot", chain: "solana", tokenAddress: WIF }, venue: "jupiter" } }))).json();
    expect(caution.verdict).toBe("CAUTION");
    expect(caution.hits.map((h: { ruleId: string }) => h.ruleId)).toEqual(["spot-exit"]);
  });

  it("UNCHECKED (never CLEAR) when every Nansen lookup fails", async () => {
    const prev = process.env.TRIPWIRE_FIXTURES;
    process.env.TRIPWIRE_FIXTURES = fs.mkdtempSync(path.join(os.tmpdir(), "tw-nofixtures-"));
    try {
      const res = await guardPOST(req("/api/guard", { body: { target: { kind: "spot", chain: "solana", tokenAddress: WIF }, venue: "jupiter" } }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verdict).toBe("UNCHECKED");
      expect(body.hits).toEqual([]);
      expect(body.panel.errors.length).toBeGreaterThan(0);
    } finally {
      process.env.TRIPWIRE_FIXTURES = prev;
    }
  });

  it("Nansen credit cap reached: UNCHECKED with that headline, on guard and post-intel", async () => {
    const prevCap = process.env.NANSEN_DAILY_CREDIT_CAP;
    delete process.env.TRIPWIRE_REPLAY;
    process.env.NANSEN_DAILY_CREDIT_CAP = "0";
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network must not be used")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const target = { kind: "spot", chain: "solana", tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" };
      const guardBody = await (await guardPOST(req("/api/guard", { body: { target, venue: "jupiter" } }))).json();
      expect(guardBody.verdict).toBe("UNCHECKED");
      expect(guardBody.headline).toBe("Nansen credit cap reached");
      const postBody = await (await postIntelPOST(req("/api/post-intel", { body: { target } }))).json();
      expect(postBody.verdict).toBe("UNCHECKED");
      expect(postBody.headline).toBe("Nansen credit cap reached");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      process.env.TRIPWIRE_REPLAY = "1";
      if (prevCap === undefined) delete process.env.NANSEN_DAILY_CREDIT_CAP;
      else process.env.NANSEN_DAILY_CREDIT_CAP = prevCap;
    }
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

  it("403s for an extension other than the pinned Tripwire ID", async () => {
    const res = await guardPOST(
      req("/api/guard", { body: { target: { kind: "perp", coin: "ETH" }, venue: "x" }, origin: RANDOM_EXTENSION_ORIGIN }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts the TRIPWIRE_EXTENSION_ORIGIN override instead of the pinned ID", async () => {
    process.env.TRIPWIRE_EXTENSION_ORIGIN = RANDOM_EXTENSION_ORIGIN;
    try {
      const body = { target: { kind: "perp", coin: "ETH" }, venue: "x" };
      expect((await guardPOST(req("/api/guard", { body, origin: RANDOM_EXTENSION_ORIGIN }))).status).toBe(200);
      expect((await guardPOST(req("/api/guard", { body, origin: VALID_EXTENSION_ORIGIN }))).status).toBe(403);
    } finally {
      delete process.env.TRIPWIRE_EXTENSION_ORIGIN;
    }
  });

  it("403s a cross-site browser request that carries no Origin", async () => {
    const body = { target: { kind: "perp", coin: "ETH" }, venue: "x" };
    expect((await guardPOST(req("/api/guard", { body, headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await guardPOST(req("/api/guard", { body, headers: { "sec-fetch-site": "same-site" } }))).status).toBe(403);
    expect((await guardPOST(req("/api/guard", { body, headers: { "sec-fetch-site": "same-origin" } }))).status).toBe(200);
  });

  it("403s a request for a foreign Host (DNS rebinding)", async () => {
    const res = await guardPOST(req("/api/guard", { body: { target: { kind: "perp", coin: "ETH" }, venue: "x" }, base: "http://rebind.evil.example:3000" }));
    expect(res.status).toBe(403);
  });

  it("200s with the origin echoed for the pinned extension Origin", async () => {
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

  it("normalizes a positive sm_netflow_pct threshold to negative on PUT custom rules", async () => {
    const rules = PRESETS.balanced.map((r) => (r.signal === "sm_netflow_pct" ? { ...r, threshold: 1.5 } : r));
    const put = await rulesPUT(req("/api/rules", { method: "PUT", body: { rules } }));
    expect(put.status).toBe(200);
    const get = await rulesGET(req("/api/rules"));
    const body = await get.json();
    expect(body.preset).toBe("custom");
    const sm24 = body.rules.find((r: { signal: string }) => r.signal === "sm_netflow_pct");
    expect(sm24.threshold).toBe(-1.5);
  });

  it("logs a weaker preset or loosened block rule as a settings change, but not a stronger one", async () => {
    await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "paranoid" } }));
    const before = recentSettingsChanges().length;
    await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "degen" } }));
    const afterDowngrade = recentSettingsChanges();
    expect(afterDowngrade.length).toBe(before + 1);
    expect(afterDowngrade[0]).toMatchObject({ from_preset: "paranoid", to_preset: "degen" });
    expect(JSON.parse(afterDowngrade[0]!.rule_ids)).toContain("spot-distribution");

    await rulesPUT(req("/api/rules", { method: "PUT", body: { preset: "balanced" } }));
    expect(recentSettingsChanges().length).toBe(before + 1);

    const looser = PRESETS.balanced.map((r) => (r.id === "spot-exit-deep" ? { ...r, threshold: -90 } : r));
    await rulesPUT(req("/api/rules", { method: "PUT", body: { rules: looser } }));
    const afterLoosen = recentSettingsChanges();
    expect(afterLoosen.length).toBe(before + 2);
    expect(JSON.parse(afterLoosen[0]!.rule_ids)).toEqual(["spot-exit-deep"]);
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
