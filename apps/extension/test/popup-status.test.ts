import { describe, expect, it } from "vitest";
import { popupStatus } from "../entrypoints/popup/status";

describe("popupStatus", () => {
  it("shows readiness without internal key configuration", () => {
    expect(popupStatus({ ok: true, keySource: "nansen-cli", replay: false })).toEqual({ text: "Connected", state: "connected" });
    expect(popupStatus({ ok: true, keySource: "env", replay: false })).toEqual({ text: "Connected", state: "connected" });
  });

  it("no key: names the service issue without pointing to an unrelated setting", () => {
    expect(popupStatus({ ok: true, keySource: "none", replay: false })).toEqual({ text: "Data service needs setup", state: "not-ready" });
  });

  it("no key but in replay mode: ready, not a warning -- recorded data needs no key", () => {
    expect(popupStatus({ ok: true, keySource: "none", replay: true })).toEqual({ text: "Sample data", state: "connected" });
  });

  it("identifies sample data even with a real key", () => {
    expect(popupStatus({ ok: true, keySource: "env", replay: true })).toEqual({ text: "Sample data", state: "connected" });
  });

  it("offline and checking", () => {
    expect(popupStatus({ ok: false })).toEqual({ text: "Offline · check connection", state: "offline" });
    expect(popupStatus({ ok: false, status: 0 })).toEqual({ text: "Offline · check connection", state: "offline" });
    // Reachable but not recognising this install: never "offline".
    expect(popupStatus({ ok: false, status: 401 })).toEqual({ text: "Couldn't register · try again later", state: "not-ready" });
    expect(popupStatus(null)).toEqual({ text: "Connecting…", state: undefined });
  });
});
