import { createRequire } from "node:module";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const fromNext = createRequire(require.resolve("next/package.json", { paths: [path.join(root, "apps/web")] }));
const sharp = fromNext("sharp");
const source = path.join(root, "assets/brand/tripwire-source.png");
const logoDirs = ["apps/extension/public/logos", "apps/web/public/logos"].map(dir => path.join(root, dir));
const icons = path.join(root, "apps/extension/public/icons");
await mkdir(icons, { recursive: true });
const metadata = await sharp(source).metadata();
if (!metadata.hasAlpha) throw new Error("Tripwire's source must preserve its transparent background.");

// Deterministic size exports of the generated artwork; no redrawing or palette changes.
for (const dir of logoDirs) {
  await sharp(source).resize(256, 256, { fit: "contain" }).png().toFile(path.join(dir, "tripwire.png"));
}
for (const size of [16, 32, 48, 128]) {
  // An opaque dark field preserves contrast in both light and dark browser toolbars.
  await sharp(source).resize(size, size, { fit: "contain" }).flatten({ background: "#0b1611" }).png().toFile(path.join(icons, `icon-${size}.png`));
}
await copyFile(path.join(icons, "icon-32.png"), path.join(root, "apps/web/app/icon.png"));
console.log("Exported transparent Tripwire logo (256px), dark-tile extension icons (16/32/48/128px), and favicon (32px).");
