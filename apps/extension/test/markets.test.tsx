// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketCatalog } from "../lib/api-types";
const mocks=vi.hoisted(()=>({markets:vi.fn()}));
vi.mock("../lib/api",()=>({markets:mocks.markets}));
import { MarketsView } from "../lib/ui/MarketsView";

const catalog:MarketCatalog={symbol:"ZEC",errors:[],replay:false,markets:[
  {id:"hyperliquid:ZEC",kind:"perp",chain:"hyperliquid",symbol:"ZEC",name:"Zcash perpetual",address:"ZEC",priceUsd:1500,volume24hUsd:500000000,marketCapUsd:null,match:"exact",detailTarget:{kind:"perp",coin:"ZEC"},nansenUrl:"https://app.nansen.ai/token-god-mode?chain=hyperliquid&tokenAddress=ZEC"},
  {id:"near:zec.omft.near",kind:"spot",chain:"near",symbol:"ZEC",name:"Zcash",address:"zec.omft.near",priceUsd:1490,volume24hUsd:71000000,marketCapUsd:null,match:"exact",detailTarget:null,nansenUrl:"https://app.nansen.ai/token-god-mode?chain=near&tokenAddress=zec.omft.near"},
]};
afterEach(()=>{document.body.replaceChildren();vi.clearAllMocks();});
describe("market comparison",()=>{
  it("preserves numeric ticker prefixes",async()=>{
    mocks.markets.mockResolvedValue({ok:true,status:200,data:{symbol:"1INCH",markets:[],errors:[],replay:false}});
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
    await act(async()=>root.render(<MarketsView symbol="1INCH" active onExplore={()=>{}}/>));
    expect(mocks.markets).toHaveBeenCalledWith("1INCH");
    act(()=>root.unmount());
  });
  it("waits for selection, keeps spot and perps distinct, and only explores an explicit market",async()=>{
    mocks.markets.mockResolvedValue({ok:true,status:200,data:catalog});
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);const explore=vi.fn();
    await act(async()=>root.render(<MarketsView symbol="ZEC" active={false} onExplore={explore}/>));
    expect(mocks.markets).not.toHaveBeenCalled();
    await act(async()=>root.render(<MarketsView symbol="ZEC" active onExplore={explore}/>));
    expect(mocks.markets).toHaveBeenCalledWith("ZEC");
    expect(el.textContent).toContain("Perps · hyperliquid");expect(el.textContent).toContain("Spot · near");
    expect(explore).not.toHaveBeenCalled();
    const link=el.querySelector('a[href*="chain=near"]')!;
    expect(new URL(link.getAttribute("href")!).searchParams.get("tokenAddress")).toBe("zec.omft.near");
    const button=[...el.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Explore perps")!;
    act(()=>button.click());expect(explore).toHaveBeenCalledWith(catalog.markets[0]);
    act(()=>root.unmount());
  });
});
