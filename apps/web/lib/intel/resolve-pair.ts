import { ChainSchema, isEvmAddress, SpotTargetSchema, type Chain, type SpotTarget } from "@tripwire/core";
import { z } from "zod";

export const ResolvePairRequestSchema = z.object({
  chain: ChainSchema,
  pairAddress: z.string().min(32).max(66),
}).refine(({ chain, pairAddress }) => chain === "solana"
  ? /^[a-zA-Z0-9]{32,44}$/.test(pairAddress)
  : isEvmAddress(pairAddress) || /^0x[0-9a-fA-F]{64}$/.test(pairAddress), "invalid pair identifier");

type PairRequest = z.infer<typeof ResolvePairRequestSchema>;
const pairSchema = z.object({
  chainId: z.string(),
  pairAddress: z.string(),
  baseToken: z.object({ address: z.string(), symbol: z.string().optional() }),
});
const responseSchema = z.object({ pairs: z.array(pairSchema).nullable() });
const dexChain = (chain: Chain) => chain === "bnb" ? "bsc" : chain;

/** The API's canonical pair IDs are case insensitive, including lowercased Solana URLs.
 * Returned mint addresses remain case sensitive and are validated separately. */
export function pairTarget(body: unknown, request: PairRequest): SpotTarget | null {
  const response = responseSchema.safeParse(body);
  if (!response.success) return null;
  const pairs = response.data.pairs?.filter((pair) => pair.chainId === dexChain(request.chain)
    && pair.pairAddress.toLowerCase() === request.pairAddress.toLowerCase()) ?? [];
  if (pairs.length !== 1) return null;
  const base = pairs[0]!.baseToken;
  const parsed = SpotTargetSchema.safeParse({ kind: "spot", chain: request.chain, tokenAddress: base.address,
    ...(base.symbol && base.symbol.length <= 20 ? { symbol: base.symbol } : {}) });
  return parsed.success ? parsed.data : null;
}

/** Fixed public origin, bounded timeout/cache, no page-provided URL or Nansen credit spend. */
export function createPairResolver(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; target: SpotTarget | null }>();
  const pending = new Map<string, Promise<SpotTarget | null>>();
  return async (input: PairRequest): Promise<SpotTarget | null> => {
    const request = ResolvePairRequestSchema.parse(input);
    const key = `${request.chain}/${request.pairAddress.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.target;
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/pairs/${dexChain(request.chain)}/${request.pairAddress}`, {
        signal: AbortSignal.timeout(8_000), redirect: "error",
      });
      if (!response.ok) throw new Error(`Pair lookup unavailable (${response.status})`);
      const target = pairTarget(await response.json(), request);
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + (target ? 300_000 : 15_000), target });
      return target;
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}

export const resolvePair = createPairResolver();
