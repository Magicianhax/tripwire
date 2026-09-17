import { isSolanaAddress, type Target } from "@tripwire/core";
import { isNativeSymbol, readTokenSymbol, solanaTarget } from "./chains";
import { findButton, findButtons } from "./dom";
import { OVERRIDE_PHRASES, type TargetGap, type VenueAdapter } from "./types";

const PATH_PAIR_RE = /^\/swap\/([^/]+)-([^/]+)$/;
const ANCHOR_RE = /^(swap|place order)$/i;
// Inside the swap <form> only: the logged-out primary reads "Connect" (live check 2026-09-17). The
// header and the positions panel carry their own "Connect" buttons outside the form.
const FORM_ANCHOR_RE = /^(swap|place order|connect|connect wallet)$/i;

/** `jup.ag/swap/<in>-<out>`, or `?sell=&buy=` / `?inputMint=&outputMint=` on `/swap` or the root
 * page -> spot solana (the OUT/buy mint). Live, jup.ag rewrites the path form to `/swap?sell=&buy=`
 * (and currently drops the pair), so the query form is what the page settles on. */
function outMint(url: URL): string | null {
  const pathMatch = PATH_PAIR_RE.exec(url.pathname);
  if (pathMatch) return pathMatch[2] ?? null;
  return url.searchParams.get("buy") ?? url.searchParams.get("outputMint");
}

/** The root page is the swap widget too, but only guard it when the URL names a pair. */
function isRootSwap(url: URL): boolean {
  if (url.pathname !== "/" && url.pathname !== "") return false;
  return url.searchParams.has("buy") || url.searchParams.has("outputMint");
}

/** The swap form's primary action: the last matching button inside a `<form>` that holds an
 * amount input. */
function formAnchor(doc: Document): HTMLButtonElement | null {
  for (const form of doc.querySelectorAll("form")) {
    if (!form.querySelector("input")) continue;
    const buttons = findButtons(form, FORM_ANCHOR_RE);
    if (buttons.length) return buttons[buttons.length - 1]!;
  }
  return null;
}

export const jupiterAdapter: VenueAdapter = {
  id: "jupiter",
  tier: 1,
  match(url) {
    return url.hostname === "jup.ag" && (url.pathname.startsWith("/swap") || isRootSwap(url));
  },
  readTarget(_doc, url): Target | null {
    // jup.ag accepts a mint or a bare symbol in the same slot ("/swap/USDC-SOL"). Only a real
    // mint is a target; a symbol is a gap the caller resolves, and a native coin is neither.
    const out = outMint(url);
    return out && isSolanaAddress(out) ? solanaTarget(out) : null;
  },
  readGap(_doc, url): TargetGap | null {
    const out = outMint(url);
    if (!out || isSolanaAddress(out)) return null;
    const symbol = readTokenSymbol({ textContent: out } as Element);
    if (!symbol) return null;
    return isNativeSymbol(symbol, "solana") ? { kind: "native-asset", symbol } : { kind: "symbol", symbol, chainHint: "solana" };
  },
  anchor(doc) {
    return formAnchor(doc) ?? findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
