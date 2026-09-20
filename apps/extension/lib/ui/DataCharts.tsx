import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon } from "./icons";
import { usd } from "./format";
import { NansenRowLink } from "./NansenRowLink";

const COLORS = ["var(--tw-mint)", "#55bfe8", "#a5c8cb", "var(--tw-amber)", "var(--tw-text-3)"];

/** Relative composition of real returned values, never a fabricated historical trend. */
export function AllocationChart({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const positive = rows.filter(row => Number.isFinite(row.value) && row.value > 0).sort((a,b) => b.value-a.value);
  const total = positive.reduce((sum,row) => sum+row.value,0);
  if (!total) return null;
  const shown = positive.slice(0,4);
  const other = positive.slice(4).reduce((sum,row) => sum+row.value,0);
  if (other) shown.push({label:"Other",value:other});
  return <figure className="tw-allocation" aria-label={label}>
    <div className="tw-allocation-bar" aria-hidden="true">{shown.map((row,i) => <span key={i} style={{width:`${row.value/total*100}%`,background:COLORS[i]}} />)}</div>
    <ul className="tw-allocation-legend">{shown.map((row,i) => <li key={i}><i style={{background:COLORS[i]}} /><span className="tw-row-name">{row.label}</span><span className="tw-fig">{row.value/total*100 < .01 ? "<0.01" : (row.value/total*100).toFixed(2)}%</span></li>)}</ul>
  </figure>;
}

/** `note` is a second figure for the same row — Round 1.5.2 uses it for the row's realized ROI,
 * which arrives with the PnL and had no place to be drawn. Omitted rows read exactly as before. */
export function PnlChart({ rows }: { rows: {label:string;value:number|null;href?:string|null;note?:string|null}[] }) {
  const known=rows.filter((r):r is {label:string;value:number;href?:string|null;note?:string|null}=>r.value!==null && Number.isFinite(r.value));
  const max=Math.max(1,...known.map(r=>Math.abs(r.value)));
  return <div className="tw-pnl-chart" aria-label="Realized profit and loss by token">{known.slice(0,5).map((r,i)=><div className="tw-pnl-chart-row" key={i}>
    <span className="tw-holding-name"><span className="tw-row-name">{r.label}</span><NansenRowLink href={r.href??null} subject={r.label}/></span><span className="tw-pnl-track" aria-hidden="true"><i data-sign={r.value<0?"neg":"pos"} style={{width:`${Math.abs(r.value)/max*100}%`}} /></span><span className="tw-fig" data-sign={r.value<0?"neg":r.value>0?"pos":"zero"}>{usd(r.value,true)}{r.note?<span className="tw-meta tw-pnl-note"> {r.note}</span>:null}</span>
  </div>)}</div>;
}

export function usePagination<T>(rows:T[], pageSize=5) {
  const [requested,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const page=Math.min(requested,pages-1);
  return { rows:rows.slice(page*pageSize,(page+1)*pageSize), controls: rows.length>pageSize ? <div className="tw-pager">
    <span>{page*pageSize+1}–{Math.min((page+1)*pageSize,rows.length)} of {rows.length}</span>
    <button type="button" aria-label="Previous page" disabled={page===0} onClick={()=>setPage(page-1)}><Icon icon={ChevronLeft} size={14}/></button>
    <button type="button" aria-label="Next page" disabled={page===pages-1} onClick={()=>setPage(page+1)}><Icon icon={ChevronRight} size={14}/></button>
  </div>:null };
}
