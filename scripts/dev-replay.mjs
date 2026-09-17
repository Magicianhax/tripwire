#!/usr/bin/env node
/**
 * Cross-platform `TRIPWIRE_REPLAY=1 pnpm -F web dev`: starts the backend in replay mode
 * (recorded fixtures/nansen responses, no network, no key needed) on any shell, including
 * PowerShell and cmd. Usage: `pnpm dev:replay`.
 */
import { spawn } from "node:child_process";

const child = spawn("pnpm", ["-F", "web", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, TRIPWIRE_REPLAY: "1" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
