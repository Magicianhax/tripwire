"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, Database, TrendingUp } from "lucide-react";
import type { PublicBrief, PublicBriefMarket } from "@/lib/public-brief";

const money = (n:number|null, compact=false) => n===null || !Number.isFinite(n) ? "Not reported" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",...(compact?{notation:"compact" as const,maximumFractionDigits:2}:{maximumSignificantDigits:6})}).format(n);
const signed = (n:number|null) => n===null ? "Not reported" : `${n>0?"+":n<0?"−":""}${money(Math.abs(n),true)}`;
const utcTime = (n:number) => `${new Date(n).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC`;
const change = (n:number|null) => n===null ? "Change unavailable" : `${n>0?"+":""}${n.toFixed(2)}%`;

function PriceHistory({market}:{market:PublicBriefMarket}) {
  const [point,setPoint]=useState<number|null>(null);
  const rows=market.candles.filter(row=>Number.isFinite(row.close)&&row.close>0&&Number.isFinite(row.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
  if(rows.length<2)return <div className="brief-chart-empty"><TrendingUp size={22} aria-hidden="true" /><p>Price history is not available for this snapshot.</p><span>The reported metrics remain visible below.</span></div>;
  const min=Math.min(...rows.map(row=>row.close)),max=Math.max(...rows.map(row=>row.close));
  const pad=Math.max((max-min)*.12,max*.001),bottom=min-pad,top=max+pad;
  const x=(time:number)=>16+(time-rows[0]!.timestamp)/(rows.at(-1)!.timestamp-rows[0]!.timestamp||1)*584;
  const y=(value:number)=>16+(top-value)/(top-bottom)*174;
  const line=rows.map((row,index)=>`${index?"L":"M"}${x(row.timestamp).toFixed(2)},${y(row.close).toFixed(2)}`).join(" ");
  const chosen=point===null?null:rows[Math.min(point,rows.length-1)];
  const falling=rows.at(-1)!.close<rows[0]!.close;
  return <div className="brief-chart" data-negative={falling}>
    <div className="brief-chart-readout"><span>{chosen?utcTime(chosen.timestamp):"Price history · USD"}</span><strong>{chosen?money(chosen.close):`${money(min)} – ${money(max)}`}</strong></div>
    <div className="brief-plot"><svg viewBox="0 0 616 200" preserveAspectRatio="none" role="img" aria-label={`${market.symbol} recorded price history, low ${money(min)}, high ${money(max)}`} onPointerLeave={()=>setPoint(null)} onPointerMove={event=>{
      const bounds=event.currentTarget.getBoundingClientRect();const target=(event.clientX-bounds.left)/bounds.width*616;
      let nearest=0;for(let i=1;i<rows.length;i++)if(Math.abs(x(rows[i]!.timestamp)-target)<Math.abs(x(rows[nearest]!.timestamp)-target))nearest=i;setPoint(nearest);
    }}>
      {[0,.5,1].map((ratio)=><line key={ratio} x1="16" x2="610" y1={16+ratio*174} y2={16+ratio*174} className="brief-chart-grid" />)}
      <path d={`${line} L${x(rows.at(-1)!.timestamp)},190 L16,190 Z`} className="brief-chart-area" />
      <path d={line} className="brief-chart-line" />
      {chosen&&<g><line x1={x(chosen.timestamp)} x2={x(chosen.timestamp)} y1="10" y2="195" className="brief-crosshair" /><circle cx={x(chosen.timestamp)} cy={y(chosen.close)} r="4" className="brief-chart-point" /></g>}
    </svg><div className="brief-axis-y" aria-hidden="true">{[0,.5,1].map(ratio=><span key={ratio}>{money(top-ratio*(top-bottom))}</span>)}</div></div>
    <div className="brief-axis-x" aria-hidden="true"><span>{new Date(rows[0]!.timestamp).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"})}<br/>{utcTime(rows[0]!.timestamp)}</span><span>{new Date(rows.at(-1)!.timestamp).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"})}<br/>{utcTime(rows.at(-1)!.timestamp)}</span></div>
    <details className="brief-price-values"><summary>View recorded price points</summary><ol>{rows.map(row=><li key={row.timestamp}><time dateTime={new Date(row.timestamp).toISOString()}>{utcTime(row.timestamp)}</time><span>{money(row.close)}</span></li>)}</ol></details>
  </div>;
}

