import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Playwright specs (pnpm verify:e2e) are not unit tests.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Inline WXT so its content-script UI helpers get Vite's import.meta.env (mount.test.tsx
    // exercises createShadowRootUi's real CSS-injection path).
    server: { deps: { inline: ["wxt"] } },
  },
});
