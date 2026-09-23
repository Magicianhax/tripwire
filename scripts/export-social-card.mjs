import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const fromNext = createRequire(require.resolve("next/package.json", { paths: [path.join(root, "apps/web")] }));
const sharp = fromNext("sharp");
const out = path.join(root, "apps/web/public/social");
await mkdir(out, { recursive: true });
// Export the generated artwork without reconstructing its product UI.
await sharp(path.join(root, "assets/brand/tripwire-og-generated.png"))
  .resize(1200, 630, { fit: "contain", background: "#080b0c" })
  .png()
  .toFile(path.join(out, "tripwire-og.png"));
console.log("Exported social/tripwire-og.png (1200 × 630)");
