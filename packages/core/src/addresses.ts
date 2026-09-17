const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isEvmAddress = (s: string) => EVM_RE.test(s);
export const isSolanaAddress = (s: string) => SOL_RE.test(s);

export type ExtractedAddress = { chain: "evm" | "solana"; address: string };

/** Cashtags must start with a letter so "$100" / "$5k" are skipped. */
const CASHTAG_RE = /(?:^|[^\w$])\$([A-Za-z][A-Za-z0-9]{1,14})\b/g;
const WORD_RE = /[A-Za-z0-9]+/g;

export function extractTokens(text: string): {
  cashtags: string[];
  addresses: ExtractedAddress[];
} {
  const cashtags: string[] = [];
  for (const m of text.matchAll(CASHTAG_RE)) {
    const tag = m[1]!.toUpperCase();
    if (!cashtags.includes(tag)) cashtags.push(tag);
  }

  const withoutUrls = text.replace(/https?:\/\/\S+/g, " ");
  const addresses: ExtractedAddress[] = [];
  for (const m of withoutUrls.matchAll(WORD_RE)) {
    const w = m[0];
    let hit: ExtractedAddress | null = null;
    if (isEvmAddress(w)) hit = { chain: "evm", address: w };
    // base58 must mix letters and digits to avoid long plain words
    else if (isSolanaAddress(w) && /\d/.test(w) && /[A-Za-z]/.test(w)) hit = { chain: "solana", address: w };
    if (hit && !addresses.some((a) => a.address === hit!.address)) addresses.push(hit);
  }
  return { cashtags, addresses };
}
