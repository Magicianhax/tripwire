"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readFragmentToken } from "../_lib/fragment-token";

type Load<T> = { kind: "loading" } | { kind: "no-token" } | { kind: "error"; message: string } | { kind: "ready"; data: T; token: string };

/**
 * The hosted version of a personal page: nothing is rendered on the server, because the server
 * cannot know whose page it is. The extension opens the page with the install token in the
 * fragment; this reads it, fetches the page's data as that install, and renders the same view the
 * self-hosted server render uses.
 */
export function HostedGate<T>({
  tokenName,
  path,
  noToken,
  children,
}: {
  tokenName: string;
  path: string;
  noToken: string;
  children: (data: T, token: string) => ReactNode;
}) {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });

  useEffect(() => {
    const token = readFragmentToken(tokenName);
    if (!token) {
      setState({ kind: "no-token" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setState({ kind: "no-token" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: `Couldn't load this page (${res.status}).` });
          return;
        }
        setState({ kind: "ready", data: (await res.json()) as T, token });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Couldn't reach Tripwire. Try again in a moment." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenName, path]);

  if (state.kind === "ready") return <>{children(state.data, state.token)}</>;
  return (
    <section className="tw-section" aria-busy={state.kind === "loading"}>
      <p className="tw-empty">{state.kind === "loading" ? "Loading…" : state.kind === "no-token" ? noToken : state.message}</p>
    </section>
  );
}
