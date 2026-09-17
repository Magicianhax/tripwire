import { isEvmAddress, isSolanaAddress } from "./addresses";
import type { Chain } from "./types";

/**
 * Wallet-lens detection: finding a wallet somebody shared, wherever they shared it.
 *
 * Two surfaces, both pure so they can be tested without a DOM:
 * - `detectInText` walks a string (a text node's data) and returns every address or name it
 *   contains with the offsets needed to mark it in place.
 * - `detectInHref` reads an absolute URL and returns the wallet it points at, for the many
 *   places a wallet appears only as a link (`etherscan.io/address/0x…`).
 *
 * The bar is the same in both: a false positive costs the user a marker on a transaction hash
 * and a wasted lookup, so every rule here is whole-token and shape-checked.
 */

export type WalletRefKind = "evm" | "solana" | "ens" | "sns";

export type WalletRef = {
  kind: WalletRefKind;
  /** What `POST /api/wallet` is asked to resolve: an address, or a name to resolve first. */
  query: string;
  /** Where the reference was found, when the source says which chain it means. */
  chainHint?: Chain;
};

/** A ref found inside a string, with the slice it occupies. */
export type TextHit = WalletRef & { start: number; end: number };

/**
 * One pass over a text node.
 *
 * - `0x` + 40 hex, case-insensitive (checksum-tolerant). The trailing lookahead rejects a
 *   32-byte transaction hash, which is `0x` + 64 hex and would otherwise match its first 40.
 * - base58, 32–44 chars, for Solana. The digit/letter mix rule from `addresses.ts` keeps long
 *   plain words out.
 * - A name ending in `.eth` (ENS) or `.sol` (SNS), subdomains included.
 *
 * Every branch is anchored on both sides so only a whole token matches: `0x` in prose, an
 * address glued to a word, and `foo.ethereum.org` all fail.
 */
const TEXT_RE =
  /(?<![\w.$-])(?:0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|[1-9A-HJ-NP-Za-km-z]{32,44}|(?:[A-Za-z0-9][A-Za-z0-9-]*\.)*[A-Za-z0-9][A-Za-z0-9-]{1,62}\.(?:eth|sol))(?![\w-])/g;

const NAME_RE = /^(?:[a-z0-9][a-z0-9-]*\.)*[a-z0-9][a-z0-9-]{1,62}\.(eth|sol)$/;

/** The shape a matched token really is, or null when it only looked like one. */
export function classify(token: string): WalletRef | null {
  if (isEvmAddress(token)) return { kind: "evm", query: token };
  const lower = token.toLowerCase();
  const name = NAME_RE.exec(lower);
  if (name) return name[1] === "eth" ? { kind: "ens", query: lower } : { kind: "sns", query: lower };
  // Same rule as extractTokens: base58 alone matches long ordinary words.
  if (isSolanaAddress(token) && /\d/.test(token) && /[A-Za-z]/.test(token)) return { kind: "solana", query: token };
  return null;
}

export function detectInText(text: string): TextHit[] {
  const hits: TextHit[] = [];
  for (const m of text.matchAll(TEXT_RE)) {
    const ref = classify(m[0]);
    if (ref) hits.push({ ...ref, start: m.index, end: m.index + m[0].length });
  }
  return hits;
}

type HrefRule = {
  /** Matched against the hostname with any leading `www.` removed: exact, or a dot-suffix. */
  hosts: string[];
  /** A path segment that means "the next address-shaped segment is a wallet". */
  segments?: string[];
  /** A query parameter whose value is a wallet address. */
  params?: string[];
  chainHint?: Chain;
};

/**
 * Where a link says "this is a wallet". Only these hosts are read, and only through a segment
 * or parameter that names an account — so `etherscan.io/token/0x…`, which is a contract, is
 * never marked as somebody's wallet.
 */
const HREF_RULES: HrefRule[] = [
  // Most specific host first: `optimistic.etherscan.io` is a subdomain of `etherscan.io`, and
  // the first matching rule wins.
  { hosts: ["optimistic.etherscan.io"], segments: ["address"], chainHint: "optimism" },
  { hosts: ["etherscan.io"], segments: ["address"], chainHint: "ethereum" },
  { hosts: ["basescan.org"], segments: ["address"], chainHint: "base" },
  { hosts: ["arbiscan.io"], segments: ["address"], chainHint: "arbitrum" },
  { hosts: ["bscscan.com"], segments: ["address"], chainHint: "bnb" },
  { hosts: ["polygonscan.com"], segments: ["address"], chainHint: "polygon" },
  { hosts: ["snowtrace.io"], segments: ["address"], chainHint: "avalanche" },
  { hosts: ["solscan.io", "solana.fm", "xray.helius.dev"], segments: ["account", "address"], chainHint: "solana" },
  { hosts: ["polymarket.com"], segments: ["profile"], params: ["address"] },
  { hosts: ["hypurrscan.io"], segments: ["address"] },
  { hosts: ["app.hyperliquid.xyz"], segments: ["address"] },
  { hosts: ["debank.com"], segments: ["profile"] },
  { hosts: ["dexscreener.com"], segments: ["maker"] },
  { hosts: ["pendle.finance", "app.pendle.finance"], segments: ["dashboard", "address"], params: ["address"] },
];

const hostMatches = (host: string, rule: HrefRule) => rule.hosts.some((h) => host === h || host.endsWith(`.${h}`));

/** The wallet an absolute URL points at, or null. `href` must already be absolute. */
export function detectInHref(href: string): WalletRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const rule = HREF_RULES.find((r) => hostMatches(host, r));
  if (!rule) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  for (const [i, segment] of segments.entries()) {
    if (!rule.segments?.includes(segment.toLowerCase())) continue;
    const ref = classify(segments[i + 1] ?? "");
    if (ref && ref.kind !== "sns") return withHint(ref, rule);
  }
  for (const param of rule.params ?? []) {
    const ref = classify(url.searchParams.get(param) ?? "");
    if (ref && ref.kind !== "sns") return withHint(ref, rule);
  }
  return null;
}

function withHint(ref: WalletRef, rule: HrefRule): WalletRef {
  const chainHint = rule.chainHint ?? (ref.kind === "solana" ? "solana" : undefined);
  return chainHint ? { ...ref, chainHint } : ref;
}

/** At most this many wallet markers live on one page; the oldest are recycled past it. */
export const MAX_WALLET_MARKERS = 40;

/** A stable identity for a ref, so the same wallet is marked once however it was written. */
export const walletKey = (ref: WalletRef): string => `${ref.kind}:${ref.query.toLowerCase()}`;

/**
 * The markers a page should keep: newest first, one per wallet, capped. Returns both what to
 * keep and what to drop, so the caller unmounts exactly the surplus.
 */
export function capMarkers<T extends { ref: WalletRef }>(existing: T[], max = MAX_WALLET_MARKERS): { keep: T[]; drop: T[] } {
  const keep: T[] = [];
  const drop: T[] = [];
  const seen = new Set<string>();
  // Oldest first in `existing`; walk from the newest so the oldest duplicate/surplus is dropped.
  for (let i = existing.length - 1; i >= 0; i--) {
    const item = existing[i]!;
    const key = walletKey(item.ref);
    if (seen.has(key) || keep.length >= max) drop.push(item);
    else {
      seen.add(key);
      keep.push(item);
    }
  }
  return { keep: keep.reverse(), drop };
}
