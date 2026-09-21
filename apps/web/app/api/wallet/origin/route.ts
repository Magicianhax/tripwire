import { installRoute, preflight } from "@/lib/http";
import { buildWalletOrigin } from "@/lib/intel/wallet";
import { WalletOriginRequestSchema } from "../schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Round 2.3: `profiler/address/first-funder` plus `profiler/address/related-wallets`,
 * **up to 2 Nansen credits** — 1 each, and a wallet gets only the calls that can answer for it.
 * A Solana address gets no first-funder lookup (EVM only) and a wallet whose chains are all
 * outside the related-wallets enum gets no related lookup, so the button prices itself as a
 * ceiling and the response reports what was actually spent.
 *
 * Neither answer feeds a signal or a block, and `relation` is carried through verbatim.
 */
export const POST = installRoute(WalletOriginRequestSchema, async (_req, body) => buildWalletOrigin(body.address, body.chains));
