/**
 * Review captures for .impeccable/review/, not part of the smoke run.
 *
 * Run with the same replay backend as the smoke suite:
 *   TRIPWIRE_CAPTURE=1 TRIPWIRE_E2E_PORT=3217 pnpm -F extension exec playwright test -c e2e/playwright.config.ts captures
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { PRESETS } from "../../../packages/core/src/rules/presets";
import { TRIPWIRE_EXTENSION_ID } from "../../../packages/core/src/constants";
import { BACKEND, expect, test, WBTC_BASE, WIF } from "./fixtures";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".impeccable", "review");
const EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;

test.skip(!process.env.TRIPWIRE_CAPTURE, "captures run on demand, not in the smoke suite");

const shot = (target: Page | Locator, name: string) => target.screenshot({ path: path.join(OUT, `${name}.png`) });

async function putRules(page: Page, data: unknown) {
  const res = await page.request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: data as object });
  expect(res.status()).toBe(200);
}

async function openCard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/\w/, { timeout: 15_000 });
  await chip.click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return card;
}

test("captures", async ({ context }) => {
  const page = await context.newPage();
  await putRules(page, { preset: "balanced" });

  // x-popover: the evidence card as it opens, with the token's own identity in the header.
  const card = await openCard(page);
  await expect(card.locator(".tw-card-symbol")).toHaveText("$WIF");
  // The finding's figure counts in; capture the settled text, not a frame of the animation.
  await card.locator(".tw-card-finding").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(400);
  await shot(card, "x-popover");

  // x-popover-chart-hover: the crosshair readout on the price chart.
  const canvas = card.locator(".tw-chart-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2, { steps: 8 });
  await expect(card.locator(".tw-chart-tip")).toBeVisible();
  await shot(card, "x-popover-chart-hover");

  // x-popover-7d: the same card on the 7-day window, still carrying its 1d verdict.
  await card.getByRole("radio", { name: "7d" }).click();
  await expect(card.locator(".tw-window-note")).toHaveText("Verdict uses 1d · viewing 7d");
  await card.locator('section[aria-label="Net flow by wallet type"]').scrollIntoViewIfNeeded();
  await shot(card, "x-popover-7d");
  await page.close();

  // block-evidence: the block screen with its evidence card open beside it.
  const jup = await context.newPage();
  await jup.setViewportSize({ width: 1440, height: 900 });
  await putRules(jup, { rules: PRESETS.balanced.map((r) => (r.id === "spot-exit-deep" ? { ...r, threshold: -0.5 } : r)) });
  await jup.goto(`https://jup.ag/swap/SOL-${WIF}`);
  await expect(jup.locator(".tw-block")).toBeVisible({ timeout: 15_000 });
  await jup.locator(".tw-block-evidence").click();
  await expect(jup.locator('.tw-pop[role="dialog"]')).toBeVisible();
  await jup.waitForTimeout(300);
  await shot(jup, "block-evidence");
  await jup.close();

  // strip-narrow: the strip inside a 280px venue card, stacked and inside its box.
  const jumper = await context.newPage();
  await putRules(jumper, { preset: "balanced" });
  await jumper.setViewportSize({ width: 1280, height: 900 });
  await jumper.goto(`https://jumper.xyz/?fromChain=8453&toChain=8453&toToken=${WBTC_BASE}`);
  await expect(jumper.locator(".tw-strip")).toBeVisible({ timeout: 15_000 });
  await jumper.evaluate(() => (window as unknown as { setCardWidth(w: number): void }).setCardWidth(280));
  await jumper.waitForTimeout(300);
  await shot(jumper.locator(".card"), "strip-narrow");
  await jumper.close();
});
