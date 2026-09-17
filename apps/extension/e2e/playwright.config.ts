import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { E2E_PORT } from "./port";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

/**
 * Real-browser smoke: the built extension (apps/extension/.output/chrome-mv3) in Playwright's
 * bundled Chromium, against the built backend in replay mode with a throwaway database. Run via
 * `pnpm verify:e2e`, which builds both first. The backend listens on 127.0.0.1:3000 (the port
 * host_permissions pin) unless TRIPWIRE_E2E_PORT names another free port, in which case the
 * fixtures point the extension at it before any page loads. `reuseExistingServer: false` makes
 * the run fail fast, without touching anything, if the port is already taken.
 */
export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: `pnpm -F web exec next start -H 127.0.0.1 -p ${E2E_PORT}`,
    cwd: repoRoot,
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      TRIPWIRE_REPLAY: "1",
      TRIPWIRE_PORT: E2E_PORT,
      TRIPWIRE_DB: path.join(mkdtempSync(path.join(os.tmpdir(), "tripwire-e2e-")), "e2e.db"),
    },
  },
});
