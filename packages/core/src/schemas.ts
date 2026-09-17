import { z } from "zod";
import { isEvmAddress, isSolanaAddress } from "./addresses";
import { CHAINS } from "./types";

export const ChainSchema = z.enum(CHAINS);

const tokenAddress = z
  .string()
  .min(32)
  .max(64)
  .refine((s) => isEvmAddress(s) || isSolanaAddress(s), "invalid token address");

export const SpotTargetSchema = z
  .object({ kind: z.literal("spot"), chain: ChainSchema, tokenAddress, symbol: z.string().max(20).optional() })
  .refine((t) => (t.chain === "solana" ? isSolanaAddress(t.tokenAddress) : isEvmAddress(t.tokenAddress)), "address does not match chain");

export const PerpTargetSchema = z.object({
  kind: z.literal("perp"),
  coin: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
  side: z.enum(["long", "short"]).optional(),
});

export const PredictionTargetSchema = z.object({
  kind: z.literal("prediction"),
  slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
  marketId: z.string().regex(/^[A-Za-z0-9x]{1,100}$/).optional(),
  outcome: z.enum(["yes", "no"]).optional(),
});

export const TargetSchema = z.union([SpotTargetSchema, PerpTargetSchema, PredictionTargetSchema]);

export const ResolveRequestSchema = z.object({
  symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,19}$/),
  chainHint: ChainSchema.optional(),
});

export const PostIntelRequestSchema = z.object({
  target: SpotTargetSchema,
  postTimeIso: z.iso.datetime({ offset: true }).optional(),
  mode: z.enum(["chip", "panel"]).default("chip"),
});

export const PersonIntelRequestSchema = z.object({
  handle: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  displayName: z.string().min(1).max(60),
  target: SpotTargetSchema.optional(),
});

export const RuleSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["spot", "perp", "prediction"]),
  signal: z.enum([
    "exit_pressure",
    "fresh_buy_share",
    "sm_netflow_24h",
    "risk_high_count",
    "author_holds_token",
    "sm_opposite_side_pct",
    "inside_liq_band",
    "smart_side_disagrees",
  ]),
  op: z.enum([">", "<", ">=", "<="]),
  threshold: z.number().finite(),
  action: z.enum(["warn", "block"]),
  enabled: z.boolean(),
  text: z.string().max(200),
});

export const RulesPutSchema = z.union([
  z.object({ preset: z.enum(["degen", "balanced", "paranoid"]) }),
  z.object({ rules: z.array(RuleSchema).max(50) }),
]);

export const OverrideRequestSchema = z.object({
  target: TargetSchema,
  verdict: z.enum(["CLEAR", "CAUTION", "TRIPWIRE", "UNCHECKED"]),
  ruleIds: z.array(z.string().max(40)).max(20),
  venue: z.string().max(40),
});
