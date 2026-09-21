import { installRoute, preflight } from "@/lib/http";
import { isHosted } from "@/lib/install";
import { creditsToday, globalCap, installCap, isReplay } from "@/lib/nansen/client";
import { resolveApiKey } from "@/lib/nansen/key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Never exports a key value. Hosted, `creditsToday`/`cap` describe this install's own allowance,
 * the number a user can act on; the backend's total spend is not theirs to see.
 */
export const GET = installRoute(null, async (_req, _body, install) => {
  const { source } = resolveApiKey();
  const hosted = isHosted();
  return {
    ok: true,
    hosted,
    keySource: source,
    replay: isReplay(),
    creditsToday: hosted ? creditsToday(install) : creditsToday(),
    cap: hosted ? installCap() : globalCap(),
  };
});
