import { z } from "zod";
import { BudgetExceeded, NansenError, PremiumDisabled } from "./nansen/client";
import { originAllowed, requestAllowed } from "./origin";

export { originAllowed } from "./origin";

const FORBIDDEN = () => Response.json({ error: "origin not allowed" }, { status: 403 });

function allowed(req: Request): boolean {
  return requestAllowed(req.headers, new URL(req.url).host);
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !originAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
}

export function preflight(req: Request) {
  if (!allowed(req)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

type Handler = (req: Request) => Promise<Response>;

/** Host/Origin check (lib/origin.ts) + zod body parsing + uniform error mapping. */
export function route<S extends z.ZodType>(schema: S | null, fn: (req: Request, body: z.infer<S>) => Promise<unknown>): Handler {
  return async (req) => {
    if (!allowed(req)) return FORBIDDEN();
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
      if (e instanceof PremiumDisabled) return json(req, { error: "premium_disabled", message: e.message }, 403);
      if (e instanceof BudgetExceeded) return json(req, { error: "budget", message: e.message }, 429);
      if (e instanceof NansenError) return json(req, { error: "nansen", status: e.status, message: e.message }, 502);
      console.error("[tripwire]", e);
      return json(req, { error: "internal", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  };
}
