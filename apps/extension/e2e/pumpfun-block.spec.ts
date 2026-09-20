import type { APIRequestContext } from "@playwright/test";
import { PRESETS } from "../../../packages/core/src/rules/presets";
import { TRIPWIRE_EXTENSION_ID } from "../../../packages/core/src/constants";
import { BACKEND, expect, test, WIF } from "./fixtures";

const EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;

/**
 * Round 1.4.9. pump.fun's `Quick buy $25 / $100 / $250` chips place a trade in one click when a
 * wallet is connected, and the block screen bound only the trade form's primary button — so on
 * the one venue where impulse buying actually happens, the block was walked around in a single
 * click. The chips are now bound individually by `aria-label`, re-synced across the SPA's own
 * re-renders, and covered by the block rectangle.
 */

/** The trade panel from `test/fixtures/venues/pumpfun-buy-tab.json`, reduced to its structure:
 * a Buy|Sell tablist, an amount input, the panel's primary action, and the quick chips BELOW
 * it — which is why growing the block upward alone never covered them. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>pump.fun (e2e stub)</title>
<style>
  body { margin: 0; background: #0b1015; color: #e7edf3; font: 14px system-ui, sans-serif; }
  #topbar { padding: 12px; border-bottom: 1px solid #1d2733; }
  #unrelated { min-height: 32px; padding: 0 14px; border: 1px solid #2a3542; border-radius: 10px; background: #131c26; color: inherit; }
  #panel { position: absolute; top: 390px; left: 1200px; width: 316px; display: flex; flex-direction: column; gap: 12px;
           padding: 12px; border: 1px solid #1d2733; border-radius: 12px; }
  [role="tablist"] { display: flex; gap: 8px; }
  [role="tab"] { flex: 1; min-height: 32px; background: #131c26; color: inherit; border: none; border-radius: 8px; }
  #amount { height: 40px; padding: 0 12px; border: 1px solid #2a3542; border-radius: 10px; background: #0b1015; color: inherit; }
  #primary { height: 40px; border: none; border-radius: 10px; background: #5fd08a; color: #06110a; font-weight: 700; }
  [role="group"] { display: flex; gap: 6px; }
  [role="group"] button { flex: 1; min-height: 25px; border: 1px solid #2a3542; border-radius: 8px; background: #131c26; color: inherit; }
</style></head><body>
  <div id="topbar"><button id="unrelated" type="button">Share</button> <span id="shares">0</span></div>
  <section id="panel">
    <div role="tablist">
      <button role="tab" aria-selected="true" type="button">Buy</button>
      <button role="tab" aria-selected="false" type="button">Sell</button>
    </div>
    <input id="amount" placeholder="0.00" />
    <button id="primary" type="button" aria-pressed="false">Connect wallet to trade</button>
    <div role="group" aria-label="Quick buy" id="quick-buy">
      <button type="button" aria-label="Quick buy $25">$25</button>
      <button type="button" aria-label="Quick buy $100">$100</button>
      <button type="button" aria-label="Quick buy $250">$250</button>
    </div>
    <div role="group" aria-label="Quick sell">
      <button type="button" aria-label="Quick sell 50%">50%</button>
    </div>
  </section>
<script>
  window.quickClicks = 0;
  window.shares = 0;
  function wire(root) {
    for (const btn of root.querySelectorAll('[aria-label^="Quick "]')) {
      btn.addEventListener("click", () => { window.quickClicks += 1; });
    }
  }
  wire(document);
  document.getElementById("unrelated").addEventListener("click", () => {
    window.shares += 1;
    document.getElementById("shares").textContent = String(window.shares);
  });
  // What pump.fun's SPA does on its own: re-render the chip row with brand new nodes.
  window.rerenderChips = () => {
    const group = document.getElementById("quick-buy");
    const fresh = group.cloneNode(true);
    group.replaceWith(fresh);
    wire(fresh);
  };
</script></body></html>`;

async function setBlockingRules(request: APIRequestContext) {
  const rules = PRESETS.balanced.map((r) => (r.id === "spot-exit-deep" ? { ...r, threshold: -0.5 } : r));
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { rules } });
  expect(res.status(), "PUT /api/rules (blocking)").toBe(200);
}

test.afterEach(async ({ request }) => {
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { preset: "balanced" } });
  expect(res.status()).toBe(200);
});

test("@smoke pump.fun: a TRIPWIRE blocks the quick-buy chips too, across an SPA re-render", async ({ context, request, consoleErrors }) => {
  await setBlockingRules(request);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route("https://pump.fun/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: PAGE }));
  await page.goto(`https://pump.fun/coin/${WIF}`);

  await expect(page.locator(".tw-block")).toBeVisible({ timeout: 20_000 });

  // The block covers the chips: a real pointer click at one lands on the block screen, not the
  // chip. A chip left visible below the block reads as still clickable.
  const chip = page.locator('[aria-label="Quick buy $25"]');
  const box = (await chip.boundingBox())!;
  const blockBox = (await page.locator(".tw-block").boundingBox())!;
  expect(blockBox.y + blockBox.height, "the block covers the quick-sell row too").toBeGreaterThanOrEqual(
    (await page.locator('[aria-label="Quick sell 50%"]').boundingBox())!.y,
  );
  if (process.env.TRIPWIRE_CAPTURE) {
    await page.screenshot({ path: "../../.impeccable/review/block-pumpfun-quick-buy.png", clip: { x: 1100, y: 200, width: 500, height: 500 } });
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // And a click dispatched straight at the element is swallowed by its own blocker.
  await chip.dispatchEvent("click");
  await page.locator('[aria-label="Quick sell 50%"]').dispatchEvent("click");
  expect(await page.evaluate(() => (window as unknown as { quickClicks: number }).quickClicks)).toBe(0);

  // The primary is still blocked, and an unrelated button on the page still works.
  await page.locator("#primary").dispatchEvent("click");
  await page.locator("#unrelated").click();
  await expect(page.locator("#shares")).toHaveText("1");

  // pump.fun re-renders the chip row with brand new nodes. The rebind rides the runner's own
  // tick (the same MutationObserver debounce the trade-button rebind uses), so this polls for
  // it rather than asserting on the very next frame.
  await page.evaluate(() => (window as unknown as { rerenderChips: () => void }).rerenderChips());
  await expect(page.locator(".tw-block")).toBeVisible();
  const probe = (selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return "missing";
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented ? "blocked" : "through";
    }, selector);

  await expect
    .poll(() => probe('[aria-label="Quick buy $100"]'), { timeout: 15_000, message: "a re-rendered quick-buy chip is bound again" })
    .toBe("blocked");
  // The chip the re-render did not touch was never released on the way.
  expect(await probe('[aria-label="Quick sell 50%"]')).toBe("blocked");
  expect(await probe("#primary")).toBe("blocked");

  await page.evaluate(() => ((window as unknown as { quickClicks: number }).quickClicks = 0));
  await page.locator('[aria-label="Quick buy $100"]').dispatchEvent("click");
  await page.locator('[aria-label="Quick buy $250"]').dispatchEvent("click");
  expect(await page.evaluate(() => (window as unknown as { quickClicks: number }).quickClicks)).toBe(0);

  expect(consoleErrors).toEqual([]);
});
