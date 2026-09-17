import { z } from "zod";
import { BudgetExceeded, NansenError } from "./nansen/client";

const LOCAL_ORIGINS = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);

/**
 * Only the extension and the local pages may call the API. Any other website open in the
 * browser could otherwise hit 127.0.0.1 and spend the user's Nansen credits.
 */
export function originAllowed(origin: string | null): boolean {
  if (!origin) return true; // same-origin navigations, curl
  if (LOCAL_ORIGINS.has(origin)) return true;
  const pinned = process.env.TRIPWIRE_EXTENSION_ORIGIN?.trim();
  if (pinned) return origin === pinned;
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !originAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
}

export function preflight(req: Request) {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

type Handler = (req: Request) => Promise<Response>;

/** Origin check + zod body parsing + uniform error mapping. */
export function route<S extends z.ZodType>(schema: S | null, fn: (req: Request, body: z.infer<S>) => Promise<unknown>): Handler {
  return async (req) => {
    if (!originAllowed(req.headers.get("origin"))) return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403 });
    let body: unknown = undefined;
    if (schema) {
      const raw = await req.json().catch(() => undefined);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return json(req, { error: "invalid request", issues: parsed.error.issues.slice(0, 5) }, 400);
      body = parsed.data;
    }
    try {
      return json(req, await fn(req, body as z.infer<S>));
    } catch (e) {
      if (e instanceof BudgetExceeded) return json(req, { error: "budget", message: e.message }, 429);
      if (e instanceof NansenError) return json(req, { error: "nansen", status: e.status, message: e.message }, 502);
      console.error("[tripwire]", e);
      return json(req, { error: "internal", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  };
}
