import { installRoute, preflight } from "@/lib/http";
import { buildWalletCounterparties } from "@/lib/intel/wallet";
import { WalletCounterpartiesRequestSchema } from "../schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 2.3: `profiler/address/counterparties`, **5 Nansen credits**.
 *
 * The second five-credit call a wallet card can make. It mirrors `/api/wallet/labels` exactly:
 * a button that prints the price, nothing on card open, nothing on a view change.
 */
export const POST = installRoute(WalletCounterpartiesRequestSchema, async (_req, body) => buildWalletCounterparties(body.address));
