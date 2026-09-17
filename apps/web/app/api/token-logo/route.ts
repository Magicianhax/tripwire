import { isEvmAddress, isSolanaAddress, CHAINS } from "@tripwire/core";
import { hostAllowed } from "@/lib/origin";
import { LOGO_TTL_MS, tokenLogo } from "@/lib/token-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/token-logo?chain=&address=` — the token's picture, served from this machine.
 *
 * Guarded by the Host check only, not the Origin check every other route uses: a browser sends
 * no `Origin` on an `<img>` subresource and marks it `Sec-Fetch-Site: cross-site`, so the shared
 * guard would reject the one request shape this route exists to answer. That is safe here
 * because the route reads nothing from the request but a chain and an address, spends no Nansen
 * credits, writes nothing, and can only ever return bytes for a logo URL Nansen already gave
 * this backend. The worst a hostile page can learn by embedding it is that Tripwire's backend
 * is running on this machine, which any localhost page can already tell.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!hostAllowed(req.headers.get("host") ?? url.host)) return new Response(null, { status: 403 });

  const chain = url.searchParams.get("chain") ?? "";
  const address = url.searchParams.get("address") ?? "";
  if (!(CHAINS as readonly string[]).includes(chain) || !(isEvmAddress(address) || isSolanaAddress(address))) {
    return Response.json({ error: "invalid request", message: "chain and address are required" }, { status: 400 });
  }

  const result = await tokenLogo(chain, address);
  if (!result.ok) return Response.json({ error: "no_logo", message: result.reason }, { status: result.status });

  return new Response(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.body.byteLength),
      "Cache-Control": `public, max-age=${Math.floor(LOGO_TTL_MS / 1000)}, immutable`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
