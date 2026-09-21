import { installRoute, preflight } from "@/lib/http";
import { getRules, recentChecks, recentOverrides, recentSettingsChanges } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** One install's history, for the hosted /history page. Only ever that install's rows. */
export const GET = installRoute(null, async (_req, _body, install) => ({
  overrides: recentOverrides(install, 50),
  changes: recentSettingsChanges(install, 50),
  checks: recentChecks(install, 50),
  currentRules: getRules(install).rules,
}));
