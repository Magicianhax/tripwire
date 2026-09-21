import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "wxt";
import { FONT_DIR, FONT_FILES } from "./lib/ui/fonts";
import { TIER1_MATCHES, TIER2_MATCHES, X_MATCHES } from "./lib/venues";

const require = createRequire(import.meta.url);

/**
 * Public key only (base64 SubjectPublicKeyInfo, RSA-2048). It pins the unpacked extension's ID
 * to TRIPWIRE_EXTENSION_ID (packages/core/src/constants.ts) so the backend can allow exactly
 * this extension. The matching private key was never stored: it is not needed to load an
 * unpacked build. Forks: generate your own key and set TRIPWIRE_EXTENSION_ORIGIN on the backend.
 */
export const MANIFEST_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsv3ah800203ryvnP0iPcFNexdVkD1wvFdEaTF88Ap7mW6E6Q66Y7RltLfRAXGD2PVfyiL8zixnrrtVcCdxdUsx8h1oBDGVoPDfzG7662r+4Wg/EIDJcfsCG17Uxc5bLdALB+tpjKyaKr5RrFYuN+iMxSZD5Uk6HxrZGB7ewl5uQRYhLITJkyN0WzO3Kr6qzEBQZLMblGII487o/ctXlobg90KrabgpCv/Lmf6UKUPMV2tovwpjz5xRxqOElMdQKZCi8WFZPxuNEc9YP09JZeiU0dIHka9RsyCaF+TQ7cv88tsmFfPgDa1A5Kp4jwh8XP3KitM5uNGvckMxu7bBgkNwIDAQAB";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tripwire",
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    action: { default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" } },
    key: MANIFEST_PUBLIC_KEY,
    description:
      "Nansen onchain data at the moment of decision: verdicts on X posts, trade blocks on DEX, perp and prediction venues.",
    // `scripting` is what registers the wallet content script for a site the user enables from
    // the popup. `optional_host_permissions` is asked for one origin at a time, at that moment,
    // through Chrome's own prompt: Tripwire never requests <all_urls> at install.
    permissions: ["storage", "scripting", "activeTab"],
    optional_host_permissions: ["*://*/*"],
    // The hosted backend (HOSTED_BACKEND_URL in @tripwire/core; a literal here because the
    // manifest is static, and changing it means a release), plus loopback for self-hosters.
    host_permissions: ["https://tripwire.magician.wtf/*", "http://127.0.0.1:3000/*", "http://localhost:3000/*"],
    // Packaged fonts (registered once per host page by lib/ui/fonts.ts) and bundled brand logos
    // (public/logos, rendered via <img src> in the shadow UI). Only on the pages content scripts run on.
    web_accessible_resources: [
      { resources: [`${FONT_DIR}/*.woff2`, "logos/*"], matches: [...X_MATCHES, ...TIER1_MATCHES, ...TIER2_MATCHES] },
      // The wallet lens can be enabled on any site the user grants, and its card needs the same
      // fonts and brand marks there. `use_dynamic_url` keeps the extension's id out of reach of
      // a page that was never granted anything: the URL is per-session, so an arbitrary site
      // cannot probe for a fixed chrome-extension:// resource to detect Tripwire.
      { resources: [`${FONT_DIR}/*.woff2`, "logos/*"], matches: ["*://*/*"], use_dynamic_url: true },
    ],
  },
  hooks: {
    // Copy only the woff2 subsets fonts.ts declares, straight from the @fontsource packages.
    "build:publicAssets": (_wxt, files) => {
      for (const font of FONT_FILES) {
        const pkgDir = path.dirname(require.resolve(`${font.pkg}/package.json`));
        files.push({ absoluteSrc: path.join(pkgDir, "files", font.file), relativeDest: `${FONT_DIR}/${font.file}` });
      }
    },
  },
});
