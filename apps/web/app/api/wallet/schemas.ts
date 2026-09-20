import { isEvmAddress, isSolanaAddress } from "@tripwire/core";
import { z } from "zod";

/**
 * Request schemas for the Round 2.3 wallet-depth routes.
 *
 * They live beside the routes rather than in `@tripwire/core` because nothing outside this
 * folder validates them: the extension only ever sends what `lib/api.ts` builds, and the shapes
 * are one address plus, for the origin call, the wallet's own chain order.
 */

const ResolvedAddress = z
  .string()
  .trim()
  .min(32)
  .max(64)
  .refine((s) => isEvmAddress(s) || isSolanaAddress(s), "invalid address");

/** POST /api/wallet/activity — 1 credit, behind the Activity view's priced button. */
export const WalletActivityRequestSchema = z.object({ address: ResolvedAddress });

/**
 * POST /api/wallet/origin — up to 2 credits.
 *
 * `chains` is the wallet's own chain order, largest value first, because
 * `profiler/address/related-wallets` takes **one** chain and accepts no `"all"` — and the
 * largest chain is frequently one it does not cover (the recorded wallet's is `hyperevm`).
 * The backend picks the largest chain the endpoint actually accepts; sending the list rather
 * than a single chain keeps that one decision in one place.
 */
export const WalletOriginRequestSchema = z.object({
  address: ResolvedAddress,
  chains: z.array(z.string().trim().min(2).max(24)).max(24).optional(),
});

/** POST /api/wallet/counterparties — 5 credits, behind its own priced button. */
export const WalletCounterpartiesRequestSchema = z.object({ address: ResolvedAddress });
