import { preflight, route } from "@/lib/http";
import { isHosted, mintInstall, MintRefused } from "@/lib/install";
import { SELF_HOST_INSTALL } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * The client address for per-IP mint limits. Behind Fly's proxy the socket peer is the proxy, so
 * the real address is the first hop of `Fly-Client-IP` / `X-Forwarded-For`. Only trusted when
 * hosted: a self-hosted backend never mints and never needs it.
 */
function clientIp(headers: Headers): string | null {
  const fly = headers.get("fly-client-ip")?.trim();
  if (fly) return fly;
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || null;
}

/**
 * Issues an install token. Self-hosted there is one user and no token to issue, so the answer is
 * the sentinel id and the extension carries on exactly as before.
 */
export const POST = route(null, async (req) => {
  if (!isHosted()) return { token: SELF_HOST_INSTALL, hosted: false };
  try {
    return { token: mintInstall(clientIp(req.headers)), hosted: true };
  } catch (e) {
    if (e instanceof MintRefused) return { error: "mint_refused", reason: e.reason };
    throw e;
  }
});
