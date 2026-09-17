import { WalletQuerySchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { buildWalletLens } from "@/lib/intel/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = route(WalletQuerySchema, async (_req, body) => buildWalletLens(body));
