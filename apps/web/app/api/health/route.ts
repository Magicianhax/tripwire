import { preflight, route } from "@/lib/http";
import { creditsToday, isReplay } from "@/lib/nansen/client";
import { resolveApiKey } from "@/lib/nansen/key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Mirrors the default in lib/nansen/client.ts; never export the key value itself.
const dailyCap = () => Number(process.env.NANSEN_DAILY_CREDIT_CAP ?? 3000);

export const GET = route(null, async () => {
  const { source } = resolveApiKey();
  return { ok: true, keySource: source, replay: isReplay(), creditsToday: creditsToday(), cap: dailyCap() };
});
