import { browser } from "wxt/browser";

/**
 * Whether a card opens anchored beside its trigger or as a centred overlay, remembered per kind
 * of card — the choice is about how much room this *sort* of evidence needs, so someone who
 * always wants perp cards big does not have to say so on every coin.
 *
 * Reading `browser.storage.local` is asynchronous and a card must mount in the same frame as the
 * click, so the whole preference set is warmed once per content script and read back
 * synchronously afterwards. Before the warm-up lands, cards open compact, which is the state
 * they can always be shown in.
 */

export type CardSize = "compact" | "expanded";
/** One entry per kind of card, so "big perp cards" doesn't also mean "big wallet cards". */
export type CardKind = "spot" | "perp" | "prediction" | "wallet" | "badge";

const STORAGE_KEY = "cardSizes";

let cache: Partial<Record<CardKind, CardSize>> = {};
let warmed: Promise<void> | null = null;

function isSize(v: unknown): v is CardSize {
  return v === "compact" || v === "expanded";
}

/** Load the remembered sizes once. Safe to call repeatedly; safe to never resolve. */
export function warmCardSizes(): Promise<void> {
  warmed ??= (async () => {
    try {
      const stored = (await browser.storage.local.get(STORAGE_KEY)) as Record<string, unknown>;
      const raw = stored?.[STORAGE_KEY];
      if (raw && typeof raw === "object") {
        const next: Partial<Record<CardKind, CardSize>> = {};
        for (const [kind, size] of Object.entries(raw as Record<string, unknown>)) if (isSize(size)) next[kind as CardKind] = size;
        cache = next;
      }
    } catch {
      // No storage (a test DOM, a revoked profile): compact is a fine answer.
    }
  })();
  return warmed;
}

/** The remembered size for this kind of card, readable during render. */
export function cardSize(kind: CardKind): CardSize {
  return cache[kind] ?? "compact";
}

/**
 * Remember the user's choice. The in-memory cache is updated first and synchronously, so the
 * re-render that follows the click already reads the new size; the write is fire-and-forget and
 * swallows its own failure. Storage being gone is a lost preference, never a broken card.
 */
export function setCardSize(kind: CardKind, size: CardSize): void {
  cache = { ...cache, [kind]: size };
  try {
    void browser.storage.local.set({ [STORAGE_KEY]: cache }).catch(() => {});
  } catch {
    // No storage in this context (a test DOM, a revoked profile).
  }
}

/** Test helper. */
export function _resetCardSizes(next: Partial<Record<CardKind, CardSize>> = {}): void {
  cache = next;
  warmed = null;
}
