import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TRIPWIRE_EXTENSION_ID } from "@tripwire/core";
import { describe, expect, it } from "vitest";

/** Chrome's extension ID: sha256(SPKI DER public key), first 32 hex digits mapped 0-f -> a-p. */
function extensionIdFromKey(base64Key: string): string {
  const hex = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + Number.parseInt(c, 16))).join("");
}

describe("pinned extension ID", () => {
  it("matches the ID derived from the manifest key in wxt.config.ts", () => {
    const config = readFileSync(path.resolve(__dirname, "..", "wxt.config.ts"), "utf8");
    const key = /MANIFEST_PUBLIC_KEY\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(config)?.[1];
    expect(key, "MANIFEST_PUBLIC_KEY in wxt.config.ts").toBeTruthy();
    expect(extensionIdFromKey(key!)).toBe(TRIPWIRE_EXTENSION_ID);
  });

  it("the config carries only a public key", () => {
    const config = readFileSync(path.resolve(__dirname, "..", "wxt.config.ts"), "utf8");
    expect(config).not.toMatch(/PRIVATE KEY/);
  });
});
