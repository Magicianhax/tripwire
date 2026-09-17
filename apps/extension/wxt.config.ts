import { defineConfig } from "wxt";

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
    key: MANIFEST_PUBLIC_KEY,
    description:
      "Nansen onchain data at the moment of decision: verdicts on X posts, trade blocks on DEX, perp and prediction venues.",
    permissions: ["storage"],
    host_permissions: ["http://127.0.0.1:3000/*", "http://localhost:3000/*"],
  },
});
