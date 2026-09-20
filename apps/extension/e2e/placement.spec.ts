import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, WBTC_BASE, WIF } from "./fixtures";

/**
 * Round 1.6 — placement and visibility, in a real browser at the size the product is used at.
 *
 * The report this answers: "on dexscreener positions of banners we are showing are on odd
 * places like someone cannot catch without having good eye". So every venue is checked against
 * the same three conditions from `docs/briefs/placement-visibility.md`:
 *
 * 1. Exactly ONE primary surface is mounted — one strong placement, never several weak ones.
 * 2. Its box is inside the 1440x900 viewport at the page's DEFAULT scroll. Nothing is scrolled
 *    to before measuring; that is the whole point.
 * 3. It is not inside a scrolling data grid or a virtualised list.
 *
 * With TRIPWIRE_CAPTURE=1 each venue also writes `placement-<venue>.png` — the full page at
 * 1440x900 with the element visible, so the placement can be judged by eye and not only by a
 * bounding box.
 */

const VIEWPORT = { width: 1440, height: 900 };
const OUT = path.resolve("../../.impeccable/review");
const PRIMARY = ".tw-strip, .tw-block, .tw-dock-chip";

/** DexScreener's live layout at 1440x900, read from the real site on 2026-09-20 and reduced to
 * the structure the adapter reads: a left nav, a chart panel whose top strip is the trending
 * rail and whose body is an iframe over a Virtuoso transactions pane, and a right data panel
 * headed by the token name, then the pair identity row, then the price readouts. */
