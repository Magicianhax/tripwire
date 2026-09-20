/**
 * Readout logic for the spot card's **depth** sections (Round 1.6 and Round 2.1): the trade tape,
 * the winners leaderboard, the holder change columns, the transfer list and the batched
 * token-screener enrichment.
 *
 * Nothing here fetches and nothing here feeds a verdict. These are the small decisions about what
 * an already-bought field *means* — which side of the post a trade falls on, whether "still
 * holding" is a claim the sample can support — that would otherwise be made inline in a `.tsx`
 * file where neither the web nor the extension suite can reach them.
 */

// --- The labelled trade tape (2.1) ------------------------------------------------------------

/**
 * The floor an **unlabelled** trade has to clear to earn a line.
 *
 * Measured on the recorded WIF page: 100 trades spanning fourteen minutes, values from $0.00 to
 * $325.40, 53 of them carrying a Nansen label. A tape with no floor is dust and MEV; a tape with
 * a floor and no exception drops exactly the labelled wallets the cross-reference exists for. So
 * the floor applies to unlabelled rows only, and the card says so.
 */
export const TAPE_MIN_USD = 100;

/** How many rows of the tape reach the card. `per_page` is not priced; bridge payload is. */
export const TAPE_ROWS = 40;

export type TapeRow = {
  timestampIso: string;
  address: string | null;
  label: string | null;
  /** Nansen's own word for the side ("BUY" / "SELL"), normalised in case, or null. */
  action: "buy" | "sell" | null;
  valueUsd: number | null;
  tokenAmount: number | null;
  priceUsd: number | null;
  txHash: string | null;
  /** The other leg of the swap ("SOL"), for the row's second line. */
  counterSymbol: string | null;
};

/** A labelled wallet's trade is the evidence, whatever its size; everything else clears a floor. */
export function tapeKeepsRow(label: string | null, valueUsd: number | null, minUsd = TAPE_MIN_USD): boolean {
  if (typeof label === "string" && label.trim() !== "") return true;
  return typeof valueUsd === "number" && Number.isFinite(valueUsd) && valueUsd >= minUsd;
}

/**
 * Where the post-time divider goes in a **newest-first** tape, or why there is none.
 *
 * This is the one part of the tape that can state something false. The fetched page is "the N
 * most recent trades", not "every trade since the post": on a liquid token 100 rows covered
 * fourteen minutes, so a post from yesterday is simply outside the window. Drawing a divider at
 * the end of that list would say "everything below here happened before the post", which is true,
 * while silently implying the list is everything that happened after it.
 *
 * `index` is the number of rows that are **newer** than the post; the divider draws above the row
 * at that index. It is only ever returned when the post time genuinely falls inside the window.
 */
export type TapeDivider =
  | { kind: "inside"; index: number }
  | { kind: "no-post" }
  | { kind: "older-than-window" }
  | { kind: "newer-than-window" }
  | { kind: "empty" };

export function tapeDivider(rows: readonly { timestampIso: string }[], postTimeIso: string | null | undefined): TapeDivider {
  if (rows.length === 0) return { kind: "empty" };
  if (typeof postTimeIso !== "string" || postTimeIso.trim() === "") return { kind: "no-post" };
  const post = Date.parse(postTimeIso);
  if (!Number.isFinite(post)) return { kind: "no-post" };
  const times = rows.map((r) => Date.parse(r.timestampIso)).filter((t) => Number.isFinite(t));
  if (times.length === 0) return { kind: "empty" };
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  // Strictly outside: a post at or past the newest trade has nothing after it to show, and a post
  // before the oldest trade means the window starts after the post and cannot bracket it.
  if (post >= newest) return { kind: "newer-than-window" };
  if (post <= oldest) return { kind: "older-than-window" };
  let index = 0;
  for (const row of rows) {
    const t = Date.parse(row.timestampIso);
    if (Number.isFinite(t) && t > post) index += 1;
    else break;
  }
  return { kind: "inside", index };
}

/** The real span of a fetched tape, which is what the card states — never the window requested. */
export function tapeSpan(rows: readonly { timestampIso: string }[]): { fromIso: string; toIso: string } | null {
  const times = rows.map((r) => Date.parse(r.timestampIso)).filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return { fromIso: new Date(Math.min(...times)).toISOString(), toIso: new Date(Math.max(...times)).toISOString() };
}

