import { describe, expect, it } from "vitest";
import { VENUE_IDS, venueLogo } from "@tripwire/core";
import { ADAPTERS } from "../lib/adapters/registry";
import config from "../wxt.config";

describe("venue logos", () => {
  it("every adapter has a bundled logo, and the registry lists no venue we don't support", () => {
    expect(ADAPTERS.map((a) => a.id).sort()).toEqual([...VENUE_IDS].sort());
    for (const a of ADAPTERS) expect(venueLogo(a.id)).not.toBeNull();
  });

  it("logos are web-accessible only on the pages the content scripts run on", () => {
    const manifest = config.manifest as { web_accessible_resources: { resources: string[]; matches: string[] }[] };
    const entry = manifest.web_accessible_resources.find((r) => r.resources.includes("logos/*"));
    expect(entry).toBeDefined();
    expect(entry!.matches.every((m) => m.startsWith("https://"))).toBe(true);
  });
});
