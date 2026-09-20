import { useContext, useState } from "react";
import { NANSEN_LOGO, nansenTokenUrl, nansenWalletUrl, pctVol, venueLogo, type WalletRef } from "@tripwire/core";
import { Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CircleAlert, Coins, Sprout, Wallet } from "lucide-react";
import type {
  WalletActivityResponse,
  WalletCounterpartiesResponse,
  WalletDefiResponse,
  WalletLensResponse,
  WalletOriginResponse,
  WalletUnrealizedResponse,
} from "../api-types";
import { pct, shortAddr, timeAgo, usd } from "./format";
import { Icon, LABEL_KIND_ICON } from "./icons";
import { BrandMark, ChainLogo, TokenLogo } from "./Logo";
import { CardHeader, Empty, NansenLink, Problems, Readouts, Section, signOf as sign } from "./panel-parts";
import { PopoverContext } from "./Popover";
import { LoadingAnnouncement, SkeletonSection } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";
import { HyperliquidBody, PolymarketBody } from "./VenueBody";
import { refLabel } from "./WalletMarker";
import { NansenRowLink } from "./NansenRowLink";
import { Segmented } from "./Segmented";
import { AllocationChart, PnlChart, usePagination } from "./DataCharts";
import { useIsExpanded } from "./card-size";

export const PREMIUM_LABEL_CREDITS = 100;
/** `portfolio/defi-holdings` + `profiler/dex-trades`, bought together (Round 1.5.6 + 1.5.1). */
export const WALLET_DEFI_CREDITS = 2;
/** `profiler/address/pnl` (Round 1.5.7). */
export const WALLET_UNREALIZED_CREDITS = 1;
/** `profiler/address/transactions` (Round 2.3). */
export const WALLET_ACTIVITY_CREDITS = 1;
/**
 * `profiler/address/first-funder` + `profiler/address/related-wallets` (Round 2.3), 1 each.
 *
 * A ceiling, not a price: the funder lookup is EVM-only and the related lookup needs a chain
 * that endpoint covers, so a Solana wallet — or an EVM wallet whose only chain is HyperEVM —
 * spends 1. The button says "up to", and the response reports what was actually spent. Stating
 * 2 flat would over-charge the user in words for a call that was never made.
 */
export const WALLET_ORIGIN_MAX_CREDITS = 2;
/** `profiler/address/counterparties` (Round 2.3): the second 5-credit call a card can make. */
export const WALLET_COUNTERPARTY_CREDITS = 5;

const rate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct(v * 100));

/**
 * A return as a signed percentage, from the fraction Nansen sends (0.0023 is +0.23%).
 *
 * `pct()` rounds to whole percent, which prints the recorded wallet's +0.23% as "0%" — the
 * figure exists precisely because it is small. `pctVol` carries two decimals below 1%, so the
 * sign is the only thing added here.
 */
const roi = (fraction: number | null | undefined) => {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  const body = pctVol(Math.abs(fraction) * 100);
  return `${fraction > 0 ? "+" : fraction < 0 ? "−" : ""}${body}`;
};

const count = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("en-US"));

/** The identity line: the name it was shared as, else a Nansen label, else the short address. */
export function walletTitle(lens: WalletLensResponse | null, ref: WalletRef): string {
  if (lens?.name) return lens.name.value;
  if (lens?.label) return lens.label.text;
  return refLabel(ref);
}

/**
 * A call the user has not made yet, with its price on the button.
 *
 * Non-negotiable #8: the price is visible before the press, and nothing here fires on a card
 * open or on a view change — the view switcher is a radiogroup with arrow-key navigation, so
 * spending on view activation would be a credit per keypress.
 */
function BuyButton({
  label,
  credits,
  onClick,
  pending,
  ceiling,
}: {
  label: string;
  credits: number;
  onClick: () => void;
  pending: boolean;
  /** Round 2.3: the origin press makes one or two calls depending on the wallet, so its price
   *  is a ceiling. "Up to" over-states nothing; a flat "2 credits" would. */
  ceiling?: boolean;
}) {
  return (
    <button type="button" className="tw-premium-button" onClick={onClick} disabled={pending}>
      <Icon icon={Coins} size={14} />
      {pending ? "Asking Nansen…" : `${label} (${ceiling ? "up to " : ""}${credits} ${credits === 1 ? "credit" : "credits"})`}
    </button>
  );
}

type Loader = { run: () => void; pending: boolean; error: string | null };

/** Turns a promise-returning prop into the pending/error state its button needs. */
function useLoader(fn: (() => Promise<void>) | null | undefined): Loader {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    pending,
    error,
    run: () => {
      if (!fn || pending) return;
      setPending(true);
      setError(null);
      void fn()
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setPending(false));
    },
  };
}

