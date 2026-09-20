import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "@/next.config";
import { proxy } from "@/proxy";

beforeEach(() => vi.stubEnv("TRIPWIRE_PUBLIC_SITE", ""));
afterEach(() => vi.unstubAllEnvs());

describe("page security headers (next.config headers())", () => {
  it("applies anti-framing and hardening headers to every route", async () => {
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeTruthy();
    const h = Object.fromEntries(all!.headers.map(({ key, value }) => [key, value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("standalone public product site", () => {
  beforeEach(() => vi.stubEnv("TRIPWIRE_PUBLIC_SITE", "1"));
  it("serves only the product homepage and packaged assets", () => {
    for (const path of ["/", "/showcase/x-profile.jpg", "/?ref=extension", "/_next/static/chunks/app.js", "/logos/nansen.svg", "/logos/tripwire.png", "/favicon.ico", "/icon.png"]) {
      for (const method of ["GET", "HEAD"]) {
        expect(proxy(new NextRequest(`https://tripwire.example${path}`, { method })).headers.get("x-middleware-next")).toBe("1");
      }
    }
  });
  it("denies private routes even behind a loopback reverse proxy", () => {
    for (const host of ["tripwire.example", "127.0.0.1:3000"]) {
      for (const path of ["/api/public-brief", "/api/health", "/api/ledger", "/api/guard", "/api/rules", "/ledger", "/rules", "/history", "/_next/image", "/missing"]) {
        expect(proxy(new NextRequest(`http://${host}${path}`, { headers: { host } })).status, `${host}${path}`).toBe(404);
      }
    }
  });
  it("denies write methods even on the homepage", () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      expect(proxy(new NextRequest("https://tripwire.example/", { method })).status).toBe(404);
      expect(proxy(new NextRequest("https://tripwire.example/api/public-brief", { method })).status).toBe(404);
    }
  });
});

describe("proxy Host allowlist", () => {
  it("lets 127.0.0.1 / localhost on the backend port through", () => {
    for (const host of ["127.0.0.1:3000", "localhost:3000"]) {
      const res = proxy(new NextRequest(`http://${host}/rules`, { headers: { host } }));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("403s a foreign Host (DNS rebinding) on pages and API routes", () => {
    for (const url of ["http://rebind.evil.example:3000/rules", "http://rebind.evil.example:3000/api/rules"]) {
      const res = proxy(new NextRequest(url, { headers: { host: "rebind.evil.example:3000" } }));
      expect(res.status).toBe(403);
    }
  });
});