export function MarketBrief() {
  const [brief,setBrief]=useState<PublicBrief|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let busy=false;
    const read=async()=>{
      if(busy||document.hidden)return;busy=true;
      try{
        const response=await fetch("/api/public-brief",{signal:controller.signal,credentials:"omit"});
        if(!response.ok)throw new Error("Snapshot unavailable");
        const data=await response.json() as PublicBrief;
        if(data.source!=="Nansen"||!Array.isArray(data.markets))throw new Error("Invalid snapshot");
        setBrief(data);setFailed(false);
      }catch{if(!controller.signal.aborted)setFailed(true);}finally{busy=false;}
    };
    void read();const timer=window.setInterval(()=>void read(),60_000);
    const visible=()=>{if(!document.hidden)void read();};document.addEventListener("visibilitychange",visible);
    return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[]);
  const market=brief?.markets.find(item=>item.id===selected)??brief?.markets[0];
  const state=failed&&market?"stale":brief?.state;
  const status=state==="sample"?"Recorded test data":state==="stale"?"Saved snapshot":market?"Latest snapshot":failed||brief?"Temporarily unavailable":"Loading Nansen data";
  const maxFlow=market?Math.max(1,...market.flows.map(flow=>Math.abs(flow.valueUsd??0))):1;
  return <section className="market-brief" id="market-brief" aria-labelledby="brief-title">
    <div className="brief-topline"><div><span className="brief-kicker">THE NANSEN READOUT</span><h2 id="brief-title">Market brief</h2></div><div className="brief-freshness" role="status"><span data-state={state}><i aria-hidden="true" />{status}</span>{brief?.asOf&&<time dateTime={new Date(brief.asOf).toISOString()}>{new Date(brief.asOf).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"})} · {utcTime(brief.asOf)}</time>}</div></div>
    {!market ? <div className="brief-unavailable"><Database size={28} aria-hidden="true" /><h3>{failed||brief?"The market snapshot is unavailable.":"Reading the latest market snapshot…"}</h3><p>{failed||brief?"We’ll show the next published Nansen snapshot here. No estimated prices or placeholder analysis.":"Fetching market prices, wallet flows and recorded price history."}</p><a href="https://app.nansen.ai/" target="_blank" rel="noopener noreferrer">Open Nansen <ArrowUpRight size={14} aria-hidden="true" /></a></div> : <>
      <div className="brief-watchlist" role="group" aria-label="Choose a market">{brief!.markets.map(item=><button key={item.id} type="button" aria-pressed={market.id===item.id} onClick={()=>setSelected(item.id)}><span className="brief-asset-label"><strong>{item.symbol}</strong><span>{item.chain}</span></span><span className="brief-asset-numbers"><strong>{money(item.priceUsd)}</strong><span data-unavailable={item.change24hPct===null} data-negative={(item.change24hPct??0)<0}>{change(item.change24hPct)}</span></span></button>)}</div>
      <div className="brief-detail"><div className="brief-main"><div className="brief-market-heading"><div><h3>{market.name}</h3><a href={market.nansenUrl} target="_blank" rel="noopener noreferrer" title={market.address}>{market.chain} · {market.address.slice(0,6)}…{market.address.slice(-4)} <ArrowUpRight size={12} aria-hidden="true" /></a></div><div className="brief-current-price"><small>Latest recorded close</small><strong>{money(market.priceUsd)}</strong><span data-unavailable={market.change24hPct===null} data-negative={(market.change24hPct??0)<0}>{change(market.change24hPct)}{market.change24hPct!==null&&<small> 24h</small>}</span></div></div>
        <PriceHistory key={market.id} market={market} />
        <dl className="brief-metrics"><div><dt>24h volume</dt><dd>{money(market.volume24hUsd,true)}</dd></div><div><dt>Market cap</dt><dd>{money(market.marketCapUsd,true)}</dd></div><div><dt>Market scope</dt><dd>{market.symbol} <span>on {market.chain}</span></dd></div></dl>
      </div><aside className="brief-flow"><div className="brief-flow-heading"><h3>Who’s moving money</h3><span>Net flow · 24h</span></div><div className="brief-flow-rows">{market.flows.map(flow=><div key={flow.label}><span>{flow.label}</span><strong data-unavailable={flow.valueUsd===null} data-negative={(flow.valueUsd??0)<0}>{signed(flow.valueUsd)}</strong>{flow.valueUsd!==null&&<span className="brief-flow-track" aria-hidden="true"><i style={{width:`${Math.abs(flow.valueUsd)/maxFlow*100}%`}} data-negative={flow.valueUsd<0}/></span>}</div>)}</div><div className="brief-analysis"><span>THE READ</span><h4>{market.analysis.title}</h4><p>{market.analysis.body}</p></div></aside></div>
      <div className="brief-source"><span><img src="/logos/nansen.svg" alt="" width={18} height={18}/> Data from <strong>Nansen</strong></span><p><Clock3 size={12} aria-hidden="true" /> Cached snapshot · exact markets, not chain-wide totals</p><a href={market.nansenUrl} target="_blank" rel="noopener noreferrer">Inspect on Nansen <ArrowUpRight size={14} aria-hidden="true" /></a></div>
    </>}
  </section>;
}
