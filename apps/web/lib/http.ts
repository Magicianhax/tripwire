import { z } from "zod";
import { byokKey, resolveInstall } from "./install";
import { withRequestContext } from "./request-context";
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
    // Authorization carries the install token; X-Nansen-Key carries a key the user supplied
    // themselves. Both are set by the extension, so both have to survive preflight.
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nansen-Key",
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

const UNIDENTIFIED = (req: Request) =>
  json(req, { error: "install", message: "Unknown or missing install token" }, 401);

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
      if (e instanceof Unidentified) return UNIDENTIFIED(req);
      if (e instanceof PremiumDisabled) return json(req, { error: "premium_disabled", message: e.message }, 403);
      if (e instanceof BudgetExceeded) return json(req, { error: "budget", scope: e.scope, message: e.message }, 429);
      if (e instanceof NansenError) return json(req, { error: "nansen", status: e.status, message: e.message }, 502);
      console.error("[tripwire]", e);
      return json(req, { error: "internal", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  };
}

/**
 * A route that acts on behalf of one install.
 *
 * Every route that reads or writes personal state — rules, history, overrides, wallet links — or
 * spends credits has to know whose they are, and the way to make that impossible to forget is to
 * make the install an argument the handler cannot run without. Self-hosted, `resolveInstall`
 * answers the sentinel id and nothing changes; hosted, an unrecognised token is a 401 the
 * extension answers by minting a new one, which costs the user nothing because tokens are
 * disposable by design.
 */
export function installRoute<S extends z.ZodType>(
  schema: S | null,
  fn: (req: Request, body: z.infer<S>, install: string) => Promise<unknown>,
): Handler {
  return route(schema, async (req, body) => {
    const install = resolveInstall(req.headers);
    if (install === null) throw new Unidentified();
    return withRequestContext({ install, userKey: byokKey(req.headers) }, () => fn(req, body, install));
  });
}

/** Thrown by {@link installRoute} when a hosted request presents no install we recognise. */
export class Unidentified extends Error {
  constructor() {
    super("Unknown or missing install token");
  }
}
