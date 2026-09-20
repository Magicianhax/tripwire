import { expect, LENS_WALLET, test } from "./fixtures";

test("Polymarket leaderboard badge sits beside the name above the stretched link and opens by mouse and keyboard", async ({context}) => {
  const page = await context.newPage();
  await page.route("https://polymarket.com/leaderboard", route => route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>
    body{background:#0b1015;color:white;font:16px Arial;padding:60px}li{position:relative;isolation:isolate;display:flex;flex-direction:column;padding:20px;border-bottom:1px solid #333}
    .rowlink::after{content:"";position:absolute;inset:0;z-index:10}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .content{position:relative;z-index:20;pointer-events:none;display:flex;align-items:center;gap:20px}.identity{display:flex;align-items:center;gap:6px}.clip{overflow:hidden;min-width:0}p{margin:0}.pnl{margin-left:auto}
    </style></head><body><ul><li><a class="rowlink" href="/profile/${LENS_WALLET}"><span class="sr-only">SPCEXBUYER</span></a><div class="content"><span>3</span><div class="identity"><div class="clip"><p>SPCEXBUYER</p></div></div><span class="pnl">+$4,155,829</span></div></li></ul></body></html>`}));
  await page.goto("https://polymarket.com/leaderboard");
  const badge = page.locator(".tw-wallet-marker");
  await expect(badge).toBeVisible();
  const name = (await page.locator("p").boundingBox())!;
  const button = (await badge.boundingBox())!;
  expect(button.width).toBe(28);
  expect(button.height).toBe(28);
  expect(Math.abs(button.y + button.height/2 - name.y - name.height/2)).toBeLessThan(2);
  expect(button.x - name.x - name.width).toBeGreaterThanOrEqual(4);
  expect(button.x - name.x - name.width).toBeLessThanOrEqual(8);
  if (process.env.TRIPWIRE_CAPTURE) await page.screenshot({path:"../../scratch/review/polymarket-badges.png"});
  await badge.click();
  await expect(page.locator(".tw-wallet-card")).toBeVisible();
  expect(page.url()).toBe("https://polymarket.com/leaderboard");
  await page.keyboard.press("Escape");
  await expect(page.locator(".tw-wallet-card")).toHaveCount(0);
  await badge.press("Enter");
  await expect(page.locator(".tw-wallet-card")).toBeVisible();
  expect(page.url()).toBe("https://polymarket.com/leaderboard");
});
