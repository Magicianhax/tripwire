import path from "node:path";
import { BACKEND, expect, test } from "./fixtures";

test("screenshots fill the width with no frame copy and cycle automatically",async({context})=>{
  const page=await context.newPage();
  const requests:string[]=[];page.on("request",request=>requests.push(new URL(request.url()).pathname));
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.clock.install();
  await page.setViewportSize({width:1440,height:1000});await page.goto(BACKEND);
  const root=page.locator(".site-showcase"),active=page.locator('.showcase-stage img[data-active=true]');
  await expect(page.getByRole("heading",{level:1})).toContainText("Onchain intelligence.");
  expect((await page.locator(".product-hero").boundingBox())!.height).toBeGreaterThan(850);
  expect((await root.boundingBox())!.y).toBeGreaterThanOrEqual(950);
  await root.scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator(".showcase-stage img").evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect(root.locator("a,h2,p,figcaption")).toHaveCount(0);
  await expect(root).not.toContainText(/THE EXTENSION|See it|View full|Hyperliquid|point-in-time/);
  const stage=(await page.locator(".showcase-stage").boundingBox())!,image=(await active.boundingBox())!;
  expect(image.width).toBeCloseTo(stage.width,0);expect(image.width).toBeGreaterThan(1100);
  expect(stage.height/stage.width).toBeCloseTo(9/16,2);
  await expect(active).toHaveAttribute("src","/showcase/exit-liquidity.jpg");
  await expect(root).toHaveAttribute("data-rotating","true");
  await root.hover();await page.clock.fastForward(3100);
  await expect(active).toHaveAttribute("src","/showcase/hyperliquid.jpg");
  // Hovering the large image must not silently stop the entire slideshow.
  await page.clock.fastForward(3100);
  await expect(active).toHaveAttribute("src","/showcase/x-profile.jpg");
  await page.getByRole("button",{name:"Next screenshot",exact:true}).click();
  await expect(active).toHaveAttribute("src","/showcase/jumper.jpg");
  await expect(page.locator(".showcase-track")).toHaveCSS("transition-property","transform");
  await page.getByRole("button",{name:"Previous screenshot",exact:true}).click();
  await expect(active).toHaveAttribute("src","/showcase/x-profile.jpg");
  await page.getByRole("button",{name:"Pause slideshow",exact:true}).click();
  await page.mouse.move(0,0);await page.clock.fastForward(15000);
  await expect(active).toHaveAttribute("src","/showcase/x-profile.jpg");
  await page.getByRole("button",{name:"Show Polymarket",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(active).toHaveAttribute("src","/showcase/polymarket.jpg");
  await expect(page.getByRole("button",{name:"Play slideshow",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Play slideshow",exact:true}).click();await page.mouse.move(0,0);await expect(root).toHaveAttribute("data-rotating","true");await page.clock.fastForward(3100);
  await expect(active).toHaveAttribute("src","/showcase/dexscreener.jpg");
  await page.clock.fastForward(3100);
  await expect(active).toHaveAttribute("src","/showcase/exit-liquidity.jpg");
  await page.clock.fastForward(600);
  await expect(page.locator(".showcase-track")).toHaveAttribute("style","transform: translateX(-100%);");
  await page.keyboard.press("Tab");
  await page.getByRole("button",{name:"Next screenshot",exact:true}).focus();
  await page.clock.fastForward(10000);
  await expect(active).toHaveAttribute("src","/showcase/exit-liquidity.jpg");
  expect(requests).not.toContain("/api/public-brief");
  await page.getByRole("button",{name:"Show Exit liquidity",exact:true}).click();
  const previous=page.getByRole("button",{name:"Previous screenshot",exact:true});
  await previous.click();await previous.click({force:true});
  await expect(active).toHaveAttribute("src","/showcase/dexscreener.jpg");
  await page.clock.fastForward(600);
  await expect(page.locator(".showcase-track")).toHaveAttribute("style","transform: translateX(-600%);");
  const next=page.getByRole("button",{name:"Next screenshot",exact:true});
  await next.click();await next.click({force:true});
  await expect(active).toHaveAttribute("src","/showcase/exit-liquidity.jpg");
  await page.clock.fastForward(600);
  await expect(page.locator(".showcase-track")).toHaveAttribute("style","transform: translateX(-100%);");
  await page.screenshot({path:path.resolve("../../scratch/review/showcase-minimal-desktop.png"),fullPage:true});
});

test("reduced motion starts paused and screenshots fit small screens",async({context})=>{
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});await page.clock.install();
  await page.setViewportSize({width:390,height:844});await page.goto(BACKEND);await page.locator(".site-showcase").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button",{name:"Play slideshow",exact:true})).toBeVisible();
  await page.clock.fastForward(22000);
  await expect(page.locator('.showcase-stage img[data-active=true]')).toHaveAttribute("src","/showcase/exit-liquidity.jpg");
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const sizes=await page.locator(".showcase-stage").evaluate(el=>({frame:el.clientWidth,image:el.querySelector("img")!.clientWidth}));
    expect(sizes.image).toBe(sizes.frame);
    await page.getByRole("button",{name:"Show Jumper",exact:true}).click();
    await expect(page.locator('.showcase-stage img[data-active=true]')).toHaveAttribute("src","/showcase/jumper.jpg");
  }
  await page.screenshot({path:path.resolve("../../scratch/review/showcase-minimal-mobile.png"),fullPage:true});
});
