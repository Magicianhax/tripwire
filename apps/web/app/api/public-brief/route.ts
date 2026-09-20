import { getPublicBrief } from "../../../lib/public-brief";
import { requestAllowed } from "../../../lib/origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.search) return Response.json({ error: "This snapshot does not accept parameters." }, { status: 400 });
  if (process.env.TRIPWIRE_PUBLIC_SITE !== "1" && !requestAllowed(request.headers, url.host)) return new Response("Forbidden", { status: 403 });
  const brief = await getPublicBrief();
  return Response.json(brief, { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
}
export async function HEAD(request: Request) {
  const url = new URL(request.url);
  if (url.search) return new Response(null, { status: 400 });
  if (process.env.TRIPWIRE_PUBLIC_SITE !== "1" && !requestAllowed(request.headers, url.host)) return new Response(null, { status: 403 });
  return new Response(null, { headers: { "Cache-Control": "public, max-age=60" } });
}
