import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { cardSize, setCardSize } from "../card-size";
import { runContentTask } from "../content-lifecycle";
import { MarketsOnlyCard } from "../ui/MarketsView";
import { mountReact } from "../ui/mount";
import { Popover } from "../ui/Popover";
import type { createMountTracker } from "./mounts";

/** Cashtags without a supported spot contract can still expose Nansen's market catalog. */
export async function attachMarketsOnly({ctx,mounts,article,anchor,symbol,zIndex,stopHostClicks}: {
  ctx:ContentScriptContext; mounts:ReturnType<typeof createMountTracker>; article:Element; anchor:Element;
  symbol:string; zIndex:number; stopHostClicks:(host:HTMLElement)=>void;
}) {
  let card:Awaited<ReturnType<typeof mountReact>>|null=null;
  let chip:Awaited<ReturnType<typeof mountReact>>|null=null;
  let opening=false;
  let size=cardSize("spot");
  const chipNode=()=> <button type="button" className="tw-chip" aria-label={`Explore ${symbol} markets`} aria-expanded={card!==null || opening} aria-haspopup="dialog" onClick={()=>void runContentTask(ctx,toggle)}>
    <span className="tw-chip-key">${symbol}</span><span className="tw-chip-value">Spot and perp markets</span>
  </button>;
  function close() {
    opening=false;
    if(card){mounts.untrack(article,card);card.ui.remove();card=null;}
    chip?.update(chipNode());
  }
  async function toggle() {
    if(card||opening){close();return;}
    opening=true; chip?.update(chipNode());
    const button=chip?.ui.shadow.querySelector<HTMLButtonElement>(".tw-chip")??null;
    const render=()=> <Popover anchor={button} returnFocus={()=>button} onClose={close} size={size}
      onToggleSize={()=>{size=size==="compact"?"expanded":"compact";setCardSize("spot",size);card?.update(render());}}>
      <MarketsOnlyCard symbol={symbol} onClose={close}/>
    </Popover>;
    const mounted=await mountReact(ctx,{position:"modal",zIndex},render());
    if(!opening||!article.isConnected){mounted.ui.remove();return;}
    card=mounted;opening=false;stopHostClicks(card.ui.shadowHost);mounts.track(article,card);
    chip?.update(chipNode());
  }
  chip=await mountReact(ctx,{position:"inline",anchor,append:"after"},chipNode());
  if(!article.isConnected){chip.ui.remove();return;}
  stopHostClicks(chip.ui.shadowHost);mounts.track(article,chip);
}