/**
 * Round 1.5.6 — the DeFi side of the portfolio, never added to the token side.
 *
 * `profiler/address/current-balance` already lists aTokens, stETH and LP receipts, so a sum of
 * the two double-counts. Debts get their own line rather than being netted into the headline:
 * a netted figure turns a leveraged position into a small number and says nothing about the
 * leverage. An answer Nansen never gave, and an answer of all zeros, both stay unchecked —
 * `portfolio/defi-holdings` has no documented Solana support, so "none found" is not "none".
 */
function DefiSection({ defi, loader, onLoad }: { defi: WalletDefiResponse | null | undefined; loader: Loader; onLoad: (() => Promise<void>) | null | undefined }) {
  return (
    <Section title="DeFi positions" aside={defi ? undefined : `${WALLET_DEFI_CREDITS} credits`}>
      {!defi ? (
        <>
          <p className="tw-empty">Lending, staking and LP positions are not in the token balances above.</p>
          {onLoad ? <BuyButton label="Check DeFi and label" credits={WALLET_DEFI_CREDITS} onClick={loader.run} pending={loader.pending} /> : null}
        </>
      ) : defi.defi === null || defi.defi.reportedNone ? (
        <Empty>Nansen returned no DeFi positions for this wallet. That is not a balance of $0: DeFi coverage does not span every chain.</Empty>
      ) : (
        <>
          <Readouts
            items={[
              { label: "DeFi value", value: usd(defi.defi.totalValueUsd) },
              { label: "Protocols", value: count(defi.defi.protocolCount) },
              { label: "Rewards", value: usd(defi.defi.totalRewardsUsd) },
            ]}
          />
          <p className="tw-meta">
            Borrowed <span className="tw-fig">{usd(defi.defi.totalDebtsUsd)}</span>, shown on its own line and netted from nothing. DeFi value sits beside the token
            portfolio above, never inside it: receipt tokens appear in both.
          </p>
        </>
      )}
      {defi?.errors.length ? <Problems errors={defi.errors} /> : null}
      {loader.error ? (
        <p className="tw-field-hint" role="status">
          <Icon icon={CircleAlert} size={14} /> {loader.error}
        </p>
      ) : null}
    </Section>
  );
}

/**
 * Round 1.5.7 — unrealized PnL and cost basis, the half `pnl-summary` does not carry.
 *
 * Two measured caveats are on screen rather than in a comment. `chain: "all"` is accepted, but
 * the rows come back with **no chain**, so a symbol can legitimately appear more than once and
 * is never linked to a token page. And a cost basis is only a cost basis for tokens that were
 * bought: anything that arrived by transfer has no purchase for Nansen to price.
 */
