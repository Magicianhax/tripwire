import fs from "node:fs";
import path from "node:path";
import { isReplay } from "../nansen/client";

/**
 * Polymarket's public CLOB, backend-side only.
 *
 * `GET /book?token_id=<clobTokenId>` is unauthenticated, free and — unlike the 1-credit Nansen
 * `prediction-market/orderbook` page it replaces — returns **both sides of one outcome token**,
 * which is what a spread needs (Round 1.2.7).
 *
 * Same discipline as `lib/intel/resolve-pair.ts`: one fixed public origin, an 8s timeout,
 * `redirect: "error"`, a bounded cache and in-flight dedupe so a burst of tab opens is one
 * request. Nothing here touches the Nansen key or the ledger, and the extension never calls it
 * directly.
 */

const ORIGIN = "https://clob.polymarket.com";
const TIMEOUT_MS = 8_000;
const OK_TTL_MS = 30_000;
const FAIL_TTL_MS = 10_000;
const MAX_ENTRIES = 200;

/** Prices and sizes arrive as decimal strings; levels arrive unsorted for our purposes. */
export type ClobLevel = { price: string; size: string };
export type ClobBook = {
  market?: string;
  asset_id?: string;
  timestamp?: string;
  bids?: ClobLevel[];
  asks?: ClobLevel[];
};

/** A CLOB token id is a uint256 in decimal: nothing from a page ever reaches the URL unchecked. */
export const isClobTokenId = (id: string): boolean => /^[0-9]{1,80}$/.test(id);

function replayBook(tokenId: string): ClobBook | null {
  const dir = process.env.TRIPWIRE_FIXTURES ?? path.resolve(process.cwd(), "..", "..", "fixtures", "nansen");
  const file = path.join(dir, "clobBook.json");
  if (!fs.existsSync(file)) return null;
  const books = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, ClobBook>;
  // Replay holds the two books recorded with gammaMarket.json. A token id that is not one of
  // them still answers, so a fixture refresh cannot silently blank the tab.
  return books[tokenId] ?? Object.values(books)[0] ?? null;
}

export type ClobBookReader = ((tokenId: string) => Promise<ClobBook | null>) & { reset: () => void };

export function createClobBookReader(fetchImpl?: typeof fetch): ClobBookReader {
  const cache = new Map<string, { expires: number; book: ClobBook | null }>();
  const pending = new Map<string, Promise<ClobBook | null>>();
  const read = async (tokenId: string): Promise<ClobBook | null> => {
    if (!isClobTokenId(tokenId)) throw new Error("Not a Polymarket CLOB token id");
    if (isReplay()) return replayBook(tokenId);
    const cached = cache.get(tokenId);
    if (cached && cached.expires > Date.now()) return cached.book;
    const existing = pending.get(tokenId);
    if (existing) return existing;
    const task = (async () => {
      // Resolved per call, not captured at module load, so a test's stub is honoured.
      const res = await (fetchImpl ?? fetch)(`${ORIGIN}/book?token_id=${tokenId}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      if (!res.ok) throw new Error(`Polymarket order book unavailable (${res.status})`);
      const book = (await res.json()) as ClobBook;
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(tokenId, { expires: Date.now() + (book ? OK_TTL_MS : FAIL_TTL_MS), book });
      return book;
    })();
    pending.set(tokenId, task);
    try {
      return await task;
    } finally {
      pending.delete(tokenId);
    }
  };
  return Object.assign(read, {
    /** Drops the bounded cache. Tests only: a 30s cache would otherwise leak between cases. */
    reset: () => {
      cache.clear();
      pending.clear();
    },
  });
}

export const clobBook = createClobBookReader();
