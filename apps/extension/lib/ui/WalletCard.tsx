import { useContext, useState } from "react";
import { NANSEN_LOGO, nansenTokenUrl, pctVol, venueLogo, type WalletRef } from "@tripwire/core";
import { CircleAlert, Coins, Wallet } from "lucide-react";
import type { WalletDefiResponse, WalletLensResponse, WalletUnrealizedResponse } from "../api-types";
import { pct, usd } from "./format";
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
function BuyButton({ label, credits, onClick, pending }: { label: string; credits: number; onClick: () => void; pending: boolean }) {
  return (
    <button type="button" className="tw-premium-button" onClick={onClick} disabled={pending}>
      <Icon icon={Coins} size={14} />
      {pending ? "Asking Nansen…" : `${label} (${credits} ${credits === 1 ? "credit" : "credits"})`}
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
export function WalletCard({ walletRef, lens, error, onClose, onLoadLabels, defi, onLoadDefi, unrealized, onLoadUnrealized, replay }: WalletCardProps) {
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
