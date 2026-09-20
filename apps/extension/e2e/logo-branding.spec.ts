import path from "node:path";
import { expect, test } from "./fixtures";

test("Tripwire popup and manifest use the generated application mark",async({context,extensionId})=>{
  const popup=await context.newPage();
  await popup.setViewportSize({width:420,height:720});
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const mark=popup.locator(".tw-wordmark img");
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute("src",/\/logos\/tripwire\.png$/);
  await expect.poll(()=>mark.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(256);
  expect(await popup.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const manifest=await context.serviceWorkers()[0]!.evaluate(()=>{
    const c=(globalThis as unknown as {chrome:{runtime:{getManifest():{icons:Record<string,string>;action:{default_icon:Record<string,string>}}}}}).chrome;
    const {icons,action}=c.runtime.getManifest();return {icons,action};
  });
  for(const size of [16,32,48,128])expect(manifest.icons[String(size)]).toBe(`icons/icon-${size}.png`);
  expect(manifest.action.default_icon["16"]).toBe("icons/icon-16.png");
  await popup.screenshot({path:path.resolve("../../scratch/review/tripwire-logo-popup.png")});
});
