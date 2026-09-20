import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { PRESETS } from "../../../packages/core/src/rules/presets";
import { TRIPWIRE_EXTENSION_ID } from "../../../packages/core/src/constants";
import { BACKEND, expect, test, WBTC_BASE } from "./fixtures";

const EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;
const OUT = path.resolve("../../.impeccable/review");

/**
 * Reported on jumper.xyz: the block screen started about 45px to the left of the widget's card
 * and ended short of its right edge, floating over the Send/Receive fields while the trade
 * button's own row sat uncovered below it. It read as a detached modal dropped on the page.
 *
 * The block belongs to the trade button: it is flush with that button's card, never wider than
 * it, and it covers the row it guards.
 */
async function setBlockingRules(request: APIRequestContext) {
  const rules = PRESETS.balanced.map((r) => (r.id === "spot-exit-deep" ? { ...r, threshold: -0.5 } : r));
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { rules } });
  expect(res.status(), "PUT /api/rules (blocking)").toBe(200);
}

test.afterEach(async ({ request }) => {
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { preset: "balanced" } });
  expect(res.status()).toBe(200);
});

test("@smoke Jumper: the block screen stays inside the widget card it guards", async ({ context, request, consoleErrors }) => {
  await setBlockingRules(request);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`https://jumper.xyz/?fromChain=8453&toChain=8453&toToken=${WBTC_BASE}`);

  const block = page.locator(".tw-block");
  await expect(block).toBeVisible({ timeout: 25_000 });
  const blockBox = (await block.boundingBox())!;
  const card = (await page.locator(".card").boundingBox())!;
  const button = (await page.locator('[data-testid="widget-transaction-button"]').boundingBox())!;

  expect(blockBox.x, "never starts outside the card").toBeGreaterThanOrEqual(card.x);
  expect(blockBox.x + blockBox.width, "never ends outside the card").toBeLessThanOrEqual(card.x + card.width);
  // Flush with the card's content box (16px gutters), not centred on the button.
  expect(blockBox.x).toBeCloseTo(card.x + 16, 0);
  // And it is a barrier over the button, not a panel beside it.
  expect(blockBox.x).toBeLessThanOrEqual(button.x);
  expect(blockBox.x + blockBox.width).toBeGreaterThanOrEqual(button.x + button.width);
  expect(blockBox.y + blockBox.height).toBeGreaterThanOrEqual(button.y + button.height - 1);
  expect(blockBox.y, "grows upward from the button").toBeLessThan(button.y);

  if (process.env.TRIPWIRE_CAPTURE) await page.screenshot({ path: path.join(OUT, "block-jumper.png") });
  expect(consoleErrors).toEqual([]);
});
