"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, History, ScrollText, SlidersHorizontal, type LucideIcon } from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Status", icon: Activity },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/ledger", label: "Ledger", icon: ScrollText },
  { href: "/history", label: "History", icon: History },
];

export function NavBar({ replay = false }: { replay?: boolean }) {
  const pathname = usePathname();
  return (
    <header className="tw-nav">
      <div className="tw-container tw-nav-row">
        <div className="tw-nav-brand">
          <Link href="/" className="tw-wordmark">
            Tripwire
          </Link>
          {replay ? (
            <span className="tw-replay-badge" role="status" title="Replay mode: recorded Nansen data, not live">
              <History size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              Replay
            </span>
          ) : null}
        </div>
        <nav aria-label="Pages">
          <ul className="tw-nav-links">
            {LINKS.map((l) => {
              const active = pathname === l.href;
              const I = l.icon;
              return (
                <li key={l.href}>
                  <Link href={l.href} className="tw-nav-link" aria-current={active ? "page" : undefined}>
                    <I size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
