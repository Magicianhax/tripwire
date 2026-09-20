import { afterEach, beforeEach, expect, it, vi } from "vitest";
const get = vi.hoisted(() => vi.fn(async () => ({ source: "Nansen", state: "unavailable", asOf: null, refreshAfter: null, markets: [] })));
vi.mock("../lib/public-brief", () => ({ getPublicBrief: get }));
import { GET, HEAD } from "../app/api/public-brief/route";
beforeEach(() => { get.mockClear(); vi.stubEnv("TRIPWIRE_PUBLIC_SITE", "1"); });
afterEach(() => vi.unstubAllEnvs());
it("serves only the fixed sanitized DTO with bounded HTTP caching", async () => {
  const response = await GET(new Request("https://tripwire.example/api/public-brief"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  expect(await response.json()).toEqual(await get());
});
it("rejects arbitrary asset, refresh and cache-busting query parameters before collection", async () => {
  for (const query of ["?token=evil", "?refresh=1", "?_=123"]) expect((await GET(new Request(`https://tripwire.example/api/public-brief${query}`))).status).toBe(400);
  expect(get).not.toHaveBeenCalled();
});
it("HEAD never triggers collection", async () => {
  expect((await HEAD(new Request("https://tripwire.example/api/public-brief"))).status).toBe(200);
  expect(get).not.toHaveBeenCalled();
});
it("keeps the local backend origin checks before potentially paid work", async () => {
  vi.stubEnv("TRIPWIRE_PUBLIC_SITE", "");
  const request = new Request("http://127.0.0.1:3000/api/public-brief", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  expect((await GET(request)).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
