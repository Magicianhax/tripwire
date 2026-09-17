import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

/**
 * Real-browser smoke: the built extension (apps/extension/.output/chrome-mv3) in Playwright's
 * bundled Chromium, against the built backend on 127.0.0.1:3000 (the port host_permissions
 * pin) in replay mode with a throwaway database. Run via `pnpm verify:e2e`, which builds both
 * first. `reuseExistingServer: false` makes the run fail fast, without touching anything,
 * if port 3000 is already taken.
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
    command: "pnpm -F web start",
    cwd: repoRoot,
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      TRIPWIRE_REPLAY: "1",
      TRIPWIRE_DB: path.join(mkdtempSync(path.join(os.tmpdir(), "tripwire-e2e-")), "e2e.db"),
    },
  },
});
