import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAIN_LOGOS, NANSEN_LOGO, VENUE_LOGOS } from "@tripwire/core";

const repo = path.resolve(__dirname, "..", "..", "..");
const EXT = path.join(repo, "apps", "extension", "public", "logos");
const WEB = path.join(repo, "apps", "web", "public", "logos");

describe("bundled brand logos", () => {
  it("web's copy is byte-identical to the extension's source dir", () => {
    const ext = fs.readdirSync(EXT).sort();
    expect(fs.readdirSync(WEB).sort()).toEqual(ext);
    for (const f of ext) expect(fs.readFileSync(path.join(WEB, f)).equals(fs.readFileSync(path.join(EXT, f))), f).toBe(true);
  });

  it("every registry entry has its file and a SOURCES.md row", () => {
    const sources = fs.readFileSync(path.join(EXT, "SOURCES.md"), "utf8");
    for (const logo of [...Object.values(VENUE_LOGOS), ...Object.values(CHAIN_LOGOS), NANSEN_LOGO]) {
      const file = path.join(repo, "apps", "extension", "public", logo.file);
      expect(fs.existsSync(file), logo.file).toBe(true);
      expect(sources).toContain(`| ${path.basename(logo.file)} |`);
    }
  });

  it("SVGs are sanitized: no scripts, foreign content, handlers or external references", () => {
    for (const f of fs.readdirSync(EXT).filter((n) => n.endsWith(".svg"))) {
      const svg = fs.readFileSync(path.join(EXT, f), "utf8");
      expect(svg.startsWith("<svg"), f).toBe(true);
      expect(svg, f).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["'](?!#)|url\((?!#)|<!DOCTYPE|<\?xml/i);
    }
  });

  it("rasters are real PNGs", () => {
    for (const f of fs.readdirSync(EXT).filter((n) => n.endsWith(".png"))) {
      expect([...fs.readFileSync(path.join(EXT, f)).subarray(0, 4)], f).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});
