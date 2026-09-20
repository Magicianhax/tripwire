import { WalletDefiRequestSchema } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import { buildWalletDefi } from "@/lib/intel/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 1.5.6 + 1.5.1: `portfolio/defi-holdings` and `profiler/dex-trades`, **2 Nansen credits**.
 *
 * Never part of a wallet card's own load. The Summary view draws a button that states the
 * price, and only a press reaches this route — the Segmented control that switches views must
 * not spend, or an arrow-key pass across three segments would buy three answers.
 */
export const POST = route(WalletDefiRequestSchema, async (_req, body) => buildWalletDefi(body.address, body.chain));
