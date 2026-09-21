import { preflight, route } from "@/lib/http";
import { isHosted, mintInstall, MintRefused } from "@/lib/install";
import { SELF_HOST_INSTALL } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * The client address for per-IP mint limits: `Fly-Client-IP` only, which Fly's edge sets from the
 * real connection. `X-Forwarded-For` is deliberately not consulted — its leftmost entry is
 * whatever the client wrote, so trusting it would let one script claim a new address per mint.
 */
function clientIp(headers: Headers): string | null {
  return headers.get("fly-client-ip")?.trim() || null;
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
