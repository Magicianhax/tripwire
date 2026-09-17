import { chainLogo, type Target } from "@tripwire/core";

/** first4…last4, matching the extension's compact address display. */
function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** Human label for a Target, per DESIGN.md's target-label rules. */
export function targetLabel(t: Target): string {
  switch (t.kind) {
    case "spot": {
      const base = t.symbol ?? shortAddress(t.tokenAddress);
      return `${base} on ${chainLogo(t.chain)?.name ?? t.chain}`;
    }
    case "perp":
      return t.side ? `${t.coin} ${t.side}` : t.coin;
    case "prediction": {
      const slug = t.slug.length > 40 ? `${t.slug.slice(0, 40)}…` : t.slug;
      return t.outcome ? `${slug}, ${t.outcome}` : slug;
    }
  }
}

export type LabelPart = { text: string; mono: boolean; chain?: string };

/** The same label split by face: addresses in mono, words (symbols, chains, sides, slugs) in the
 * UI face; the chain part names its chain so it can carry the chain logo. Joining the parts'
 * text gives `targetLabel`. */
export function targetParts(t: Target): LabelPart[] {
  if (t.kind === "spot") {
    return [
      t.symbol ? { text: t.symbol, mono: false } : { text: shortAddress(t.tokenAddress), mono: true },
      { text: " on ", mono: false },
      { text: chainLogo(t.chain)?.name ?? t.chain, mono: false, chain: t.chain },
    ];
  }
  return [{ text: targetLabel(t), mono: false }];
}

export function targetPartsFromJson(raw: string): LabelPart[] {
  try {
    return targetParts(JSON.parse(raw) as Target);
  } catch {
    return [{ text: raw, mono: false }];
  }
}

/** checks/overrides store `target` as a JSON string; render it defensively. */
export function targetLabelFromJson(raw: string): string {
  try {
    return targetLabel(JSON.parse(raw) as Target);
  } catch {
    return raw;
  }
}
