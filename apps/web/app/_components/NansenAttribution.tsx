import { ArrowUpRight } from "lucide-react";

/** Data-provider attribution, distinct from the Tripwire product identity. */
export function NansenAttribution({ compact = false }: { compact?: boolean }) {
  return <a className="nansen-lockup" data-compact={compact} href="https://app.nansen.ai/" target="_blank" rel="noopener noreferrer">
    <span>Powered by</span><img src="/logos/nansen.svg" alt="" width={32} height={32} /><strong>Nansen</strong><ArrowUpRight size={15} aria-hidden="true" />
  </a>;
}
