// Renders the README header lockup ("Tripwire | Powered by Nansen") as two transparent PNGs, one
// for GitHub's dark theme and one for light, using the bundled Sora/Inter fonts and the logos in
// apps/web/public/logos. Re-run after changing either mark:
//   node scripts/render-readme-lockup.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/extension/package.json"));
const { chromium } = require("@playwright/test");

// Inlined as data URIs: a page built with setContent cannot load file:// resources.
const MIME = { ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
const url = (p) => `data:${MIME[path.extname(p)]};base64,${readFileSync(path.join(root, p)).toString("base64")}`;
const fonts = "apps/web/node_modules/@fontsource";
const tripwire = url("apps/web/public/logos/tripwire.png");
const nansen = url("apps/web/public/logos/nansen.svg");

const html = (ink, muted, rule) => `<!doctype html><html><head><style>
@font-face { font-family: Sora; font-weight: 700; src: url(${url(`${fonts}/sora/files/sora-latin-700-normal.woff2`)}); }
@font-face { font-family: Sora; font-weight: 600; src: url(${url(`${fonts}/sora/files/sora-latin-600-normal.woff2`)}); }
@font-face { font-family: Inter; font-weight: 500; src: url(${url(`${fonts}/inter/files/inter-latin-500-normal.woff2`)}); }
html, body { margin: 0; background: transparent; }
.lockup { display: inline-flex; align-items: center; gap: 36px; padding: 24px 32px; }
.brand { display: flex; align-items: center; gap: 16px; }
.brand img { height: 64px; width: auto; display: block; }
.word { font: 700 52px/1 Sora; letter-spacing: -0.02em; color: ${ink}; }
.rule { width: 1px; height: 64px; background: ${rule}; }
.powered { display: flex; flex-direction: column; gap: 10px; }
.label { font: 500 15px/1 Inter; letter-spacing: 0.12em; text-transform: uppercase; color: ${muted}; }
.nansen { display: flex; align-items: center; gap: 12px; }
.nansen img { height: 40px; width: 40px; display: block; }
.nansen span { font: 600 36px/1 Sora; letter-spacing: -0.01em; color: ${ink}; }
</style></head><body>
<div class="lockup">
  <div class="brand"><img src="${tripwire}" alt=""><span class="word">Tripwire</span></div>
  <div class="rule"></div>
  <div class="powered"><span class="label">Powered by</span><div class="nansen"><img src="${nansen}" alt=""><span>Nansen</span></div></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [name, ink, muted, rule] of [
  ["lockup-dark.png", "#FFFFFF", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.18)"],
  ["lockup-light.png", "#0B1016", "rgba(11,16,22,0.6)", "rgba(11,16,22,0.18)"],
]) {
  await page.setContent(html(ink, muted, rule), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".lockup").screenshot({ path: path.join(root, "assets/brand", name), omitBackground: true });
  console.log(`assets/brand/${name}`);
}
await browser.close();
