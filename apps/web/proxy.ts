import { NextResponse, type NextRequest } from "next/server";
import { hostAllowed } from "./lib/origin";

/**
 * DNS-rebinding defence for every page and API route: a hostile site that re-points its own
 * domain at our address would send its own Host header, so anything other than the host we
 * serve (127.0.0.1 / localhost on the backend port, or `TRIPWIRE_HOSTED_HOST` when hosted) is
 * refused before routing. (Next 16's `proxy` file convention, formerly `middleware`.)
 */
export function proxy(request: NextRequest) {
  // A marketing deployment is not a shared backend. Deny private routes even when a
  // hosting proxy forwards a loopback Host, and never permit writes through the site.
  if (process.env.TRIPWIRE_PUBLIC_SITE === "1") {
    const path = request.nextUrl.pathname;
    const publicPath = path === "/" || path.startsWith("/_next/static/") || path.startsWith("/logos/") || path.startsWith("/showcase/") || path === "/favicon.ico" || path === "/icon.png";
    if (!publicPath || !["GET", "HEAD"].includes(request.method)) {
      return new NextResponse("Not found", { status: 404 });
    }
    return NextResponse.next();
  }
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!hostAllowed(host)) return new NextResponse("Host not allowed", { status: 403 });
  return NextResponse.next();
}
