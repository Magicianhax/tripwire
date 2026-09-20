import { useContext, useState } from "react";
import { NANSEN_LOGO, nansenTokenUrl, venueLogo, type WalletRef } from "@tripwire/core";
import { CircleAlert, Coins, Wallet } from "lucide-react";
import type { WalletLensResponse } from "../api-types";
import { pct, usd } from "./format";
import { Icon, LABEL_KIND_ICON } from "./icons";
import { BrandMark, ChainLogo, TokenLogo } from "./Logo";
import { CardHeader, Empty, NansenLink, Problems, Readouts, Section, signOf as sign, Sources } from "./panel-parts";
import { PopoverContext } from "./Popover";
import { LoadingAnnouncement, SkeletonSection } from "./Skeleton";
import { Tabs, type TabDef } from "./Tabs";
import { HyperliquidBody, PolymarketBody } from "./VenueBody";
import { refLabel } from "./WalletMarker";
import { NansenRowLink } from "./NansenRowLink";
import { Segmented } from "./Segmented";
import { AllocationChart, PnlChart, usePagination } from "./DataCharts";

export const PREMIUM_LABEL_CREDITS = 100;

const rate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct(v * 100));

/** The identity line: the name it was shared as, else a Nansen label, else the short address. */
export function walletTitle(lens: WalletLensResponse | null, ref: WalletRef): string {
  if (lens?.name) return lens.name.value;
  if (lens?.label) return lens.label.text;
  return refLabel(ref);
}

function Overview({ lens, onLoadLabels }: { lens: WalletLensResponse; onLoadLabels: (() => void) | null }) {
  const [view, setView] = useState<"summary" | "holdings" | "performance">("summary");
  const allHoldings = lens.portfolio?.holdings ?? [];
  const allocation = allHoldings.map(h=>({label:h.symbol,value:h.valueUsd}));
  const unlisted = (lens.portfolio?.totalUsd ?? 0) - allHoldings.reduce((sum,h)=>sum+h.valueUsd,0);
  if (unlisted > 0) allocation.push({label:"Other balances",value:unlisted});
  const pagination = usePagination(allHoldings, 5);
  const holdings = pagination.rows;
  return (
    <div className="tw-detail">
      <Segmented label="Wallet details" value={view} onChange={setView} options={[{value:"summary",label:"Summary"},{value:"holdings",label:"Holdings"},{value:"performance",label:"Performance"}]} />
      {lens.sampleData ? <p className="tw-empty">Recorded sample data. These figures do not describe this wallet.</p> : null}
      {view === "summary" ? <div className="tw-profile-summary">
      {lens.label ? (
        <p className="tw-person">
          <Icon icon={LABEL_KIND_ICON[lens.label.kind]} size={16} />
          <span>
            Nansen label: <b>{lens.label.text}</b>
          </span>
        </p>
      ) : (
        <p className="tw-empty">
          No public label returned. Open Nansen for the full profile.
          {onLoadLabels ? (
            <>
              {" "}
              <button type="button" className="tw-premium-button" onClick={onLoadLabels}>
                <Icon icon={Coins} size={14} />
                Load Nansen labels ({PREMIUM_LABEL_CREDITS} credits)
              </button>
            </>
          ) : null}
        </p>
      )}
      <Readouts
        items={[
          { label: lens.portfolio?.holdingsTruncated ? "Reported portfolio" : "Portfolio", value: usd(lens.portfolio?.totalUsd ?? null) },
          { label: `Realized PnL ${lens.pnl?.windowDays ?? 90}d`, value: usd(lens.pnl?.realizedPnlUsd, true), sign: sign(lens.pnl?.realizedPnlUsd) },
          { label: "Win rate", value: rate(lens.pnl?.winRate) },
          { label: "Trades", value: lens.pnl?.tradeCount === null || lens.pnl?.tradeCount === undefined ? "—" : String(lens.pnl.tradeCount) },
        ]}
      />
      <Section title="Portfolio allocation" aside="Returned balances"><AllocationChart label="Current reported portfolio composition" rows={allocation}/></Section>
      </div> : null}
      {view === "holdings" ? <>
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
      </Section>
      </> : null}
      {view === "performance" ? <>
        <Readouts items={[
          {label:`Realized PnL ${lens.pnl?.windowDays ?? 90}d`,value:usd(lens.pnl?.realizedPnlUsd,true),sign:sign(lens.pnl?.realizedPnlUsd)},
          {label:"Win rate",value:rate(lens.pnl?.winRate)},
          {label:"Trades",value:lens.pnl?.tradeCount == null ? "—" : String(lens.pnl.tradeCount)},
          {label:"Tokens traded",value:lens.pnl?.tokenCount == null ? "—" : String(lens.pnl.tokenCount)},
        ]}/>
        <Section title="Top realized PnL" aside={`${lens.pnl?.windowDays ?? 90} days`}>
          {lens.pnl?.topPnlTokens?.length ? <PnlChart rows={lens.pnl.topPnlTokens.map(t=>({label:t.symbol,value:t.realizedPnlUsd,href:nansenTokenUrl(t.chain,t.tokenAddress)}))}/> : <Empty>No token-level performance returned for this period.</Empty>}
        </Section>
      </> : null}
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
  replay?: boolean;
};

/**
 * The wallet card: what Nansen, Hyperliquid and Polymarket know about a wallet somebody shared.
 *
 * Tabs appear only for venues that answered — a wallet that has never touched Polymarket gets
 * no Polymarket tab, and one that has, but has nothing open, gets the tab with its own empty
 * state. The footer names the data sources; credit usage is tracked in the dashboard.
 */
export function WalletCard({ walletRef, lens, error, onClose, onLoadLabels, replay }: WalletCardProps) {
  const pop = useContext(PopoverContext);
  const [labelsPending, setLabelsPending] = useState(false);
  const [labelsError, setLabelsError] = useState<string | null>(null);

  const title = walletTitle(lens, walletRef);
  const loadLabels =
    onLoadLabels && lens?.address
      ? () => {
          setLabelsPending(true);
          setLabelsError(null);
          void onLoadLabels().catch((e: unknown) => setLabelsError(e instanceof Error ? e.message : String(e))).finally(() => setLabelsPending(false));
        }
      : null;

  const tabs: TabDef[] = [];
  if (lens?.resolved) {
    tabs.push({
      id: "overview",
      label: "Overview",
      icon: <Icon icon={Wallet} size={14} />,
      content: <Overview lens={lens} onLoadLabels={labelsPending ? null : loadLabels} />,
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
    return (
      <>
        <Tabs label="Wallet" tabs={tabs} />
        {labelsError ? (
          <p className="tw-field-hint" role="status">
            <Icon icon={CircleAlert} size={14} /> {labelsError}
          </p>
        ) : null}
      </>
    );
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
        <p className="tw-sources tw-meta">
          {lens?.sources.length ? lens.sources.join(" · ") : "Nansen Profiler"}
        </p>
        <Problems errors={lens?.errors ?? []} />
      </footer>
    </section>
  );
}
