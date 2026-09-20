import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { cardSize, setCardSize } from "../card-size";
import { runContentTask } from "../content-lifecycle";
import { MarketsOnlyCard } from "../ui/MarketsView";
import { mountReact } from "../ui/mount";
import { Popover } from "../ui/Popover";
import { originPrefix } from "./headline";
import type { createMountTracker } from "./mounts";
import type { TokenOrigin } from "./parse";

/** How each source reads inside a sentence, for the chip's accessible name. */
const ORIGIN_SPOKEN: Record<Exclude<TokenOrigin, "post">, string> = {
  quote: "quoted post",
  card: "link preview",
  image: "image description",
};

/**
 * Cashtags without a supported spot contract can still expose Nansen's market catalog.
 *
 * `origin` says where the ticker was read from. A cashtag inside a quoted post, a link preview
 * or an image description is not the outer author's word, and the chip says so before it is
 * opened: the catalog itself makes no claim about anyone, but the chip sits under their post.
 */
export async function attachMarketsOnly({ctx,mounts,article,anchor,append="after",symbol,origin="post",css,zIndex,stopHostClicks}: {
  ctx:ContentScriptContext; mounts:ReturnType<typeof createMountTracker>; article:Element; anchor:Element;
  append?:"after"|"before"; symbol:string; origin?:TokenOrigin; css?:string;
  zIndex:number; stopHostClicks:(host:HTMLElement)=>void;
}) {
  let card:Awaited<ReturnType<typeof mountReact>>|null=null;
  let chip:Awaited<ReturnType<typeof mountReact>>|null=null;
  let opening=false;
  let size=cardSize("spot");
  const value=originPrefix(origin,"Spot and perp markets");
  const label=origin==="post"?`Explore ${symbol} markets`:`Explore ${symbol} markets, named in the ${ORIGIN_SPOKEN[origin]}, not in this post's own words`;
  const chipNode=()=> <button type="button" className="tw-chip" aria-label={label} aria-expanded={card!==null || opening} aria-haspopup="dialog" onClick={()=>void runContentTask(ctx,toggle)}>
    <span className="tw-chip-key">${symbol}</span><span className="tw-chip-value" title={value}>{value}</span>
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
  chip=await mountReact(ctx,{position:"inline",anchor,append,css},chipNode());
  if(!article.isConnected){chip.ui.remove();return null;}
  stopHostClicks(chip.ui.shadowHost);mounts.track(article,chip);
  // The host, so a second token's chip can be appended after this one instead of ahead of it.
  return chip.ui.shadowHost;
}
