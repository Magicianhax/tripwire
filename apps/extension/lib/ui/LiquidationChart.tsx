import { useLayoutEffect, useRef, useState } from "react";
import type { PerpPosition } from "@tripwire/core";
import { usd } from "./format";

const price = (value:number) => `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;

export function liquidationClusters(positions:PerpPosition[],mark:number) {
  if(!Number.isFinite(mark)||mark<=0)return [];
  const low=mark*.85, step=mark*.3/12;
  const buckets=new Map<string,{side:string;low:number;high:number;value:number;count:number}>();
  for(const p of positions){
    const liquidation=p.liquidation_price;
    if(liquidation===null||!Number.isFinite(liquidation)||liquidation<low||liquidation>mark*1.15||!Number.isFinite(p.position_value_usd)||p.position_value_usd<0)continue;
    const index=Math.min(11,Math.floor((liquidation-low)/step));
    const key=`${p.side}:${index}`;
    const bucket=buckets.get(key)??{side:p.side,low:low+index*step,high:low+(index+1)*step,value:0,count:0};
    bucket.value+=p.position_value_usd;bucket.count++;buckets.set(key,bucket);
  }
  return [...buckets.values()].sort((a,b)=>b.low-a.low);
}

/** Aggregated reported position values, not a market-wide liquidation forecast. */
export function LiquidationChart({positions,markPrice,height}:{positions:PerpPosition[];markPrice:number;height:number}){
  const container=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(440);
  const [active,setActive]=useState<string|null>(null);
  useLayoutEffect(()=>{
    const el=container.current;if(!el)return;
    const measure=()=>{const w=el.getBoundingClientRect().width;if(w>0)setWidth(w);};
    measure();const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):null;
    observer?.observe(el);return()=>observer?.disconnect();
  },[]);
  const clusters=liquidationClusters(positions,markPrice);
  const left=76,right=12,top=30,bottom=32;
  const plotWidth=Math.max(1,width-left-right),plotHeight=height-top-bottom;
  const center=left+plotWidth/2;
  const y=(value:number)=>top+(markPrice*1.15-value)/(markPrice*.3)*plotHeight;
  const max=Math.max(1,...clusters.map(c=>c.value));
  const describe=(c:typeof clusters[number])=>`${c.count} ${c.side.toLowerCase()} position${c.count===1?"":"s"}: liquidation ${price(c.low)}–${price(c.high)}; position value ${usd(c.value)}.`;
  return <div ref={container} className="tw-liquidation-chart">
    {clusters.length ? <>
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Reported liquidation levels around mark price ${price(markPrice)}`}>
        <rect x={left} y={y(markPrice*1.03)} width={plotWidth} height={y(markPrice*.97)-y(markPrice*1.03)} className="tw-liquidation-band"/>
        {[15,10,5,0,-5,-10,-15].map(pct=><g key={pct}>
          <line x1={left} x2={width-right} y1={y(markPrice*(1+pct/100))} y2={y(markPrice*(1+pct/100))} className={pct===0?"tw-liquidation-current":"tw-liquidation-grid"}/>
          <text x={left-8} y={y(markPrice*(1+pct/100))+4} textAnchor="end">{price(markPrice*(1+pct/100))}</text>
        </g>)}
        <line x1={center} x2={center} y1={top} y2={height-bottom} className="tw-liquidation-grid"/>
        <text x={left} y={14}>Long positions</text><text x={width-right} y={14} textAnchor="end">Short positions</text>
        {clusters.map((c)=>{
          const w=Math.max(3,c.value/max*(plotWidth/2-6));
          const barHeight=Math.max(5,plotHeight/12-3);
          const isLong=c.side==="Long";
          return <g key={`${c.side}:${c.low}`} role="img" tabIndex={0} aria-label={describe(c)} onMouseEnter={()=>setActive(describe(c))} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(describe(c))} onBlur={()=>setActive(null)}>
            <title>{describe(c)}</title>
            <rect x={isLong?center-w:center} y={y((c.low+c.high)/2)-barHeight/2} width={w} height={barHeight} rx={2} fill={isLong?"var(--tw-mint)":"var(--tw-red)"}/>
          </g>;
        })}
        <text x={center} y={height-8} textAnchor="middle">Bar length: position value · largest {usd(max)}</text>
      </svg>
      <p className="tw-meta">Mark <b className="tw-fig">{price(markPrice)}</b> · Shaded band ±3% · View ±15%</p>
      <p className="tw-liquidation-detail" role="status">{active??"Hover or focus a bar to inspect its price range and position value."}</p>
    </> : <p className="tw-empty">No returned positions liquidate within 15% of the current mark.</p>}
  </div>;
}
