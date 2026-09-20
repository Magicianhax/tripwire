import type { PostIntelResponse } from "../api-types";
import type { TokenOrigin } from "./parse";

/** The X chip's text for a failed call. */
export function chipErrorHeadline(status: number, error: string): string {
  if (status === 0) return "Tripwire backend offline";
  if (status === 429) return "Nansen credit cap reached";
  return error || "Tripwire check failed";
}

/** The chip's headline: the first hit's label, or the labeled-exit signal's label when nothing
 * hit (it is always computed, even for CLEAR, so a quiet token still says something). */
export function chipHeadline(data: PostIntelResponse): string {
  const firstHit = data.hits[0];
  if (firstHit) return firstHit.label;
  // UNCHECKED with a known reason, e.g. "Nansen credit cap reached".
  if (data.verdict === "UNCHECKED" && data.headline) return data.headline;
  const labeledExit = data.signals.find((s) => s.id === "labeled_exit_pct");
  return labeledExit?.label ?? "No signal";
}

/** Short names for the places a token can come from, in the chip's one line of room. */
const ORIGIN_LABEL: Record<Exclude<TokenOrigin, "post">, string> = {
  quote: "Quoted post",
  card: "Link preview",
  image: "Image description",
};

/**
 * The chip's value line, prefixed with where the token came from whenever that was not the
 * post's own body. Without it a chip reading "62% of labelled buyers exited" under a post whose
 * author only quoted someone else states a finding about a token they never named.
 */
export function originPrefix(origin: TokenOrigin, finding: string): string {
  if (origin === "post") return finding;
  return `${ORIGIN_LABEL[origin]} · ${finding}`;
}

/**
 * The second chip on a post: named, placed, and costing nothing until it is opened. Short on
 * purpose — the verdict pill beside it already reads UNCHECKED, and the chip has one line.
 */
export function alsoMentioned(origin: TokenOrigin): string {
  return origin === "post" ? "Also mentioned. Open to check." : `${ORIGIN_LABEL[origin]} · open to check.`;
}

/**
 * One sentence for the evidence card, under the finding: what this card is about, and whose
 * words put it there. Returns null for the post's own body, where the author did name it.
 *
 * `name` is the token as the card titles it ("$WIF", or a short contract address). `author` is
 * the outer post's handle; with none, the clause drops rather than printing a bare "@".
 */
export function sourceNote(
  picked: { origin: TokenOrigin; handle: string | null },
  name: string,
  author: string,
): string | null {
  if (picked.origin === "post") return null;
  const whose = author ? `@${author}'s own words` : "the post's own words";
  if (picked.origin === "quote") {
    const by = picked.handle ? ` by @${picked.handle}` : "";
    return `${name} comes from the quoted post${by}, not from ${whose}.`;
  }
  if (picked.origin === "card") {
    return `${name} comes from the link preview, not from ${whose}. A preview's title is set by the site it links to.`;
  }
  return `${name} comes from an image description, not from ${whose}.`;
}