function UnrealizedSection({ data, loader, onLoad }: { data: WalletUnrealizedResponse | null | undefined; loader: Loader; onLoad: (() => Promise<void>) | null | undefined }) {
  const rows = data?.rows ?? [];
  const pagination = usePagination(rows, 5);
  // Four columns is what a 440px card holds without wrapping a header (non-negotiable #5).
  // "Held" is the one a reader can do without when the card is compact.
  const expanded = useIsExpanded();
  return (
    <Section
      title="Open positions and cost basis"
      aside={data ? (data.truncated ? `${rows.length} largest` : `${rows.length} tokens`) : `${WALLET_UNREALIZED_CREDITS} credit`}
    >
      {!data ? (
        <>
          <p className="tw-empty">Everything above is realized: positions this wallet has already closed. What it still holds is a separate call.</p>
          {onLoad ? <BuyButton label="Load unrealized PnL" credits={WALLET_UNREALIZED_CREDITS} onClick={loader.run} pending={loader.pending} /> : null}
        </>
      ) : rows.length === 0 ? (
        <Empty>Nansen returned no open token positions for this wallet.</Empty>
      ) : (
        <>
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col" className="tw-num">
                  Unrealized
                </th>
                <th scope="col" className="tw-num">
                  ROI
                </th>
                <th scope="col" className="tw-num">
                  Cost basis
                </th>
                {expanded ? (
                  <th scope="col" className="tw-num">
                    Held
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map((row, i) => (
                <tr key={`${row.symbol}-${i}`}>
                  <td>{row.symbol}</td>
                  <td className="tw-fig tw-num" data-sign={sign(row.unrealizedPnlUsd)}>
                    {usd(row.unrealizedPnlUsd, true)}
                  </td>
                  <td className="tw-fig tw-num" data-sign={sign(row.unrealizedRoi)}>
                    {roi(row.unrealizedRoi)}
                  </td>
                  <td className="tw-fig tw-num">{usd(row.costBasisUsd)}</td>
                  {expanded ? <td className="tw-fig tw-num">{usd(row.holdingUsd)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.controls}
          <p className="tw-meta">
            One row per token per chain, but Nansen does not say which chain when it is asked about all of them, so a symbol can appear twice and mean two different
            positions. Cost basis covers tokens this wallet bought; anything that arrived by transfer has no purchase to price.
          </p>
        </>
      )}
      {data?.errors.length ? <Problems errors={data.errors} /> : null}
      {loader.error ? (
        <p className="tw-field-hint" role="status">
          <Icon icon={CircleAlert} size={14} /> {loader.error}
        </p>
      ) : null}
    </Section>
  );
}

/** A counterparty's name on screen: Nansen's own label if it sent one, else the address. */
const partyName = (address: string | null, label: string | null) => label ?? (address ? shortAddr(address) : "Unnamed address");

/** Recent, so the relative form reads: a transaction two days old is "2d ago". */
const when = (iso: string | null) => (iso ? timeAgo(iso) : "—");

/**
 * Historical, so the date reads. `timeAgo` caps at days, and a first funder from 2021 printed
 * as "1778d ago" is a number nobody can convert; the same shape the Polymarket first-seen line
 * already uses (Round 1.5.4).
 */
const onDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

/**
 * A token quantity beside its symbol. The USD column is a dash on a fifth of the rows, because
 * Nansen priced nothing on them; the amount is the quantity that does exist, so it belongs on
 * the row rather than being dropped with the price.
 */
function amount(value: number | null | undefined, symbol: string | null): string | null {
  // Nansen sends `token_symbol: ""` on some legs. A quantity with no unit is not a fact, so
  // the row says only what it does know and the direction word carries it alone.
  if (!symbol) return null;
  if (value === null || value === undefined || !Number.isFinite(value)) return symbol;
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const scaled = abs / div;
      return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(scaled >= 10 ? 1 : 2).replace(/\.?0+$/, "")}${suffix} ${symbol}`;
    }
  }
  return `${abs >= 1 ? abs.toFixed(2).replace(/\.?0+$/, "") : abs.toPrecision(2)} ${symbol}`;
}

const DIRECTION_ICON = { sent: ArrowUpRight, received: ArrowDownLeft, both: ArrowLeftRight } as const;
const DIRECTION_WORD = { sent: "Sent", received: "Received", both: "Sent and received" } as const;

/**
 * Round 2.3 — the activity feed: `profiler/address/transactions`, 1 credit, behind a button.
 *
 * Before this the wallet card was entirely state — balances, PnL, positions — so a plain spot
 * wallet had no time-ordered content at all. Every value on a row is a field Nansen sent: the
 * direction is which array the token leg came back in, the counterparty is that leg's other
 * address with Nansen's own label when there is one, and a row with no `volume_usd` shows a
 * dash. Nothing here is called a deposit, an exit or a move to an exchange.
 */
function TimelineSection({
  activity,
  loader,
  onLoad,
}: {
  activity: WalletActivityResponse | null | undefined;
  loader: Loader;
  onLoad: (() => Promise<void>) | null | undefined;
}) {
  const rows = activity?.rows ?? [];
  const pagination = usePagination(rows, 5);
  return (
    <Section
      title="Recent transactions"
      aside={activity ? (activity.truncated ? `${rows.length} newest` : `${rows.length} in ${activity.windowDays}d`) : `${WALLET_ACTIVITY_CREDITS} credit`}
    >
      {!activity ? (
        <>
          <p className="tw-empty">Everything else on this card is a balance. This is what the wallet has actually done, newest first.</p>
          {onLoad ? <BuyButton label="Load recent activity" credits={WALLET_ACTIVITY_CREDITS} onClick={loader.run} pending={loader.pending} /> : null}
        </>
      ) : rows.length === 0 ? (
        <Empty>Nansen returned no transactions for this wallet in the last {activity.windowDays} days.</Empty>
      ) : (
        <>
          <ul className="tw-rows tw-activity-rows">
            {pagination.rows.map((row, i) => (
              <li key={`${row.txHash ?? "tx"}-${i}`}>
                <span className="tw-activity-what">
                  <span className="tw-holding-name">
                    {row.direction ? <Icon icon={DIRECTION_ICON[row.direction]} size={14} /> : null}
                    {row.chain ? <ChainLogo chain={row.chain} size={14} /> : null}
                    <span className="tw-row-name">
                      {[row.direction ? DIRECTION_WORD[row.direction] : "Transaction", amount(row.token?.amount, row.token?.symbol ?? null)].filter(Boolean).join(" ")}
                      {row.legCount > 1 ? ` and ${row.legCount - 1} more` : ""}
                    </span>
                  </span>
                  <span className="tw-meta tw-row-name">
                    {row.chain ? `${row.chain} · ` : ""}
                    {partyName(row.counterparty?.address ?? null, row.counterparty?.label ?? null)}
                    {row.counterparty?.address ? (
                      <NansenRowLink href={nansenWalletUrl(row.counterparty.address, row.chain)} subject="this counterparty" />
                    ) : null}
                  </span>
                </span>
                <span className="tw-activity-value">
                  <span className="tw-fig">{usd(row.valueUsd)}</span>
                  <time className="tw-meta tw-fig" dateTime={row.timeIso ?? undefined}>
                    {when(row.timeIso)}
                  </time>
                </span>
              </li>
            ))}
          </ul>
          {pagination.controls}
          <p className="tw-meta">
            The newest returned transaction is <span className="tw-fig">{when(activity.lastActiveIso)}</span>, which is where &ldquo;last active&rdquo; comes from and
            all it means: anything older than {activity.windowDays} days, or past this page, is not in the answer.
            {activity.chains.length ? ` Chains in this page: ${activity.chains.join(", ")}.` : ""} A row names the other address and Nansen&apos;s label for it, and
            says nothing about why the tokens moved.
          </p>
        </>
      )}
      {activity?.errors.length ? <Problems errors={activity.errors} /> : null}
      {loader.error ? (
        <p className="tw-field-hint" role="status">
          <Icon icon={CircleAlert} size={14} /> {loader.error}
        </p>
      ) : null}
    </Section>
  );
}

/**
 * Round 2.3 — the origin story: `profiler/address/first-funder` and
 * `profiler/address/related-wallets`, 1 credit each, up to 2 in one press.
 *
 * `relation` is printed as the raw Nansen string. This section says "Nansen relates these",
 * never "same owner" and never "linked to": those are the readings a reader turns into a sybil
 * claim, and non-negotiable #2 rules them out. Nothing here feeds a signal or a block.
 */
function OriginSection({
  origin,
  chains,
  loader,
  onLoad,
}: {
  origin: WalletOriginResponse | null | undefined;
  chains: string[];
  loader: Loader;
  onLoad: (() => Promise<void>) | null | undefined;
}) {
  const related = origin?.related ?? [];
  return (
    <Section
      title="Origin and related wallets"
      aside={origin ? (origin.relatedChain ?? "first funder only") : `up to ${WALLET_ORIGIN_MAX_CREDITS} credits`}
    >
      {!origin ? (
        <>
          <p className="tw-empty">Which wallet funded this one first, and which wallets Nansen relates to it.</p>
          {onLoad ? <BuyButton label="Check origin" credits={WALLET_ORIGIN_MAX_CREDITS} onClick={loader.run} pending={loader.pending} ceiling /> : null}
        </>
      ) : (
        <>
          {!origin.firstFunderAsked ? (
            <Empty>Nansen&apos;s first-funder lookup covers EVM addresses only, so this address was not asked.</Empty>
          ) : origin.firstFunder ? (
            <p className="tw-person">
              <Icon icon={Sprout} size={16} />
              <span>
                First funded by <b>{partyName(origin.firstFunder.address, origin.firstFunder.name)}</b>
                {origin.firstFunder.chain ? ` on ${origin.firstFunder.chain}` : ""} on <span className="tw-fig">{onDate(origin.firstFunder.timeIso)}</span>.
              </span>
              {origin.firstFunder.address ? (
                <NansenRowLink href={nansenWalletUrl(origin.firstFunder.address, origin.firstFunder.chain)} subject="the first funder" />
              ) : null}
            </p>
          ) : origin.firstFunderReportedNone ? (
            <Empty>Nansen returned no first funder for this address. An empty answer here is normal, not a finding.</Empty>
          ) : null}
          {origin.relatedChain === null ? (
            <Empty>
              Nansen&apos;s related-wallet lookup does not cover {chains.length ? chains.join(", ") : "this wallet's chains"}, so it was not asked and not charged.
            </Empty>
          ) : related.length === 0 ? (
            <Empty>Nansen relates no other wallet to this one on {origin.relatedChain}.</Empty>
          ) : (
            <ul className="tw-rows">
              {related.map((row, i) => (
                <li key={`${row.address ?? "related"}-${i}`}>
                  <span className="tw-holding-name">
                    <span className="tw-row-name">{partyName(row.address, row.label)}</span>
                    {row.address ? <NansenRowLink href={nansenWalletUrl(row.address, row.chain)} subject="this related wallet" /> : null}
                  </span>
                  <span className="tw-meta">
                    {row.relation ?? "—"} · <span className="tw-fig">{onDate(row.timeIso)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="tw-meta">
            {origin.firstFunderAlsoRelated
              ? "Nansen returns the first funder as a related wallet too: the two rows above are one relationship, reported twice. "
              : ""}
            The relation is Nansen&apos;s own word for the link, not a statement about ownership, and nothing here changes a verdict.
          </p>
        </>
      )}
      {origin?.errors.length ? <Problems errors={origin.errors} /> : null}
      {loader.error ? (
        <p className="tw-field-hint" role="status">
          <Icon icon={CircleAlert} size={14} /> {loader.error}
        </p>
      ) : null}
    </Section>
  );
}

/**
 * Round 2.3 — `profiler/address/counterparties`, **5 credits**, button-gated.
 *
 * Volume in and volume out are the two figures Nansen sends and are shown as those two figures.
 * "CEX exposure" is an interpretation of them and is not drawn here. An unlabelled counterparty
 * — 36 of the 50 recorded rows — stays an address rather than being described.
 */
function CounterpartySection({
  data,
  loader,
  onLoad,
  expanded,
}: {
  data: WalletCounterpartiesResponse | null | undefined;
  loader: Loader;
  onLoad: (() => Promise<void>) | null | undefined;
  expanded: boolean;
}) {
  const rows = data?.rows ?? [];
  const pagination = usePagination(rows, 5);
  return (
    <Section
      title="Counterparties"
      aside={data ? (data.truncated ? `${rows.length} largest returned` : `${rows.length} addresses`) : `${WALLET_COUNTERPARTY_CREDITS} credits`}
    >
      {!data ? (
        <>
          <p className="tw-empty">The addresses this wallet moved the most value with, in and out, over the last 30 days.</p>
          {onLoad ? <BuyButton label="Load counterparties" credits={WALLET_COUNTERPARTY_CREDITS} onClick={loader.run} pending={loader.pending} /> : null}
        </>
      ) : rows.length === 0 ? (
        <Empty>Nansen returned no counterparties for this wallet in the last {data.windowDays} days.</Empty>
      ) : (
        <>
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Counterparty</th>
                <th scope="col" className="tw-num">
                  In
                </th>
                <th scope="col" className="tw-num">
                  Out
                </th>
                {expanded ? (
                  <th scope="col" className="tw-num">
                    Transfers
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map((row, i) => (
                <tr key={`${row.address ?? "party"}-${i}`}>
                  <td>
                    <span className="tw-activity-what">
                      <span className="tw-holding-name">
                        <span className="tw-row-name">{partyName(row.address, row.labels[0] ?? null)}</span>
                        {row.address ? <NansenRowLink href={nansenWalletUrl(row.address)} subject="this counterparty" /> : null}
                      </span>
                      {/* One Nansen label covers many addresses — three of the recorded rows are
                          all "Token Millionaire" — so the address stays on screen under it. */}
                      {row.labels.length && row.address ? <span className="tw-meta tw-mono">{shortAddr(row.address)}</span> : null}
                    </span>
                  </td>
                  <td className="tw-fig tw-num">{usd(row.volumeInUsd)}</td>
                  <td className="tw-fig tw-num">{usd(row.volumeOutUsd)}</td>
                  {expanded ? <td className="tw-fig tw-num">{count(row.interactions)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.controls}
          <p className="tw-meta">
            Value received and value sent over {data.windowDays} days, as Nansen reports them, not netted together. An address with no Nansen label is shown as an
            address: that is a missing label, not a finding about the address.
          </p>
        </>
      )}
      {data?.errors.length ? <Problems errors={data.errors} /> : null}
      {loader.error ? (
        <p className="tw-field-hint" role="status">
          <Icon icon={CircleAlert} size={14} /> {loader.error}
        </p>
      ) : null}
    </Section>
  );
}

/**
 * The Activity tab (Round 2.3): what the wallet did, and who it is connected to.
 *
 * Its own tab rather than a fourth segment in Overview, because the wallet card's tab strip has
 * room for four and its Segmented control does not. Switching between Timeline and Connections
 * spends nothing — every call in here is a button, for the reason Round 1.5 recorded: the view
 * switcher is a `radiogroup` whose arrow keys move the selection, so a spend on activation is a
 * credit per keypress.
 */
function ActivityTab({
  chains,
  activity,
  onLoadActivity,
  origin,
  onLoadOrigin,
  counterparties,
  onLoadCounterparties,
}: {
  chains: string[];
  activity?: WalletActivityResponse | null;
  onLoadActivity?: (() => Promise<void>) | null;
  origin?: WalletOriginResponse | null;
  onLoadOrigin?: (() => Promise<void>) | null;
  counterparties?: WalletCounterpartiesResponse | null;
  onLoadCounterparties?: (() => Promise<void>) | null;
}) {
  const [view, setView] = useState<"timeline" | "connections">("timeline");
  const expanded = useIsExpanded();
  const activityLoader = useLoader(onLoadActivity);
  const originLoader = useLoader(onLoadOrigin);
  const counterpartyLoader = useLoader(onLoadCounterparties);
  return (
    <div className="tw-detail">
      <Segmented
        label="Wallet activity"
        value={view}
        onChange={setView}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "connections", label: "Connections" },
        ]}
      />
      {view === "timeline" ? (
        <TimelineSection activity={activity} loader={activityLoader} onLoad={onLoadActivity} />
      ) : (
        <>
          <OriginSection origin={origin} chains={chains} loader={originLoader} onLoad={onLoadOrigin} />
          <CounterpartySection data={counterparties} loader={counterpartyLoader} onLoad={onLoadCounterparties} expanded={expanded} />
        </>
      )}
    </div>
  );
}

function Overview({
  lens,
  onLoadLabels,
  defi,
  onLoadDefi,
  unrealized,
  onLoadUnrealized,
}: {
  lens: WalletLensResponse;
  onLoadLabels: (() => Promise<void>) | null;
  defi?: WalletDefiResponse | null;
  onLoadDefi?: (() => Promise<void>) | null;
  unrealized?: WalletUnrealizedResponse | null;
  onLoadUnrealized?: (() => Promise<void>) | null;
}) {
  const [view, setView] = useState<"summary" | "holdings" | "performance">("summary");
  // Round 1.5.3: the same portfolio, split two ways. A Segmented control rather than a second
  // chart beside the first — two charts do not fit a 440px card.
  const [split, setSplit] = useState<"tokens" | "chains">("tokens");
  const allHoldings = lens.portfolio?.holdings ?? [];
  const allocation = allHoldings.map((h) => ({ label: h.symbol, value: h.valueUsd }));
  const unlisted = (lens.portfolio?.totalUsd ?? 0) - allHoldings.reduce((sum, h) => sum + h.valueUsd, 0);
  if (unlisted > 0) allocation.push({ label: "Other balances", value: unlisted });
  const chainRows = (lens.portfolio?.chainHoldings ?? []).map((c) => ({ label: c.chain, value: c.valueUsd }));
  const pagination = usePagination(allHoldings, 5);
  const holdings = pagination.rows;

  const labels = useLoader(onLoadLabels);
  const defiLoader = useLoader(onLoadDefi);
  const unrealizedLoader = useLoader(onLoadUnrealized);

  return (
    <div className="tw-detail">
      <Segmented
        label="Wallet details"
        value={view}
        onChange={setView}
        options={[
          { value: "summary", label: "Summary" },
          { value: "holdings", label: "Holdings" },
          { value: "performance", label: "Performance" },
        ]}
      />
      {lens.sampleData ? <p className="tw-empty">Recorded sample data. These figures do not describe this wallet.</p> : null}
      {view === "summary" ? (
        <div className="tw-profile-summary">
          {lens.label ? (
            <p className="tw-person">
              <Icon icon={LABEL_KIND_ICON[lens.label.kind]} size={16} />
              <span>
                Nansen label: <b>{lens.label.text}</b>
              </span>
            </p>
          ) : (
            <p className="tw-empty">
              {/* Round 1.5.1: what used to be here waited on an entity row's `address`, a field
                  `search/general` does not return, so it could never fill. The label a wallet
                  can actually get comes from the DeFi button below, on the wallet's own chain. */}
              {defi ? (
                <>No Nansen trade label for this wallet{defi.labelChain ? ` on ${defi.labelChain}` : ""}.</>
              ) : (
                <>No public label yet. Nansen names a wallet from its DEX trades.</>
              )}
              {onLoadLabels ? (
                <>
                  {" "}
                  <BuyButton label="Load Nansen labels" credits={PREMIUM_LABEL_CREDITS} onClick={labels.run} pending={labels.pending} />
                </>
              ) : null}
            </p>
          )}
          {labels.error ? (
            <p className="tw-field-hint" role="status">
              <Icon icon={CircleAlert} size={14} /> {labels.error}
            </p>
          ) : null}
          <Readouts
            items={[
              { label: lens.portfolio?.holdingsTruncated ? "Reported tokens" : "Tokens", value: usd(lens.portfolio?.totalUsd ?? null) },
              { label: `Realized PnL ${lens.pnl?.windowDays ?? 90}d`, value: usd(lens.pnl?.realizedPnlUsd, true), sign: sign(lens.pnl?.realizedPnlUsd) },
              { label: "Win rate", value: rate(lens.pnl?.winRate) },
              { label: "Trades", value: count(lens.pnl?.tradeCount) },
            ]}
          />
          {/* Round 2.3: the honest half of the Hyperliquid work. Nansen's profiler chain enum
              has no HyperCore value, so an account balance held on Hyperliquid is genuinely
              outside the Tokens figure rather than merely missing from it. Saying so costs
              nothing and stops the tile from reading as the whole wallet. */}
          {lens.hyperliquid ? (
            <p className="tw-meta">
              A Hyperliquid balance sits on HyperCore, which Nansen&apos;s profiler does not cover. It is in the Hyperliquid tab, not in Tokens.
            </p>
          ) : null}
          <DefiSection defi={defi} loader={defiLoader} onLoad={onLoadDefi} />
          <Section title="Portfolio allocation" aside="Returned balances">
            <Segmented
              label="Split the portfolio by"
              value={split}
              onChange={setSplit}
              options={[
                { value: "tokens", label: "By token" },
                { value: "chains", label: "By chain" },
              ]}
            />
            {split === "chains" ? (
              chainRows.length > 0 ? (
                <AllocationChart label="Current reported portfolio by chain" rows={chainRows} />
              ) : (
                <Empty>No chain split returned for this wallet.</Empty>
              )
            ) : (
              <AllocationChart label="Current reported portfolio composition" rows={allocation} />
            )}
          </Section>
        </div>
      ) : null}
      {view === "holdings" ? (
        <>
          <Section title="Top holdings" aside={lens.portfolio ? `${lens.portfolio.tokenCount} tokens` : undefined}>
            {holdings.length === 0 ? (
              <Empty>Nansen reports no token balances for this wallet.</Empty>
            ) : (
              <ul className="tw-rows tw-holding-rows">
                {holdings.map((h) => (
                  <li key={`${h.chain}-${h.tokenAddress}`}>
                    <span className="tw-holding-name">
                      <TokenLogo symbol={h.symbol} size={20} chain={h.chain} tokenAddress={h.tokenAddress} />
                      <span className="tw-row-name">{h.symbol}</span>
                      <ChainLogo chain={h.chain} size={14} />
                      <NansenRowLink href={nansenTokenUrl(h.chain, h.tokenAddress)} subject={`${h.symbol} on ${h.chain}`} />
                    </span>
                    <span className="tw-fig">{usd(h.valueUsd)}</span>
                  </li>
                ))}
              </ul>
            )}
            {pagination.controls}
            {lens.portfolio?.holdingsTruncated ? <p className="tw-meta">Portfolio totals cover the returned balances. Open Nansen for the full portfolio.</p> : null}
          </Section>
        </>
      ) : null}
      {view === "performance" ? (
        <>
          <Readouts
            items={[
              { label: `Realized PnL ${lens.pnl?.windowDays ?? 90}d`, value: usd(lens.pnl?.realizedPnlUsd, true), sign: sign(lens.pnl?.realizedPnlUsd) },
              // Round 1.5.2: fetched since the wallet card shipped, drawn for the first time.
              { label: "Realized ROI", value: roi(lens.pnl?.realizedPnlPercent), sign: sign(lens.pnl?.realizedPnlPercent) },
              { label: "Win rate", value: rate(lens.pnl?.winRate) },
              { label: "Trades", value: count(lens.pnl?.tradeCount) },
              { label: "Tokens traded", value: count(lens.pnl?.tokenCount) },
            ]}
          />
          <p className="tw-meta">Realized ROI is Nansen&apos;s own figure against its own denominator, which it does not publish. Read it beside the money, not instead of it.</p>
          <Section title="Top realized PnL" aside={`${lens.pnl?.windowDays ?? 90} days`}>
            {lens.pnl?.topPnlTokens?.length ? (
              <PnlChart
                rows={lens.pnl.topPnlTokens.map((t) => ({
                  label: t.symbol,
                  value: t.realizedPnlUsd,
                  href: nansenTokenUrl(t.chain, t.tokenAddress),
                  note: t.realizedRoi === null || t.realizedRoi === undefined ? null : roi(t.realizedRoi),
                }))}
              />
            ) : (
              <Empty>No token-level performance returned for this period.</Empty>
            )}
          </Section>
          <UnrealizedSection data={unrealized} loader={unrealizedLoader} onLoad={onLoadUnrealized} />
        </>
      ) : null}
    </div>
  );
}

export type WalletCardProps = {
  /** What the user clicked, so the card has a title before the data lands. */
  walletRef: WalletRef;
  lens: WalletLensResponse | null;
  /** Null while loading; a sentence when the lookup itself failed. */
  error: string | null;
  onClose: () => void;
  /** Present only when the backend allows the 100-credit label lookup. */
  onLoadLabels?: (() => Promise<void>) | null;
  /** Round 1.5.6 + 1.5.1: 2 credits, bought by the Summary view's button and never before. */
  defi?: WalletDefiResponse | null;
  onLoadDefi?: (() => Promise<void>) | null;
  /** Round 1.5.7: 1 credit, bought by the Performance view's button and never before. */
  unrealized?: WalletUnrealizedResponse | null;
  onLoadUnrealized?: (() => Promise<void>) | null;
  /** Round 2.3: the Activity tab's three buttons — 1 credit, up to 2, and 5. */
  activity?: WalletActivityResponse | null;
  onLoadActivity?: (() => Promise<void>) | null;
  origin?: WalletOriginResponse | null;
  onLoadOrigin?: (() => Promise<void>) | null;
  counterparties?: WalletCounterpartiesResponse | null;
  onLoadCounterparties?: (() => Promise<void>) | null;
  replay?: boolean;
};

/**
 * The wallet card: what Nansen, Hyperliquid and Polymarket know about a wallet somebody shared.
 *
 * Tabs appear only for venues that answered — a wallet that has never touched Polymarket gets
 * no Polymarket tab, and one that has, but has nothing open, gets the tab with its own empty
 * state. The footer names the data sources; credit usage is tracked in the dashboard.
 *
 * Opening the card costs what it always cost. Three buttons inside it can spend more, each
 * stating its price first: DeFi and label (2), unrealized PnL (1), Nansen labels (100).
 */
export function WalletCard({
  walletRef,
  lens,
  error,
  onClose,
  onLoadLabels,
  defi,
  onLoadDefi,
  unrealized,
  onLoadUnrealized,
  activity,
  onLoadActivity,
  origin,
  onLoadOrigin,
  counterparties,
  onLoadCounterparties,
  replay,
}: WalletCardProps) {
  const pop = useContext(PopoverContext);

  const title = walletTitle(lens, walletRef);
  const ready = (fn: (() => Promise<void>) | null | undefined) => (fn && lens?.address ? fn : null);

  const tabs: TabDef[] = [];
  if (lens?.resolved) {
    tabs.push({
      id: "overview",
      label: "Overview",
      icon: <Icon icon={Wallet} size={14} />,
      content: (
        <Overview
          lens={lens}
          onLoadLabels={ready(onLoadLabels)}
          defi={defi}
          onLoadDefi={ready(onLoadDefi)}
          unrealized={unrealized}
          onLoadUnrealized={ready(onLoadUnrealized)}
        />
      ),
    });
    // Round 2.3: its own tab, and it costs nothing to open — all three calls inside it are
    // buttons that print their price.
    tabs.push({
      id: "activity",
      label: "Activity",
      icon: <Icon icon={Activity} size={14} />,
      content: (
        <ActivityTab
          chains={lens.portfolio?.chains ?? []}
          activity={activity}
          onLoadActivity={ready(onLoadActivity)}
          origin={origin}
          onLoadOrigin={ready(onLoadOrigin)}
          counterparties={counterparties}
          onLoadCounterparties={ready(onLoadCounterparties)}
        />
      ),
    });
    if (lens.hyperliquid) {
      tabs.push({
        id: "hyperliquid",
        label: "Hyperliquid",
        icon: <BrandMark logo={venueLogo("hyperliquid")!} size={14} />,
        content: <HyperliquidBody badge={lens.hyperliquid} />,
      });
    }
    if (lens.polymarket) {
      tabs.push({
        id: "polymarket",
        label: "Polymarket",
        icon: <BrandMark logo={venueLogo("polymarket")!} size={14} />,
        content: <PolymarketBody badge={lens.polymarket} />,
      });
    }
  }

  const body = () => {
    if (error) return <p className="tw-card-message tw-dock-error">{error}</p>;
    if (!lens) {
      return (
        <div className="tw-card-loading">
          <LoadingAnnouncement what="wallet data" />
          <SkeletonSection title="Wallet overview" shape="tile" rows={4} />
          <SkeletonSection title="Top holdings" shape="table" rows={5} />
        </div>
      );
    }
    if (!lens.resolved) return <p className="tw-card-message tw-dock-error">{lens.message ?? "This wallet could not be resolved."}</p>;
    return <Tabs label="Wallet" tabs={tabs} />;
  };

  return (
    <section className="tw-card tw-wallet-card" data-size={pop?.size ?? "compact"} aria-busy={!lens && !error ? "true" : undefined}>
      <CardHeader
        title={title}
        name={lens?.name ? null : lens?.label?.text}
        address={lens?.address ?? (walletRef.kind === "evm" || walletRef.kind === "solana" ? walletRef.query : null)}
        addressAction={lens?.name || lens?.label ? undefined : "Copy address"}
        chain={lens?.chainGuess ?? walletRef.chainHint ?? null}
        replay={replay}
        showToken={false}
        onClose={onClose}
      />
      <div className="tw-card-scroll">{body()}</div>
      <footer className="tw-card-footer">
        <div className="tw-card-credit">
          {lens?.nansenUrl ? <NansenLink href={lens.nansenUrl} /> : null}
          <p className="tw-meta tw-powered">
            Powered by <BrandMark logo={NANSEN_LOGO} size={14} /> <span className="tw-powered-name">Nansen</span>
          </p>
        </div>
        <p className="tw-sources tw-meta">{lens?.sources.length ? lens.sources.join(" · ") : "Nansen Profiler"}</p>
        <Problems errors={lens?.errors ?? []} />
      </footer>
    </section>
  );
}
