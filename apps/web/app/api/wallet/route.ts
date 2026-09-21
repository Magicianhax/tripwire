import { WalletQuerySchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { buildWalletLens } from "@/lib/intel/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = installRoute(WalletQuerySchema, async (_req, body) => buildWalletLens(body));
