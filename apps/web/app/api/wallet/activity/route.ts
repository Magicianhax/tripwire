import { installRoute, preflight } from "@/lib/http";
import { buildWalletActivity } from "@/lib/intel/wallet";
import { WalletActivityRequestSchema } from "../schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 2.3: `profiler/address/transactions`, **1 Nansen credit**.
 *
 * Never part of a wallet card's own load. The Activity view draws a button that states the
 * price, and only a press reaches this route — switching views is free, because the view
 * switcher is a `radiogroup` and a spend per arrow key is the same trap as a spend per hover.
 */
export const POST = installRoute(WalletActivityRequestSchema, async (_req, body) => buildWalletActivity(body.address));
