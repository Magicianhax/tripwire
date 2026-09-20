import { useState } from "react";
import { cleanLabel, nansenTokenUrl } from "@tripwire/core";
import type { NansenBadge } from "../api-types";
import { pct, usd } from "./format";
import { ChainLogo } from "./Logo";
import { NansenRowLink } from "./NansenRowLink";
import { Empty, Problems, Readouts, Section, signOf, Sources } from "./panel-parts";
import { Segmented } from "./Segmented";
import { AllocationChart, PnlChart, usePagination } from "./DataCharts";

const count = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US");

/** Entity aggregates are never presented as one wallet or as an inferred wallet address. */
export function EntityProfile({ badge, expanded }: { badge: NansenBadge; expanded: boolean }) {
  const [view, setView] = useState<"summary" | "holdings" | "performance">("summary");
  const pagination = usePagination(badge.topHoldings, expanded ? 8 : 5);
  const holdings = pagination.rows;
  const chains = badge.chainHoldings ?? [];
  return (
    <div className="tw-detail">
      <Segmented label="Entity details" value={view} onChange={setView} options={[{value:"summary",label:"Summary"},{value:"holdings",label:"Holdings"},{value:"performance",label:"Performance"}]} />
      {view === "summary" ? <div className="tw-profile-summary">
        <p className="tw-person"><span>Nansen entity: <b>{badge.entity}</b></span></p>
        {badge.tags.length > 0 ? <ul className="tw-tags">{badge.tags.map((tag) => <li key={tag} className="tw-tag">{cleanLabel(tag).text || tag}</li>)}</ul> : null}
        <Readouts items={[
          { label: badge.holdingsTruncated ? "Reported holdings" : "Portfolio", value: usd(badge.totalHoldingsUsd) },
          { label: badge.holdingsTruncated ? "Reported token balances" : "Token balances", value: count(badge.tokenCount) },
          { label: `Realized PnL ${badge.pnlWindowDays}d`, value: usd(badge.realizedPnlUsd, true), sign: signOf(badge.realizedPnlUsd) },
          { label: `Win rate ${badge.pnlWindowDays}d`, value: badge.winRate == null ? "—" : pct(badge.winRate * 100) },
        ]} />
        {chains.length > 0 ? <Section title="Portfolio by chain">
          <AllocationChart label="Entity portfolio allocation by chain" rows={chains.map(c=>({label:c.chain,value:c.valueUsd}))}/>
        </Section> : null}
      </div> : null}
      {view === "performance" ? <div>
        <Readouts items={[
          { label: `Realized PnL ${badge.pnlWindowDays}d`, value: usd(badge.realizedPnlUsd,true),sign:signOf(badge.realizedPnlUsd) },
          { label: "Win rate", value:badge.winRate==null ? "—" : pct(badge.winRate*100) },
          { label: "Trades", value:count(badge.tradeCount) },
          { label: "Tokens traded", value:count(badge.tradedTokenCount) },
        ]}/>
        <Section title="Top tokens by realized PnL" aside={`${badge.pnlWindowDays} days`}>
          {!badge.topPnlTokens?.length ? <Empty>No token-level performance available for this period.</Empty> :
            <PnlChart rows={badge.topPnlTokens.map(t=>({label:t.symbol,value:t.realizedPnlUsd,href:nansenTokenUrl(t.chain,t.tokenAddress)}))}/>}
        </Section>
      </div> : null}
      {view === "holdings" ? <div>
        <Section title="Token holdings" aside={`${holdings.length} shown`}>
          {holdings.length === 0 ? <Empty>{badge.totalHoldingsUsd === null ? "Holdings are unavailable right now." : "No token balances reported for this entity."}</Empty> :
            <ul className="tw-rows tw-holding-rows">{holdings.map((holding, index) => <li key={`${holding.chain}-${holding.tokenAddress ?? holding.symbol}-${index}`}>
              <span className="tw-holding-name"><ChainLogo chain={holding.chain} size={14} /><span className="tw-row-name">{holding.symbol}</span><span className="tw-meta">{holding.chain}</span><NansenRowLink href={holding.tokenAddress ? nansenTokenUrl(holding.chain, holding.tokenAddress) : null} subject={`${holding.symbol} on ${holding.chain}`} /></span>
              <span className="tw-fig">{usd(holding.valueUsd)}</span>
            </li>)}</ul>}
          {pagination.controls}
          {badge.holdingsTruncated ? <p className="tw-meta">Portfolio totals cover the returned balances. Open Nansen for the full portfolio.</p> : null}
          {!badge.holdingsTruncated && (badge.tokenCount ?? 0) > badge.topHoldings.length ? <p className="tw-meta">Open Nansen to see all {count(badge.tokenCount)} token balances.</p> : null}
        </Section>
      </div> : null}
      <Problems errors={badge.errors} />
    </div>
  );
}
