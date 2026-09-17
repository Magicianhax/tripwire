import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import config from "@/next.config";
import { proxy } from "@/proxy";

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
