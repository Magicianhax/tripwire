import type { Target } from "@tripwire/core";

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
      return `${base} · ${t.chain}`;
    }
    case "perp":
      return t.side ? `${t.coin} ${t.side}` : t.coin;
    case "prediction": {
      const slug = t.slug.length > 40 ? `${t.slug.slice(0, 40)}…` : t.slug;
      return t.outcome ? `${slug} · ${t.outcome}` : slug;
    }
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
