import { WalletLabelsRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { walletLabels } from "@/lib/intel/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * `profiler/labels`: 100 Nansen credits per address. It is never part of a wallet card's own
 * load — only this route reaches it, only when the user presses a button that states the
 * price, and only when the operator has set `NANSEN_ALLOW_PREMIUM=1`. Without the gate,
 * `walletLabels` throws `PremiumDisabled`, which `route()` maps to a 403 that names the switch.
 */
export const POST = route(WalletLabelsRequestSchema, async (_req, body) => walletLabels(body.address));
