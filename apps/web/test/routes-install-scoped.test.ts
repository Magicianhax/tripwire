import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * On a hosted backend every route that can spend credits or touch personal state must know whose
 * request it is. A route built on plain `route()` runs as the anonymous self-host install: no
 * token needed, per-install limit bypassed, the user's own key ignored. This pins the list of
 * routes allowed to stay anonymous, each for a stated reason, so a new route cannot quietly join
 * them.
 */
const ANONYMOUS: Record<string, string> = {
  "install/route.ts": "mints the token everyone else needs",
  "ledger/route.ts": "operator-only when hosted, behind TRIPWIRE_OWNER_TOKEN",
  "token-logo/route.ts": "cache-only read (nansenPeek), never spends",
  "public-brief/route.ts": "spends only with TRIPWIRE_PUBLIC_BRIEF_REFRESH=1, never set when hosted",
};

function routeFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p, base);
    return e.name === "route.ts" ? [path.relative(base, p).split(path.sep).join("/")] : [];
  });
}

describe("install-scoped routes", () => {
  const api = path.resolve(__dirname, "..", "app", "api");
  const files = routeFiles(api);

  it.each(files.filter((f) => !(f in ANONYMOUS)))("%s uses installRoute", (f) => {
    expect(fs.readFileSync(path.join(api, f), "utf8")).toMatch(/\binstallRoute\(/);
  });

  it("names only routes that still exist", () => {
    for (const f of Object.keys(ANONYMOUS)) expect(files).toContain(f);
  });
});
