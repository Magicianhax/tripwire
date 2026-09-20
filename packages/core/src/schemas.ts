import { z } from "zod";
import { isEvmAddress, isSolanaAddress } from "./addresses";
import { CHAINS, SIGNAL_IDS } from "./types";
import { DEPTH_SECTIONS } from "./depth";
import { VIEW_TIMEFRAMES } from "./timeframe";
import { HANDLE_RE, isVenueWalletAddress, normalizeHandle, WALLET_VENUES } from "./curated-wallets";
import { classify } from "./wallet-detect";

export const ChainSchema = z.enum(CHAINS);

/** The card's view window. It drives the flow gauges and the price chart only: the verdict is
 * always computed on VERDICT_TIMEFRAME. */
export const ViewTimeframeSchema = z.enum(VIEW_TIMEFRAMES);

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
  /** Free text off a hostile page, so it is length-capped and control characters are refused.
   * It is only ever compared to the resolved market's own outcome names, never rendered raw
   * into a URL or a query. */
  outcomeLabel: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f]+$/).optional(),
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
  /** Panel mode only: which window the gauges and chart show. Ignored by the verdict. */
  timeframe: ViewTimeframeSchema.optional(),
});

export const PersonIntelRequestSchema = z.object({
  handle: z.string().regex(HANDLE_RE),
  displayName: z.string().min(1).max(60),
  target: SpotTargetSchema.optional(),
});

const linkHandle = z.string().regex(HANDLE_RE).transform(normalizeHandle);
const walletVenue = z.enum(WALLET_VENUES);

/** PUT /api/links: link an X handle to a Hyperliquid account or Polymarket proxy wallet. */
export const WalletLinkSchema = z
  .object({ handle: linkHandle, venue: walletVenue, address: z.string().max(42) })
  .refine((l) => isVenueWalletAddress(l.venue, l.address), { message: "invalid address for venue", path: ["address"] })
  .transform((l) => ({ ...l, address: l.address.toLowerCase() }));

/** DELETE /api/links. */
export const WalletLinkDeleteSchema = z.object({ handle: linkHandle, venue: walletVenue });

/** POST /api/author-badges. */
export const AuthorBadgesRequestSchema = z.object({
  handle: z.string().regex(HANDLE_RE),
  displayName: z.string().min(1).max(60),
});

/**
 * POST /api/wallet. One field, because that is what the user has: whatever string they saw on
 * the page. The detector's own `classify` decides what it is, so the route and the content
 * script can never disagree about what counts as a wallet.
 */
export const WalletQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(4)
    .max(80)
    .refine((s) => classify(s) !== null, "not an address or an ENS/SNS name"),
  chainHint: ChainSchema.optional(),
});

/** POST /api/wallet/labels: the premium, 100-credit label lookup, always on a resolved address. */
export const WalletLabelsRequestSchema = z.object({
  address: z
    .string()
    .trim()
    .min(32)
    .max(64)
    .refine((s) => isEvmAddress(s) || isSolanaAddress(s), "invalid address"),
});

const ResolvedAddressSchema = z
  .string()
  .trim()
  .min(32)
  .max(64)
  .refine((s) => isEvmAddress(s) || isSolanaAddress(s), "invalid address");

/**
 * POST /api/wallet/defi — Round 1.5.1 + 1.5.6. Two credits, and never part of a card's own
 * load: the Summary view draws a button that states the price and only a press gets here.
 * `chain` is the wallet's largest-value chain, because `profiler/dex-trades` has no `"all"`.
 */
export const WalletDefiRequestSchema = z.object({
  address: ResolvedAddressSchema,
  chain: z.string().trim().min(2).max(24).optional(),
});

/** POST /api/wallet/unrealized — Round 1.5.7. One credit, behind the Performance view's button. */
export const WalletUnrealizedRequestSchema = z.object({ address: ResolvedAddressSchema });

/** The perp coin symbol both Round 2.5 routes are keyed by. Hyperliquid's own spelling allows a
 * leading lowercase k ("kPEPE"), so the case is not normalised away here. */
const PerpCoinSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/);

/**
 * POST /api/perp/ladder — Round 2.5. **5 credits**, and never part of a card load or of opening
 * a tab: the Liquidations tab draws the Smart Money ladder the panel already bought, and a
 * button that states the price is the only way here. The cohort is an enum rather than free
 * text, because a rejected request still costs a round trip and a ledger row.
 */
export const PerpLadderRequestSchema = z.object({
  coin: PerpCoinSchema,
  cohort: z.enum(["all_traders", "whale", "public_figure"]),
});

/**
 * POST /api/perp/win-rate — Round 2.5. **1 credit per press.** An explicit click on one
 * leaderboard row, never a hover: the expanded card shows twelve rows, and a hover trigger
 * would be twelve credits from one careless mouse pass.
 */
export const PerpWinRateRequestSchema = z.object({ address: ResolvedAddressSchema });

export const RuleSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["spot", "perp", "prediction"]),
  signal: z.enum(SIGNAL_IDS),
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

export const GuardBodySchema = z.object({
  target: TargetSchema,
  venue: z.string().max(40),
  mode: z.enum(["chip", "panel"]).default("chip"),
  /** Panel mode only: which window the gauges and chart show. Ignored by the verdict. */
  timeframe: ViewTimeframeSchema.optional(),
});

/**
 * POST /api/depth: the card's lazy sections. The card is already on screen when this is asked
 * for, and every section here is either free or explicitly priced in the tab that requests it,
 * so `sections` is a list rather than a mode -- a tab asks for exactly what it draws.
 */
export const DepthRequestSchema = z.object({
  target: TargetSchema,
  sections: z.array(z.enum(DEPTH_SECTIONS)).min(1).max(DEPTH_SECTIONS.length),
  /** The perp chart's window; ignored by every other section. */
  timeframe: ViewTimeframeSchema.optional(),
});

export const OverrideRequestSchema = z.object({
  target: TargetSchema,
  verdict: z.enum(["CLEAR", "CAUTION", "TRIPWIRE", "UNCHECKED"]),
  ruleIds: z.array(z.string().max(40)).max(20),
  venue: z.string().max(40),
});
