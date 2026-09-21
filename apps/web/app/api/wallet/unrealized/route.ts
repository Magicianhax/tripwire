import { WalletUnrealizedRequestSchema } from "@tripwire/core";
import { installRoute, preflight } from "@/lib/http";
import { buildWalletUnrealized } from "@/lib/intel/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 1.5.7: `profiler/address/pnl`, **1 Nansen credit**. Behind the Performance view's
 * priced button, for the same reason as `/api/wallet/defi` — switching views is free.
 */
export const POST = installRoute(WalletUnrealizedRequestSchema, async (_req, body) => buildWalletUnrealized(body.address));
