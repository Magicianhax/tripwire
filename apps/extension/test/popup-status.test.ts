import { describe, expect, it } from "vitest";
import { popupStatus } from "../entrypoints/popup/status";

describe("popupStatus", () => {
  it("names the real key source when connected", () => {
    expect(popupStatus({ ok: true, keySource: "nansen-cli" })).toEqual({ text: "Backend connected · key via Nansen CLI", state: "connected" });
    expect(popupStatus({ ok: true, keySource: "env" })).toEqual({ text: "Backend connected · key via NANSEN_API_KEY", state: "connected" });
  });

  it("no key: not ready, with the fix", () => {
    expect(popupStatus({ ok: true, keySource: "none" })).toEqual({ text: "No Nansen key: set NANSEN_API_KEY or run nansen login", state: "not-ready" });
  });

  it("offline and checking", () => {
    expect(popupStatus({ ok: false })).toEqual({ text: "Backend offline: run pnpm dev", state: "offline" });
    expect(popupStatus(null)).toEqual({ text: "Checking backend…", state: undefined });
  });
});
