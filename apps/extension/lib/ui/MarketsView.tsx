import { useContext, useEffect, useState } from "react";
import type { Market, MarketCatalog, GuardResponse, MarketEnrichment, SpotPanel } from "../api-types";
import { AllocationChart, usePagination } from "./DataCharts";
import { usd, shortAddr } from "./format";
import { Icon } from "./icons";
import { Coins } from "lucide-react";
import { ChainLogo } from "./Logo";
import { Empty, Section, CardHeader, Readouts } from "./panel-parts";
import { NansenRowLink } from "./NansenRowLink";
import { Segmented } from "./Segmented";
import { Panel, type DepthLoader } from "./Panel";
import { chainGroups, screenerKey, SCREENER_MAX_CHAINS, type ViewTimeframe } from "@tripwire/core";
import { PopoverContext } from "./Popover";

const marketName = (market: Market) => `${market.kind === "perp" ? "Perps" : "Spot"} · ${market.chain}`;
const marketPrice = (value:number|null) => value === null ? "—" : `$${value.toLocaleString("en-US",{maximumSignificantDigits:6})}`;
const marketAge = (days: number | null) => days === null ? "—" : days < 365 ? `${Math.round(days)}d` : `${(days / 365).toFixed(1)}y`;
const marketChange = (pct: number | null) => pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 1 && pct !== 0 ? 2 : 1)}%`;

/** The catalog is free. This is the one thing in it that is not, so the press states its price
 * first and the price is counted from the catalog's own chains, never guessed (Round 1.6.2). */
const MAX_ENRICH_GROUPS = 5;
function enrichmentPrice(markets: Market[]): { credits: number; chains: number } {
  const groups = chainGroups(markets.map((m) => m.chain), SCREENER_MAX_CHAINS).slice(0, MAX_ENRICH_GROUPS);
  return { credits: groups.length, chains: groups.flat().length };
}

/**
 * The catalog's one paid affordance (Round 1.6.2).
 *
 * `token-screener` bills per call, not per row, and one call covers up to five chains — so the
 * honest price is the number of chain groups, computed from the catalog already on screen and
 * printed before the press. Turning a free view into a paid one without saying so would be the
 * product regression; this is the version that is not.
 */
function MarketEnrichControl({ markets, enriched, pending, error, onAsk }: {
  markets: Market[]; enriched: boolean; pending: boolean; error: string | null; onAsk: () => void;
}) {
  const spots = markets.filter(m => m.kind === "spot");
  if (spots.length === 0) return null;
  const { credits, chains } = enrichmentPrice(spots);
  if (credits === 0) return null;
  if (enriched) {
    return <p className="tw-meta">Token age, 24h price change and FDV are from Nansen's token screener, over {chains === 1 ? "1 chain" : `${chains} chains`}.{error ? ` ${error}` : ""}</p>;
  }
  return <div className="tw-market-enrich">
    <button type="button" className="tw-premium-button" onClick={onAsk} disabled={pending}>
      <Icon icon={Coins} size={14} />
      {pending ? "Asking Nansen…" : `Add token age, 24h change and FDV (${credits} ${credits === 1 ? "credit" : "credits"})`}
    </button>
    <p className="tw-meta">One call covers every spot row on {chains === 1 ? "this chain" : `these ${chains} chains`}, not one call per row.</p>
    {error ? <p className="tw-meta">{error}</p> : null}
  </div>;
}

/** These are search matches, never a combined balance, volume or verdict for an entire asset. */
export function MarketsView({ symbol, active, selectedId, onExplore }: {
  symbol: string; active: boolean; selectedId?: string; onExplore: (market: Market) => void;
}) {
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const [filter, setFilter] = useState<"all" | "spot" | "perp">("all");
  // Round 1.6.2. One credit per group of up to five chains buys token age, 24h price change and
  // FDV for the whole page at once; until somebody presses for it the catalog stays free.
  const [enrichment, setEnrichment] = useState<Record<string, MarketEnrichment> | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const expanded = useContext(PopoverContext)?.size === "expanded";
  useEffect(() => {
    if (!active) return;
    let current = true;
    setCatalog(null); setError(null); setEnrichment(null); setEnrichError(null);
    void (async () => {
      try {
        const api = await import("../api");
        const response = await api.markets(symbol);
        if (!current) return;
        if (response.ok) { setCatalog(response.data); setError(response.data.errors[0] ?? null); }
        else setError("Markets are unavailable right now.");
      } catch { if (current) setError("Markets are unavailable right now."); }
    })();
    return () => { current = false; };
  }, [symbol, active, attempt]);
  const rows = (catalog?.markets ?? []).filter(m => filter === "all" || m.kind === filter);
  const page = usePagination(rows, expanded ? 4 : 2);
  const spots = (catalog?.markets ?? []).filter(m => m.kind === "spot" && m.match === "exact");
  const perps = (catalog?.markets ?? []).filter(m => m.kind === "perp");
  if (!catalog && !error) return <p className="tw-empty" role="status">{active ? `Finding ${symbol} markets…` : "Open Markets to compare spot and perps."}</p>;
  if (error) return <div className="tw-detail"><Empty>{error}</Empty><button type="button" className="tw-link-btn" onClick={() => retry(v=>v+1)}>Try again</button></div>;
  return <div className="tw-detail tw-market-explorer">
    <div className="tw-detail-head">
      <div><h3 className="tw-section-title">{symbol} across markets</h3><p className="tw-meta">{spots.length} matching spot markets · {perps.length} perp markets · Nansen search snapshot{catalog?.replay ? " · Replay" : ""}</p></div>
      <Segmented label="Market type" value={filter} onChange={setFilter} options={[{value:"all",label:"All"},{value:"spot",label:"Spot"},{value:"perp",label:"Perps"}]} />
    </div>
    <div className="tw-market-comparison">
      {(expanded || filter === "spot") && filter !== "perp" && spots.length > 0 ? <Section title="Spot volume distribution" aside="Matching ticker">
        <AllocationChart label="24-hour volume share across matching spot markets" rows={spots.map(m=>({label:`${m.symbol} · ${m.chain}`,value:m.volume24hUsd??0}))}/>
      </Section> : null}
      {(expanded || filter === "perp") && filter !== "spot" && perps.length > 0 ? <Section title="Perp markets" aside={perps.length === 1 ? perps[0]!.chain : "Separate venues"}>
        {perps.length === 1 ? <Readouts items={[{label:"Price",value:marketPrice(perps[0]!.priceUsd)},{label:"24h trading volume",value:usd(perps[0]!.volume24hUsd)}]}/> :
          <AllocationChart label="24-hour volume share across perp markets" rows={perps.map(m=>({label:`${m.symbol} · ${m.chain}`,value:m.volume24hUsd??0}))}/>}
      </Section> : null}
    </div>
    <p className="tw-meta">Different chains, wrappers and issuers are separate markets. Spot and perp volumes are not combined.</p>
    <MarketEnrichControl
      markets={catalog?.markets ?? []}
      enriched={enrichment !== null}
      pending={enriching}
      error={enrichError}
      onAsk={async () => {
        setEnriching(true); setEnrichError(null);
        try {
          const api = await import("../api");
          const spots = (catalog?.markets ?? []).filter(m => m.kind === "spot");
          const result = await api.enrichMarkets(spots.map(m => ({ chain: m.chain, address: m.address })));
          if (result.ok) { setEnrichment(result.data.rows); setEnrichError(result.data.errors[0] ?? null); }
          else setEnrichError("Token screener is unavailable right now.");
        } catch { setEnrichError("Token screener is unavailable right now."); }
        finally { setEnriching(false); }
      }}
    />
    {page.rows.length ? <div className="tw-market-options">{page.rows.map(m=><article className="tw-market-option" key={m.id} data-current={m.id===selectedId ? "" : undefined}>
      <div className="tw-market-heading"><div><b>{m.symbol}</b><span className="tw-market-kind">{marketName(m)}</span></div><NansenRowLink href={m.nansenUrl} subject={`${m.symbol} ${marketName(m)}`}/></div>
      <p className="tw-market-name">{m.name}</p>
      <p className="tw-meta"><ChainLogo chain={m.chain} size={14}/>{shortAddr(m.address)}{m.match === "related" ? " · Related search result" : ""}{m.id===selectedId ? " · Selected token" : ""}</p>
      <dl className="tw-market-metrics"><div><dt>Price</dt><dd>{marketPrice(m.priceUsd)}</dd></div><div><dt>24h volume</dt><dd>{usd(m.volume24hUsd)}</dd></div><div><dt>Market cap</dt><dd>{usd(m.marketCapUsd)}</dd></div>
        {/* Only where the screener answered. A row it had nothing for keeps the three free
            figures above rather than growing three dashes (1.6.2). */}
        {enrichment?.[screenerKey(m.chain, m.address)] ? (() => { const e = enrichment[screenerKey(m.chain, m.address)]!; return <>
          <div><dt>Age</dt><dd>{marketAge(e.ageDays)}</dd></div>
          <div><dt>24h change</dt><dd data-sign={e.priceChangePct === null || e.priceChangePct === 0 ? "zero" : e.priceChangePct < 0 ? "neg" : "pos"}>{marketChange(e.priceChangePct)}</dd></div>
          <div><dt>FDV</dt><dd>{usd(e.fdvUsd)}</dd></div>
        </>; })() : null}
      </dl>
      {m.detailTarget ? <button type="button" className="tw-link-btn" onClick={()=>onExplore(m)}>Explore {m.kind === "perp" ? "perps" : m.chain}</button> : <a className="tw-link-btn" href={m.nansenUrl} target="_blank" rel="noopener noreferrer">Full details on Nansen</a>}
    </article>)}</div> : <Empty>No {filter === "all" ? "matching" : filter} markets returned.</Empty>}
    {page.controls}
  </div>;
}

/** Detail requests never alter the host trade's guard state. Each selected market owns its data. */
export function MarketEvidence({ market, onBack, onClose, replay }: { market: Market; onBack:()=>void; onClose:()=>void; replay?:boolean }) {
  const [data,setData] = useState<GuardResponse|null>(null);
  const [error,setError] = useState<string|null>(null);
  useEffect(()=>{
    let current=true;
    void (async()=>{
      try {
        const api=await import("../api");
        const result=await api.guard(market.detailTarget!,"market-explorer","panel");
        if(current) result.ok ? setData(result.data) : setError("This market's evidence is unavailable right now.");
      } catch { if(current)setError("This market's evidence is unavailable right now."); }
    })();
    return()=>{current=false;};
  },[market.id]);
  const onDepth:DepthLoader = async sections=>{
    const api=await import("../api"); const result=await api.depth(market.detailTarget!,sections);
    return result.ok ? {ok:true,data:result.data} : {ok:false,error:"This section is unavailable right now."};
  };
  const onTimeframe=market.kind==="spot" ? async (timeframe:ViewTimeframe):Promise<SpotPanel|null>=>{
    const api=await import("../api"); const result=await api.guard(market.detailTarget!,"market-explorer","panel",timeframe);
    return result.ok ? result.data.panel as SpotPanel : null;
  }:undefined;
  return <Panel data={data} error={error} title={market.symbol} target={market.detailTarget} replay={replay} onClose={onClose} onDepth={onDepth} onTimeframe={onTimeframe}
    navigation={<div className="tw-market-navigation"><button type="button" className="tw-link-btn" onClick={onBack}>Back to markets</button><span className="tw-meta">Exploring {marketName(market)}. The page's trade check is unchanged.</span></div>}/>;
}

export function MarketsOnlyCard({ symbol, onClose }: {symbol:string;onClose:()=>void}) {
  const size=useContext(PopoverContext)?.size??"compact";
  const [market,setMarket]=useState<Market|null>(null);
  if(market) return <MarketEvidence key={market.id} market={market} onBack={()=>setMarket(null)} onClose={onClose}/>;
  return <section className="tw-card" data-size={size}><CardHeader title={`$${symbol}`} showToken={false} onClose={onClose}/><div className="tw-card-scroll"><div className="tw-tabpanel"><MarketsView symbol={symbol} active onExplore={setMarket}/></div></div></section>;
}
