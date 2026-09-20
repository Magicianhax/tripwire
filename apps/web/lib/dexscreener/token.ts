import fs from "node:fs";
import path from "node:path";
import { ChainSchema, type Chain } from "@tripwire/core";
import { z } from "zod";
import { isReplay } from "../nansen/client";

/**
 * Dexscreener's **token-keyed** route (Round 1.6.1), which is a different endpoint from the
 * pair-keyed one `lib/intel/resolve-pair.ts` already uses: `/latest/dex/tokens/<address>` answers
 * with every pool the token trades in — 30 of them on the recorded WIF mint, about 25 fields each.
 *
 * Three rules this file exists to enforce:
 *
 * 1. **The body is parsed and discarded here.** The 30-pool answer never crosses the bridge, and
 *    nothing but the small structure below ever reaches the extension (non-negotiable #3).
 * 2. **`boosts`, `info.socials`, `info.websites` and `info.imageUrl` are never read.** Boosts are
 *    bought and socials are submitted by the token team, so rendering them would launder
 *    promotion into intelligence. They are not in the schema, so they cannot leak by accident.
 * 3. **Every figure names its own scope.** Liquidity and price change come from the single
 *    deepest pool; the transaction counts are summed across the pools. Those are different
 *    denominators and the card labels them separately — Nansen's liquidity and Dexscreener's will
 *    disagree, and two numbers under one word would be the lie.
 */

/** Dexscreener spells BNB Chain `bsc`, as the pair resolver already knows. */
const dexChain = (chain: string) => (chain === "bnb" ? "bsc" : chain);

const windowCounts = z.object({ buys: z.number().finite().nonnegative().nullish(), sells: z.number().finite().nonnegative().nullish() }).nullish();

/** Only the market-structure fields. Unknown keys are dropped by zod's default object parsing. */
const pairSchema = z.object({
  chainId: z.string(),
  dexId: z.string().optional(),
  pairAddress: z.string().optional(),
  baseToken: z.object({ address: z.string(), symbol: z.string().optional() }),
  quoteToken: z.object({ address: z.string(), symbol: z.string().optional() }).optional(),
  txns: z.object({ m5: windowCounts, h1: windowCounts, h6: windowCounts, h24: windowCounts }).nullish(),
  priceChange: z.object({ m5: z.number().finite().nullish(), h1: z.number().finite().nullish(), h6: z.number().finite().nullish() }).nullish(),
  liquidity: z.object({ usd: z.number().finite().nonnegative().nullish() }).nullish(),
  /** Epoch milliseconds. Pair age, not token age: a migrated pool reads newer than its token. */
  pairCreatedAt: z.number().finite().nonnegative().nullish(),
});

const responseSchema = z.object({ pairs: z.array(pairSchema).nullable().optional() });

export const TokenMarketRequestSchema = z.object({
  chain: ChainSchema,
  tokenAddress: z.string().min(32).max(64).regex(/^[A-Za-z0-9]+$|^0x[0-9a-fA-F]{40}$/),
});
export type TokenMarketRequest = z.infer<typeof TokenMarketRequestSchema>;

export type TxnCounts = { buys: number | null; sells: number | null };

export type TokenMarketStructure = {
  /** The deepest pool the token trades in: everything single-pool below is measured on this one. */
  pool: {
    dexId: string | null;
    pairAddress: string | null;
    quoteSymbol: string | null;
    liquidityUsd: number | null;
    /** `pairCreatedAt` as an instant. The **pair's** age, which the card says in those words. */
    createdAtIso: string | null;
  } | null;
  /** Percent, as Dexscreener sends it (`-7.66` is `-7.66%`), from the deepest pool. */
  priceChangePct: { m5: number | null; h1: number | null; h6: number | null };
  /** Buys and sells summed across every counted pool: separate trades, so a sum is a count. */
  txns: { m5: TxnCounts; h1: TxnCounts; h6: TxnCounts };
  /** How many pools the sums are over, so the figure can state its own sample. */
  poolCount: number;
  /** Pools where this token is the quote side. Their price and change describe the *other*
   * token, so they are excluded from every figure and only counted here. */
  quoteSidePoolCount: number;
};

