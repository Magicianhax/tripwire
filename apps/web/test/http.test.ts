import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { afterEach, describe, expect, it } from "vitest";
import { hostAllowed, originAllowed, requestAllowed } from "@/lib/origin";

const PINNED = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const RANDOM_EXTENSION = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

afterEach(() => {
  delete process.env.TRIPWIRE_EXTENSION_ORIGIN;
  delete process.env.TRIPWIRE_PORT;
});

describe("originAllowed", () => {
  it("allows the local pages on the backend port", () => {
    expect(originAllowed("http://127.0.0.1:3000")).toBe(true);
    expect(originAllowed("http://localhost:3000")).toBe(true);
    expect(originAllowed("http://127.0.0.1:3001")).toBe(false);
  });

  it("allows only the pinned Tripwire extension ID by default", () => {
    expect(originAllowed(PINNED)).toBe(true);
    expect(originAllowed(RANDOM_EXTENSION)).toBe(false);
    expect(originAllowed("chrome-extension://tooshort")).toBe(false);
  });

  it("TRIPWIRE_EXTENSION_ORIGIN replaces the pinned ID (forks)", () => {
    withEnv("TRIPWIRE_EXTENSION_ORIGIN", RANDOM_EXTENSION, () => {
      expect(originAllowed(RANDOM_EXTENSION)).toBe(true);
      expect(originAllowed(PINNED)).toBe(false);
    });
  });

  it("rejects arbitrary websites", () => {
    expect(originAllowed("https://evil.example")).toBe(false);
    expect(originAllowed("null")).toBe(false);
  });

  it("follows TRIPWIRE_PORT for the local page origins", () => {
    withEnv("TRIPWIRE_PORT", "4000", () => {
      expect(originAllowed("http://127.0.0.1:4000")).toBe(true);
      expect(originAllowed("http://127.0.0.1:3000")).toBe(false);
    });
  });
});

describe("hostAllowed (DNS rebinding defence)", () => {
  it("accepts only 127.0.0.1 / localhost on the backend port", () => {
    expect(hostAllowed("127.0.0.1:3000")).toBe(true);
    expect(hostAllowed("localhost:3000")).toBe(true);
    expect(hostAllowed("evil.example:3000")).toBe(false);
    expect(hostAllowed("127.0.0.1:3001")).toBe(false);
    expect(hostAllowed("127.0.0.1")).toBe(false);
    expect(hostAllowed(null)).toBe(false);
  });

  it("follows TRIPWIRE_PORT", () => {
    withEnv("TRIPWIRE_PORT", "4000", () => {
      expect(hostAllowed("localhost:4000")).toBe(true);
      expect(hostAllowed("localhost:3000")).toBe(false);
    });
  });
});

describe("requestAllowed", () => {
  const host = { host: "127.0.0.1:3000" };

  it("without an Origin: allows non-browser clients and same-origin/user-initiated fetches", () => {
    expect(requestAllowed(headers(host))).toBe(true); // curl: no Sec-Fetch-Site
    expect(requestAllowed(headers({ ...host, "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(requestAllowed(headers({ ...host, "sec-fetch-site": "none" }))).toBe(true);
  });

  it("without an Origin: rejects cross-site and same-site browser requests", () => {
    expect(requestAllowed(headers({ ...host, "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(requestAllowed(headers({ ...host, "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("with an Origin: defers to originAllowed", () => {
    expect(requestAllowed(headers({ ...host, origin: PINNED }))).toBe(true);
    expect(requestAllowed(headers({ ...host, origin: RANDOM_EXTENSION }))).toBe(false);
  });

  it("rejects a foreign Host even from an allowed origin", () => {
    expect(requestAllowed(headers({ host: "rebind.evil.example:3000", origin: PINNED }))).toBe(false);
  });
});