const DEXSCREENER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>$WIF / SOL — DEX Screener (e2e stub)</title>
<style>
  body { margin: 0; background: #0b0e12; color: #e7edf3; font: 14px system-ui, sans-serif; display: flex; }
  nav { width: 210px; flex: none; padding: 12px; border-right: 1px solid #1d2733; }
  main { flex: 1; display: flex; }
  .chart { flex: 1; display: flex; flex-direction: column; }
  .trending { display: flex; gap: 8px; height: 46px; align-items: center; padding: 0 8px; overflow-x: auto; }
  .trending a { white-space: nowrap; color: inherit; }
  iframe { flex: none; height: 539px; border: 0; background: #11161d; }
  .txns { flex: 1; overflow-y: auto; border-top: 1px solid #1d2733; }
  .panel { width: 334px; flex: none; border-left: 1px solid #1d2733; }
  .panel header { height: 46px; display: flex; align-items: center; padding: 0 12px; border-bottom: 1px solid #1d2733; }
  .panel header h2, .pair h2 { margin: 0; font-size: 15px; }
  .pad { padding: 8px 12px; }
  .pair { display: flex; flex-direction: column; gap: 4px; }
  .pair ul { display: flex; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .pair a { color: #9fb0c0; }
  .stats { padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style></head><body>
  <nav>Explore</nav>
  <main>
    <div class="chart">
      <div class="trending">
        <a href="/solana/4r8cimnjwdnoes3fqi1ccpfjygpxazahawphrn3rzenj">#1 JEANPHIL</a>
        <a href="/solana/eyeeg5fzzeigsqv7judxydepnspl382kyvfxaanxvmed">#2 Stryker</a>
        <a href="/solana/2fwy38cjcchcvysa9cd5safaeptzqwn2ssfip43hnshu">#3 TIGRINO</a>
      </div>
      <iframe title="chart"></iframe>
      <div class="txns" data-testid="virtuoso-scroller" data-virtuoso-scroller="true">
        <div data-index="0">buy 0.4 SOL</div><div data-index="1">sell 1.2 SOL</div><div data-index="2">buy 9 SOL</div>
      </div>
    </div>
    <div class="panel">
      <header><h2 title="dogwifhat">dogwifhat</h2></header>
      <div class="pad">
        <div class="pair" id="pair-header">
          <h2>$WIF<button type="button">Copy token address</button>/SOL</h2>
          <ul><li><a href="/solana">Solana</a></li><li><a href="/solana/orca">Orca</a></li></ul>
        </div>
      </div>
      <div class="stats" id="price-stats"><span>Price USD</span><span>$0.1966</span><span>Liquidity</span><span>$146K</span></div>
    </div>
  </main>
</body></html>`;

/** pump.fun's coin page, reduced to the trade panel the adapter anchors to. */
const PUMPFUN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>pump.fun (e2e stub)</title>
<style>
  body { margin: 0; background: #0b1015; color: #e7edf3; font: 14px system-ui, sans-serif; display: flex; gap: 16px; padding: 16px; }
  #chart { flex: 1; height: 520px; background: #11161d; border-radius: 12px; }
  #panel { width: 316px; flex: none; display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid #1d2733; border-radius: 12px; }
  #amount { height: 40px; padding: 0 12px; border: 1px solid #2a3542; border-radius: 10px; background: #0b1015; color: inherit; }
  #primary { height: 40px; border: none; border-radius: 10px; background: #5fd08a; color: #06110a; font-weight: 700; }
</style></head><body>
  <div id="chart"></div>
  <section id="panel">
    <input id="amount" placeholder="0.00" />
    <button id="primary" type="button">Place Trade</button>
  </section>
</body></html>`;

/** The one surface that should be on the page, measured where the user first sees it. */
async function primarySurface(page: Page) {
  const surfaces = page.locator(PRIMARY);
  await expect(surfaces.first()).toBeVisible({ timeout: 25_000 });
  // One strong placement, not several weak ones.
  await expect(surfaces).toHaveCount(1);
  // Polled, not read once: the runner re-binds the strip on every MutationObserver tick, so a
  // node measured between a remove and the next insert legitimately has no box yet. This is
  // about where the surface settles, not about catching it mid-rebind.
  let box: Awaited<ReturnType<typeof surfaces.boundingBox>> = null;
  await expect
    .poll(async () => {
      box = await surfaces
        .first()
        .boundingBox()
        .catch(() => null);
      return box !== null;
    }, { timeout: 15_000, message: "the mounted surface settles into a box" })
    .toBe(true);
  return { locator: surfaces.first(), box: box! };
}

/** The brief's condition, asserted rather than eyeballed: at the page's DEFAULT scroll — this
 * helper never scrolls — the surface is inside the first 1440x900 screenful. */
function expectInFirstViewport(box: { x: number; y: number; width: number; height: number }, label: string): void {
  expect(box.width, `${label}: has width`).toBeGreaterThan(0);
  expect(box.height, `${label}: has height`).toBeGreaterThan(0);
  expect(box.y, `${label}: starts at or below the top of the page`).toBeGreaterThanOrEqual(0);
  expect(box.x, `${label}: starts at or right of the left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x, `${label}: starts inside the viewport width`).toBeLessThan(VIEWPORT.width);
  expect(box.y + Math.min(box.height, 24), `${label}: at least 24px of it is above the fold`).toBeLessThanOrEqual(VIEWPORT.height);
}

async function shoot(page: Page, venue: string): Promise<void> {
  if (!process.env.TRIPWIRE_CAPTURE) return;
  await page.waitForTimeout(400); // let the dock's 180ms entrance settle before the shot
  await page.screenshot({ path: path.join(OUT, `placement-${venue}.png`) });
}

/** Loads a venue page at 1440x900 and checks the three conditions without scrolling anything. */
async function checkPlacement(page: Page, venue: string, url: string) {
  await page.setViewportSize(VIEWPORT);
  await page.goto(url);
  const { locator, box } = await primarySurface(page);
  expectInFirstViewport(box, venue);
  // Never inside a recycled container: a verdict that scrolls away with row 47 is not a verdict.
  const volatile = await locator.evaluate((el) => {
    const host = (el.getRootNode() as ShadowRoot).host ?? el;
    return host.closest('[data-virtuoso-scroller], [role="grid"], [role="row"], table') !== null;
  });
  expect(volatile, `${venue}: not inside a scrolling data grid`).toBe(false);
  await shoot(page, venue);
  return locator;
}

test("dexscreener: the verdict sits under the pair header, not in the grid", async ({ context }) => {
  const page = await context.newPage();
  await page.route("https://dexscreener.com/**", (route) => route.fulfill({ body: DEXSCREENER_PAGE, contentType: "text/html; charset=utf-8" }));
  const strip = await checkPlacement(page, "dexscreener", `https://dexscreener.com/solana/${WIF}`);

  // The anchor itself: mounted directly after the pair identity row, inside the panel's own
  // padded block — so it reads as part of that header rather than as something stuck beside it.
  const previousId = await strip.evaluate((el) => (el.getRootNode() as ShadowRoot).host.previousElementSibling?.id ?? null);
  expect(previousId).toBe("pair-header");

  // And visually where the brief asked for it: below the symbol and the chain/DEX badges, above
  // the price readouts, inside the data panel rather than over the chart.
  const header = (await page.locator("#pair-header").boundingBox())!;
  const stats = (await page.locator("#price-stats").boundingBox())!;
  const box = (await strip.boundingBox())!;
  expect(box.y, "below the pair header").toBeGreaterThanOrEqual(header.y);
  expect(box.y + box.height, "above the price readouts").toBeLessThanOrEqual(stats.y + 1);
  expect(box.x, "inside the data panel, not over the chart").toBeGreaterThanOrEqual(header.x - 1);
  await page.close();
});

test("the dock is the fallback, and says so: entrance, verdict edge, still one surface", async ({ context }) => {
  // DexScreener's own "Token or Pair Not Found" page: no pair header, so no anchor qualifies.
  // This is the only case where the verdict is not attached to something the user is already
  // looking at, which is exactly why the dock gets an entrance and a verdict-coloured edge.
  const page = await context.newPage();
  await page.route("https://dexscreener.com/**", (route) =>
    route.fulfill({
      body: `<!doctype html><html><head><meta charset="utf-8"><title>DEX Screener (e2e stub)</title>
        <style>body{margin:0;background:#0b0e12;color:#e7edf3;font:14px system-ui,sans-serif}main{padding:48px}</style>
        </head><body><main><h2>Token or Pair Not Found</h2></main></body></html>`,
      contentType: "text/html; charset=utf-8",
    }),
  );
  await page.setViewportSize(VIEWPORT);
  await page.goto(`https://dexscreener.com/solana/${WIF}`);

  const chip = page.locator(".tw-dock-chip");
  await expect(chip).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(PRIMARY)).toHaveCount(1);
  await expect(chip).toHaveAttribute("data-primary", "");
  // The entrance plays once and finishes; it is an arrival, not a permanent flashing thing.
  await chip.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const edge = await chip.evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { width: style.width, background: style.backgroundColor, content: style.content };
  });
  expect(edge.width, "the verdict edge is drawn").toBe("3px");
  // UNCHECKED is neutral. It must never be mistaken for CLEAR's mint (#00FFA7).
  expect(edge.background).not.toContain("0, 255, 167");
  const box = (await chip.boundingBox())!;
  expectInFirstViewport(box, "dock fallback");
  await shoot(page, "dock-fallback");
  await page.close();
});

test("where is it?: the popup's message lights the mounted verdict, then lets it go", async ({ context }) => {
  // The wire the popup button uses: one message to the active tab, answered by the venue
  // content script with whether there was anything to light. Driven from the service worker
  // because a popup opened as a page would query itself as the active tab.
  const page = await context.newPage();
  await page.route("https://dexscreener.com/**", (route) => route.fulfill({ body: DEXSCREENER_PAGE, contentType: "text/html; charset=utf-8" }));
  await page.setViewportSize(VIEWPORT);
  await page.goto(`https://dexscreener.com/solana/${WIF}`);
  await expect(page.locator(".tw-strip")).toBeVisible({ timeout: 25_000 });

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const answered = await worker.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id?: number }[]>; sendMessage(id: number, m: object): Promise<boolean> } } }).chrome;
    // No `url` filter: the manifest holds no host permission for venue hosts (they are
    // content-script matches) and no `tabs` permission, so a filtered query returns nothing.
    // The popup asks the same way — the active tab, by id — and `activeTab` covers the send.
    const tabs = await chrome.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const found = await chrome.tabs.sendMessage(tab.id, { type: "tripwire:locate" }).catch(() => false);
      if (found) return true;
    }
    return false;
  });
  expect(answered, "the content script says it found something to light").toBe(true);

  const strip = page.locator(".tw-strip");
  await expect(strip).toHaveAttribute("data-tw-locate", "");
  await shoot(page, "locate-pulse");
  // It is an affordance, not a permanent flashing thing: the outline lets go on its own.
  await expect(strip).not.toHaveAttribute("data-tw-locate", "", { timeout: 5_000 });
  await page.close();
});