// --- The winners leaderboard (2.1) ------------------------------------------------------------

export type WinnerHoldingRow = {
  /** Nansen's `still_holding_balance_ratio`: 1 means the wallet still holds its whole peak. */
  stillHoldingRatio: number | null;
  /** `max_balance_held_usd`: what the position was worth at its largest, the natural weight. */
  peakUsd: number | null;
};

export type StillHoldingSummary = {
  /** Share of the sampled peak money still held, 0-100. */
  pct: number;
  /** The USD the share is measured over, so the sentence can name its own denominator. */
  weightUsd: number;
  /** How many rows carried both a ratio and a weight. */
  counted: number;
};

/**
 * "Have the winners already sold?", weighted by position size.
 *
 * Unweighted this sentence is dominated by the tail: in the recorded page ten of twenty rows have
 * a ratio of exactly 1.0 and realized nothing at all — wallets that bought once and never sold,
 * whose `max_balance_held_usd` is a fraction of the top row's. Weighting by peak position value
 * makes the figure describe the money rather than the row count.
 *
 * Returns null when nothing in the sample carries both numbers: an unweighted average would be a
 * different statistic wearing the same sentence.
 */
export function stillHoldingSummary(rows: readonly WinnerHoldingRow[]): StillHoldingSummary | null {
  let weightUsd = 0;
  let held = 0;
  let counted = 0;
  for (const r of rows) {
    const ratio = r.stillHoldingRatio;
    const peak = r.peakUsd;
    if (typeof ratio !== "number" || !Number.isFinite(ratio)) continue;
    if (typeof peak !== "number" || !Number.isFinite(peak) || peak <= 0) continue;
    weightUsd += peak;
    held += peak * Math.min(Math.max(ratio, 0), 1);
    counted += 1;
  }
  if (counted === 0 || weightUsd <= 0) return null;
  return { pct: (held / weightUsd) * 100, weightUsd, counted };
}

// --- Holder change columns (2.1) --------------------------------------------------------------

/**
 * A `balance_change_*` column as a percent of the wallet's balance.
 *
 * Nansen reports these as raw token amounts: `+5,614,328` against a `74,200,000` balance is
 * `+8%`, and printed raw beside a USD column it is unreadable. Null balances and a zero balance
 * have no denominator, so they stay dashes rather than becoming an infinity.
 */
export function balanceChangePct(change: number | null | undefined, balance: number | null | undefined): number | null {
  if (typeof change !== "number" || !Number.isFinite(change)) return null;
  if (typeof balance !== "number" || !Number.isFinite(balance) || balance === 0) return null;
  return (change / Math.abs(balance)) * 100;
}

// --- The batched token-screener (1.6.2) -------------------------------------------------------

/** `chains` takes 1 to 5 values per call, and a call is one credit however many tokens it names. */
export const SCREENER_MAX_CHAINS = 5;

/**
 * The catalog's chains, split into the groups that will actually be bought.
 *
 * The price of enriching a catalog is the number of groups, not the number of rows, so the card
 * has to be able to count them *before* it spends anything. Order is preserved and duplicates are
 * folded, so the same catalog always prices the same way.
 */
export function chainGroups(chains: readonly string[], max = SCREENER_MAX_CHAINS): string[][] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of chains) {
    const key = c.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  const groups: string[][] = [];
  for (let i = 0; i < unique.length; i += max) groups.push(unique.slice(i, i + max));
  return groups;
}

/**
 * `price_change` and the two `roi_percent_*` families arrive as fractions (`-0.0735` is `-7.35%`)
 * while Dexscreener's `priceChange` is already a percentage (`-7.66`). Two sources, two
 * conventions, one card: every conversion goes through here so neither can be printed as the
 * other by a hundredfold.
 */
export function fractionToPct(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value * 100 : null;
}

/** The key a catalog row and a screener row are matched on. EVM addresses case-fold; Solana's
 * base58 does not, so it is compared exactly and a case difference is simply a miss. */
export function screenerKey(chain: string, address: string): string {
  const addr = /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : address;
  return `${chain.trim().toLowerCase()}:${addr}`;
}
