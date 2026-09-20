import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn(async () => ({ size: 400 })), tokenScreener: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: { readFile: mocks.readFile, stat: mocks.stat } }));
vi.mock("../lib/nansen/endpoints", () => ({ nansen: { tokenScreener: mocks.tokenScreener } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
it("public mode overrides refresh/replay flags and never invokes Nansen even with no snapshot", async () => {
  vi.stubEnv("TRIPWIRE_PUBLIC_SITE", "1");
  vi.stubEnv("TRIPWIRE_PUBLIC_BRIEF_REFRESH", "1");
  vi.stubEnv("TRIPWIRE_REPLAY", "1");
  mocks.readFile.mockRejectedValue(new Error("missing"));
  const { getPublicBrief } = await import("../lib/public-brief");
  expect((await getPublicBrief()).state).toBe("unavailable");
  expect(mocks.tokenScreener).not.toHaveBeenCalled();
});