test("pump.fun: the verdict sits above the trade button", async ({ context }) => {
  const page = await context.newPage();
  await page.route("https://pump.fun/**", (route) => route.fulfill({ body: PUMPFUN_PAGE, contentType: "text/html; charset=utf-8" }));
  const strip = await checkPlacement(page, "pumpfun", `https://pump.fun/coin/${WIF}`);

  const button = await page.locator("#primary").boundingBox();
  const box = await strip.boundingBox();
  expect(box!.y + box!.height, "the strip sits above the button it guards").toBeLessThanOrEqual(button!.y);
  await page.close();
});

/** The venues served from the repo's own captured pages (`e2e/pages/`, routed in fixtures.ts). */
const CAPTURED: { venue: string; url: string }[] = [
  { venue: "jupiter", url: `https://jup.ag/swap/SOL-${WIF}` },
  { venue: "uniswap", url: "https://app.uniswap.org/swap" },
  { venue: "jumper", url: `https://jumper.xyz/?fromChain=8453&toChain=8453&toToken=${WBTC_BASE}` },
  { venue: "hyperliquid", url: "https://app.hyperliquid.xyz/trade/ETH" },
];

for (const { venue, url } of CAPTURED) {
  test(`${venue}: one primary surface, inside the first viewport at 1440x900`, async ({ context }) => {
    const page = await context.newPage();
    await checkPlacement(page, venue, url);
    await page.close();
  });
}

test("polymarket: one primary surface, inside the first viewport at 1440x900", async ({ context }) => {
  const page = await context.newPage();
  await page.route("https://polymarket.com/event/**", (route) =>
    route.fulfill({ path: path.resolve("test/fixtures/venues/polymarket.html"), contentType: "text/html; charset=utf-8" }),
  );
  await checkPlacement(page, "polymarket", "https://polymarket.com/event/friedrich-merz-out-as-chancellor-of-germany-before-2027");
  await page.close();
});