/** Case-folds an EVM address; Solana base58 is case-significant and is compared as sent. */
const sameToken = (a: string, b: string) => (/^0x[0-9a-fA-F]{40}$/.test(b) ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Adds two optional counts without inventing a zero: null plus null stays null. */
function addCount(total: number | null, value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return total;
  return (total ?? 0) + value;
}

/**
 * The market structure, from whatever Dexscreener answered. Returns null only when the body is
 * not a Dexscreener response at all; a token with no pools on this chain is a structure with
 * `poolCount: 0`, which the card renders as unchecked rather than as zeroes.
 */
export function parseTokenMarket(body: unknown, request: TokenMarketRequest): TokenMarketStructure | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  const wantedChain = dexChain(request.chain);
  const onChain = (parsed.data.pairs ?? []).filter((p) => p.chainId === wantedChain);
  const mine = onChain.filter((p) => sameToken(p.baseToken.address, request.tokenAddress));
  const quoteSide = onChain.length - mine.length;

  const txns: TokenMarketStructure["txns"] = {
    m5: { buys: null, sells: null },
    h1: { buys: null, sells: null },
    h6: { buys: null, sells: null },
  };
  let deepest: (typeof mine)[number] | null = null;
  for (const pair of mine) {
    for (const w of ["m5", "h1", "h6"] as const) {
      txns[w].buys = addCount(txns[w].buys, pair.txns?.[w]?.buys);
      txns[w].sells = addCount(txns[w].sells, pair.txns?.[w]?.sells);
    }
    const liquidity = pair.liquidity?.usd;
    if (typeof liquidity !== "number" || !Number.isFinite(liquidity)) continue;
    if (deepest === null || liquidity > (deepest.liquidity?.usd ?? -1)) deepest = pair;
  }

  return {
    pool: deepest
      ? {
          dexId: deepest.dexId ?? null,
          pairAddress: deepest.pairAddress ?? null,
          quoteSymbol: deepest.quoteToken?.symbol ?? null,
          liquidityUsd: deepest.liquidity?.usd ?? null,
          createdAtIso:
            typeof deepest.pairCreatedAt === "number" && deepest.pairCreatedAt > 0 ? new Date(deepest.pairCreatedAt).toISOString() : null,
        }
      : null,
    priceChangePct: {
      m5: deepest?.priceChange?.m5 ?? null,
      h1: deepest?.priceChange?.h1 ?? null,
      h6: deepest?.priceChange?.h6 ?? null,
    },
    txns,
    poolCount: mine.length,
    quoteSidePoolCount: quoteSide,
  };
}

/** How long one token's structure is reused. Transaction counts move by the minute; a busy
 * timeline must not turn into one public request per card open per token. */
export const TOKEN_MARKET_TTL_MS = 60_000;
/** A failed lookup is remembered briefly too, so an outage cannot become a request loop. */
const MISS_TTL_MS = 15_000;

/**
 * Replay answers from the recorded body, as everywhere else in this backend.
 *
 * Without this, replay mode — which exists so the product runs with no key, no credits and no
 * network — would still reach out to a third party from the Risk tab, and an offline run would
 * paint a fetch failure over a section that has a perfectly good recording on disk.
 */
function replayBody(): unknown | null {
  const dir = process.env.TRIPWIRE_FIXTURES
    ? path.resolve(process.env.TRIPWIRE_FIXTURES, "..", "dexscreener")
    : path.resolve(process.cwd(), "..", "..", "fixtures", "dexscreener");
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "token.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Fixed public origin, bounded timeout and cache, no page-provided URL, no Nansen credit. The
 * same discipline as `createPairResolver`, because it is the same third party. */
export function createTokenMarketResolver(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: TokenMarketStructure | null }>();
  const pending = new Map<string, Promise<TokenMarketStructure | null>>();
  return async (input: TokenMarketRequest): Promise<TokenMarketStructure | null> => {
    const request = TokenMarketRequestSchema.parse(input);
    if (isReplay()) {
      const body = replayBody();
      return body === null ? null : parseTokenMarket(body, request);
    }
    const key = `${request.chain}/${request.tokenAddress}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${request.tokenAddress}`, {
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Dexscreener market lookup unavailable (${response.status})`);
      const value = parseTokenMarket(await response.json(), request);
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + (value ? TOKEN_MARKET_TTL_MS : MISS_TTL_MS), value });
      return value;
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}

export const tokenMarketStructure = createTokenMarketResolver();

/** Re-exported so callers can type a chain without importing core twice. */
export type { Chain };
