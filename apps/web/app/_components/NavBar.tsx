"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Status" },
  { href: "/rules", label: "Rules" },
  { href: "/ledger", label: "Ledger" },
  { href: "/history", label: "History" },
];

export function NavBar({ replay = false }: { replay?: boolean }) {
  const pathname = usePathname();
  return (
    <header className="tw-nav">
      <div className="tw-container tw-nav-row">
        <div className="tw-nav-brand">
          <Link href="/" className="tw-wordmark">
            TRIPWIRE
          </Link>
          {replay ? (
            <span className="tw-replay-badge" role="status" title="Replay mode: recorded Nansen data, not live">
              Replay
            </span>
          ) : null}
        </div>
        <nav>
          <ul className="tw-nav-links">
            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <li key={l.href}>
                  <Link href={l.href} className="tw-nav-link" aria-current={active ? "page" : undefined}>
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
