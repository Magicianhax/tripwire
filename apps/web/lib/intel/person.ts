import type { SpotTarget } from "@tripwire/core";
import { nansen } from "../nansen/endpoints";

export type PersonIntel = {
  entity: string | null;
  tags: string[];
  holding: { valueUsd: number; symbol: string | null } | null;
  topHoldings: { symbol: string; chain: string; valueUsd: number }[];
  matchedBy: "displayName" | "handle" | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * X account -> Nansen entity, only on an exact (normalized) match of the display name (emoji
 * stripped) or the handle. Search is free; nothing else is looked up for an unmatched account.
 */
export async function matchNansenEntity(input: { handle: string; displayName: string }): Promise<{ name: string; tags: string[]; matchedBy: "displayName" | "handle" } | null> {
  const name = input.displayName.replace(/\p{Extended_Pictographic}/gu, "").trim();
  const queries: [string, "displayName" | "handle"][] = [[name, "displayName"]];
  if (norm(input.handle) !== norm(name)) queries.push([input.handle, "handle"]);

  for (const [q, by] of queries) {
    if (norm(q).length < 3) continue;
    const { data } = await nansen.searchGeneral(q, "entity", 10);
    const match = (data.entities ?? []).find((e) => norm(e.name) === norm(q));
    if (match) return { name: match.name, tags: match.tags ?? [], matchedBy: by };
  }
  return null;
}

/**
 * X account -> Nansen entity, only on an exact (normalized) name match.
 * We never guess wallets for unlabeled accounts.
 */
export async function buildPersonIntel(input: { handle: string; displayName: string; target?: SpotTarget }): Promise<PersonIntel> {
  const empty: PersonIntel = { entity: null, tags: [], holding: null, topHoldings: [], matchedBy: null };
  const match = await matchNansenEntity(input);
  if (!match) return empty;

  const balances = await nansen.entityBalances(match.name);
  const rows = balances.data.data ?? [];
  const addr = input.target?.tokenAddress;
  const same = (a: string) => (addr ? (input.target!.chain === "solana" ? a === addr : a.toLowerCase() === addr.toLowerCase()) : false);
  const held = addr ? rows.filter((r) => same(r.token_address)) : [];
  const topHoldings = rows
    .filter((r) => (r.value_usd ?? 0) > 0)
    .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0))
    .slice(0, 5)
    .map((r) => ({ symbol: r.token_symbol, chain: r.chain, valueUsd: r.value_usd ?? 0 }));

  return {
    entity: match.name,
    tags: match.tags,
    holding: addr ? { valueUsd: held.reduce((s, r) => s + (r.value_usd ?? 0), 0), symbol: held[0]?.token_symbol ?? null } : null,
    topHoldings,
    matchedBy: match.matchedBy,
  };
}
