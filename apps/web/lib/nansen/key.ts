import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type KeySource = "env" | "nansen-cli" | "none";

/**
 * NANSEN_API_KEY from env wins. Otherwise reuse the key saved by `nansen login`
 * (Nansen CLI, ~/.nansen/config.json) so CLI users need zero extra setup.
 * The key value never leaves this module except as the request header.
 */
export function resolveApiKey(): { key: string | null; source: KeySource } {
  const env = process.env.NANSEN_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  try {
    const file = path.join(os.homedir(), ".nansen", "config.json");
    const cfg = JSON.parse(fs.readFileSync(file, "utf8")) as { apiKey?: string };
    if (cfg.apiKey?.trim()) return { key: cfg.apiKey.trim(), source: "nansen-cli" };
  } catch {
    // no CLI config
  }
  return { key: null, source: "none" };
}
