// Renders the README header lockup ("Tripwire | Powered by Nansen") as one PNG on its own dark
// brand panel, using the bundled Sora/Inter fonts and the logos in apps/web/public/logos. One
// panel rather than light/dark variants: GitHub's <picture> follows the OS colour scheme, not the
// GitHub theme, so a transparent dark-mode variant rendered white-on-white for anyone with a dark
// OS and a light GitHub. Re-run after changing either mark:
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
// Drawn from the Chrome mark's geometry (three 120° segments cut by lines tangent to the centre
// circle); identifies the browser the download is for, nothing more.
const chrome = url("assets/brand/chrome.svg");

const html = (ink, muted, rule) => `<!doctype html><html><head><style>
@font-face { font-family: Sora; font-weight: 700; src: url(${url(`${fonts}/sora/files/sora-latin-700-normal.woff2`)}); }
@font-face { font-family: Sora; font-weight: 600; src: url(${url(`${fonts}/sora/files/sora-latin-600-normal.woff2`)}); }
@font-face { font-family: Inter; font-weight: 500; src: url(${url(`${fonts}/inter/files/inter-latin-500-normal.woff2`)}); }
html, body { margin: 0; background: transparent; }
.lockup { display: inline-flex; align-items: center; gap: 40px; padding: 40px 56px; background: #06080B; border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); }
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
await page.setContent(html("#FFFFFF", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.16)"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator(".lockup").screenshot({ path: path.join(root, "assets/brand/lockup.png"), omitBackground: true });
console.log("assets/brand/lockup.png");

// The README's download button: mint like the product page's primary action, with the Chrome mark.
await page.setContent(`<!doctype html><html><head><style>
@font-face { font-family: Sora; font-weight: 600; src: url(${url(`${fonts}/sora/files/sora-latin-600-normal.woff2`)}); }
html, body { margin: 0; background: transparent; }
.button { display: inline-flex; align-items: center; gap: 14px; padding: 18px 30px 18px 22px; border-radius: 16px; background: #00FFA7; }
.button img { width: 34px; height: 34px; display: block; filter: drop-shadow(0 0 0.5px rgba(0,0,0,0.25)); }
.button span { font: 600 26px/1 Sora; letter-spacing: -0.01em; color: #06080B; }
</style></head><body><div class="button"><img src="${chrome}" alt=""><span>Download for Chrome</span></div></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator(".button").screenshot({ path: path.join(root, "assets/brand/download-chrome.png"), omitBackground: true });
console.log("assets/brand/download-chrome.png");
await browser.close();
