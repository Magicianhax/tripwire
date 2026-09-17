import { describe, expect, it } from "vitest";
import { originAllowed } from "@/lib/http";

describe("originAllowed", () => {
  it("allows requests with no Origin header (curl, same-origin navigations)", () => {
    expect(originAllowed(null)).toBe(true);
  });

  it("allows the local dev pages", () => {
    expect(originAllowed("http://127.0.0.1:3000")).toBe(true);
    expect(originAllowed("http://localhost:3000")).toBe(true);
  });

  it("allows any well-formed chrome-extension origin by default", () => {
    expect(originAllowed("chrome-extension://abcdefghijklmnopabcdefghijklmnop")).toBe(true);
  });

  it("rejects malformed chrome-extension ids", () => {
    expect(originAllowed("chrome-extension://tooshort")).toBe(false);
    expect(originAllowed("chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP")).toBe(false); // uppercase not in [a-p]
  });

  it("rejects arbitrary websites", () => {
    expect(originAllowed("https://evil.example")).toBe(false);
  });

  it("when TRIPWIRE_EXTENSION_ORIGIN is set, only that exact origin is allowed", () => {
    const prev = process.env.TRIPWIRE_EXTENSION_ORIGIN;
    process.env.TRIPWIRE_EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    try {
      expect(originAllowed("chrome-extension://abcdefghijklmnopabcdefghijklmnop")).toBe(true);
      expect(originAllowed("chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.TRIPWIRE_EXTENSION_ORIGIN;
      else process.env.TRIPWIRE_EXTENSION_ORIGIN = prev;
    }
  });
});
