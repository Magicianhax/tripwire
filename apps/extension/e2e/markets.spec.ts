import path from "node:path";
import { BACKEND, expect, test } from "./fixtures";

test("unsupported DEX assets can explore perps without changing their trade check",async({context})=>{
  const market={id:"hyperliquid:SUI",kind:"perp",chain:"hyperliquid",symbol:"SUI",name:"Sui perpetual",address:"SUI",priceUsd:4,volume24hUsd:1000000,marketCapUsd:null,match:"exact",detailTarget:{kind:"perp",coin:"SUI"},nansenUrl:"https://app.nansen.ai/token-god-mode?chain=hyperliquid&tokenAddress=SUI"};
  await context.route(`${BACKEND}/api/markets`,async route=>{
    expect(route.request().postDataJSON()).toEqual({symbol:"SUI"});
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({symbol:"SUI",markets:[market],errors:[],replay:true})});
  });
  const page=await context.newPage();
  await page.route("https://jumper.xyz/**",route=>route.fulfill({path:path.resolve("e2e/pages/jumper-markets.html"),contentType:"text/html"}));
  await page.goto("https://jumper.xyz/?toChain=9270000000000000&toToken=sui");
  const strip=page.locator(".tw-strip");
  await expect(strip).toHaveAttribute("data-verdict","UNCHECKED",{timeout:20000});
  await strip.getByRole("button",{name:"Markets",exact:true}).click();
  await page.getByRole("button",{name:"Explore perps",exact:true}).click();
  await expect(page.getByRole("tab",{name:"Positioning",exact:true})).toBeVisible();
  await expect(strip).toHaveAttribute("data-verdict","UNCHECKED");
  await expect(page.locator(".tw-block")).toHaveCount(0);
});

test("X market explorer separates chains and perps and opens only the chosen market",async({context},testInfo)=>{
  await context.route(`${BACKEND}/api/resolve`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({best:null,candidates:[]})}));
  const rows=[
    {id:"hyperliquid:ZEC",kind:"perp",chain:"hyperliquid",symbol:"ZEC",name:"Zcash perpetual",address:"ZEC",priceUsd:1480,volume24hUsd:552100000,marketCapUsd:68800000,match:"exact",detailTarget:{kind:"perp",coin:"ZEC"}},
    {id:"near:zec.omft.near",kind:"spot",chain:"near",symbol:"ZEC",name:"Zcash on Near",address:"zec.omft.near",priceUsd:1470,volume24hUsd:71300000,marketCapUsd:68800000,match:"exact",detailTarget:null},
    {id:"solana:zec",kind:"spot",chain:"solana",symbol:"ZEC",name:"Zcash on Solana",address:"A7bdyourmarkethere",priceUsd:1470,volume24hUsd:24300000,marketCapUsd:151100000,match:"exact",detailTarget:null},
  ].map(row=>({...row,nansenUrl:`https://app.nansen.ai/token-god-mode?chain=${row.chain}&tokenAddress=${row.address}`}));
  await context.route(`${BACKEND}/api/markets`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({symbol:"ZEC",markets:rows,errors:[],replay:true})}));
  const targets:unknown[]=[];
  await context.route(`${BACKEND}/api/guard`,async route=>{targets.push(route.request().postDataJSON().target);await route.continue();});
  const page=await context.newPage();
  await page.route("https://x.com/home",route=>route.fulfill({path:path.resolve("e2e/pages/x-markets.html"),contentType:"text/html"}));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("https://x.com/home");
  const chip=page.locator(".tw-chip");await expect(chip).toBeVisible({timeout:20000});await chip.click();
  await expect(page.locator(".tw-market-option")).toHaveCount(2);
  expect(targets).toHaveLength(0);
  await page.getByRole("button",{name:"Expand card"}).click();
  await expect(page.locator(".tw-market-option")).toHaveCount(3);
  await expect(page.getByRole("heading",{name:/Spot volume distribution/})).toBeVisible();
  await expect(page.getByRole("heading",{name:/Perp markets/})).toBeVisible();
  await page.locator(".tw-pop").evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));
  await page.screenshot({path:testInfo.outputPath("markets-zec.png")});
  await page.getByRole("button",{name:"Explore perps",exact:true}).click();
  await expect(page.getByRole("tab",{name:"Positioning",exact:true})).toBeVisible();
  expect(targets).toContainEqual({kind:"perp",coin:"ZEC"});
  await expect(page.getByRole("tab",{name:"Markets",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Back to markets"}).click();
  await expect(page.locator(".tw-market-option")).toHaveCount(3);
});
