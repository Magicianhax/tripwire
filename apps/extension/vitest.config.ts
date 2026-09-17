import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Inline WXT so its content-script UI helpers get Vite's import.meta.env (mount.test.tsx
    // exercises createShadowRootUi's real CSS-injection path).
    server: { deps: { inline: ["wxt"] } },
  },
});
