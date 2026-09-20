// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { PerpPosition } from "@tripwire/core";
import { LiquidationChart, liquidationClusters } from "../lib/ui/LiquidationChart";

const position=(side:"Long"|"Short", liquidation:number|null, value:number):PerpPosition=>({address:"0xabc",address_label:null,side,liquidation_price:liquidation,position_value_usd:value,mark_price:100,entry_price:100,leverage:null,upnl_usd:null});
describe("liquidation chart",()=>{
  it("preserves distinct price labels for low-priced instruments",()=>{
    const el=document.createElement("div");const root=createRoot(el);
    act(()=>root.render(<LiquidationChart positions={[position("Long",.000018,3000)]} markPrice={.00002} height={320}/>));
    expect(el.textContent).toContain("$0.00002");
    expect(el.textContent).toContain("$0.000023");
    expect(el.textContent).toContain("$0.000017");
    act(()=>root.unmount());
  });
  it("aggregates nearby reported positions and separates long/short values",()=>{
    const rows=[position("Long",91,1000),position("Long",92,2000),position("Short",108,4000),position("Long",null,999),position("Short",150,999)];
    const buckets=liquidationClusters(rows,100);
    expect(buckets).toHaveLength(2);
    expect(buckets.find(b=>b.side==="Long")).toMatchObject({count:2,value:3000,low:90,high:92.5});
    expect(liquidationClusters(rows,0)).toEqual([]);
  });
  it("labels prices, uses the requested expanded height and exposes focused-bar details",()=>{
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
    act(()=>root.render(<LiquidationChart positions={[position("Long",91,3000)]} markPrice={100} height={320}/>));
    expect(el.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 440 320");
    expect(el.textContent).toContain("$100");expect(el.textContent).toContain("largest $3K");
    const bar=el.querySelector('g[tabindex="0"]')!;
    act(()=>bar.dispatchEvent(new FocusEvent("focusin",{bubbles:true})));
    expect(el.querySelector('[role="status"]')?.textContent).toContain("1 long position");
    expect(el.querySelector('[role="status"]')?.textContent).toContain("$90");
    act(()=>root.unmount());el.remove();
  });
});
