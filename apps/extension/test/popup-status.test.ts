import { describe, expect, it } from "vitest";
import { popupStatus } from "../entrypoints/popup/status";

describe("popupStatus", () => {
  it("names the real key source when connected", () => {
    expect(popupStatus({ ok: true, keySource: "nansen-cli", replay: false })).toEqual({ text: "Backend connected · key via Nansen CLI", state: "connected" });
    expect(popupStatus({ ok: true, keySource: "env", replay: false })).toEqual({ text: "Backend connected · key via NANSEN_API_KEY", state: "connected" });
  });

  it("no key: not ready, with the fix", () => {
    expect(popupStatus({ ok: true, keySource: "none", replay: false })).toEqual({ text: "No Nansen key: set NANSEN_API_KEY or run nansen login", state: "not-ready" });
  });

  it("no key but in replay mode: ready, not a warning -- recorded data needs no key", () => {
    expect(popupStatus({ ok: true, keySource: "none", replay: true })).toEqual({ text: "Replay mode · recorded data, no key needed", state: "connected" });
  });

  it("replay mode with a real key still names the key source (replay only changes the 'none' case)", () => {
    expect(popupStatus({ ok: true, keySource: "env", replay: true })).toEqual({ text: "Backend connected · key via NANSEN_API_KEY", state: "connected" });
  });

  it("offline and checking", () => {
    expect(popupStatus({ ok: false })).toEqual({ text: "Backend offline: run pnpm dev", state: "offline" });
    expect(popupStatus(null)).toEqual({ text: "Checking backend…", state: undefined });
  });
});
