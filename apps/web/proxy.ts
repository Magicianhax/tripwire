import { NextResponse, type NextRequest } from "next/server";
import { hostAllowed } from "./lib/origin";

/**
 * DNS-rebinding defence for every page and API route: a hostile site that re-points its own
 * domain at 127.0.0.1 would send its own Host header, so anything other than
 * 127.0.0.1 / localhost on the backend port is refused before routing. (Next 16's `proxy`
 * file convention, formerly `middleware`.)
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!hostAllowed(host)) return new NextResponse("Host not allowed", { status: 403 });
  return NextResponse.next();
}
