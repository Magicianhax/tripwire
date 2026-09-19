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
  // The token's picture comes from the local proxy, which is fetching it from the CDN Nansen
  // named the first time it is asked. Give it a moment so the capture isn't of the monogram.
  await card.locator("img.tw-token-logo").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
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

  // strip-jumper-btc: a destination outside coverage names the chain rather than failing.
  await jumper.evaluate(() => (window as unknown as { setCardWidth(w: number): void }).setCardWidth(416));
  await jumper.goto("https://jumper.xyz/?fromChain=1&toChain=20000000000001&toToken=bitcoin");
  await expect(jumper.locator(".tw-strip-finding")).toHaveText("Tripwire doesn't cover Bitcoin", { timeout: 20_000 });
  await jumper.waitForTimeout(200);
  await shot(jumper.locator(".card"), "strip-jumper-btc");
  await jumper.close();

  // strip-uniswap-native: the default swap page, whose URL names no token at all.
  const uni = await context.newPage();
  await putRules(uni, { preset: "balanced" });
  await uni.setViewportSize({ width: 1280, height: 900 });
  await uni.goto("https://app.uniswap.org/swap");
  await expect(uni.locator(".tw-strip-finding")).toHaveText("ETH is the chain's native asset — Tripwire checks tokens", { timeout: 20_000 });
  await uni.waitForTimeout(200);
  await shot(uni.locator(".swap"), "strip-uniswap-native");
  await uni.close();
});

test("wallet lens captures", async ({ context, extensionId }) => {
  // wallet-marker: the Nansen mark sitting in a line of the host page's own text.
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await putRules(page, { preset: "balanced" });
  await page.goto("https://dexscreener.com/wallets");
  const marker = page.getByRole("button", { name: /Inspect wallet 0x7f/ });
  await expect(marker).toBeVisible({ timeout: 20_000 });
  await shot(page.locator("#raw"), "wallet-marker");

  // wallet-card-overview / -hyperliquid: the card the marker opens.
  await marker.click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card.locator(".tw-card-title")).toHaveText("0x7f…17d1", { timeout: 15_000 });
  await card.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-overview");

  await card.getByRole("tab", { name: "Hyperliquid" }).click();
  await page.waitForTimeout(200);
  await shot(card, "wallet-card-hyperliquid");
  await card.getByRole("button", { name: "Expand card" }).click();
  await expect(card).toHaveAttribute("data-size", "expanded");
  await expect(card.locator(".tw-wallet-card")).toHaveAttribute("data-size", "expanded");
  await page.waitForTimeout(200);
  await shot(page, "wallet-card-expanded");
  await page.close();

  // Author badges share the same expandable shell, but remember their size independently.
  const badges = await context.newPage();
  const linkedWallets = [
    ["hyperliquid", "0x7fdafde5cfb5465924316eced2d3715494c517d1"],
    ["polymarket", "0x1963eabad7eb7499fb049ddebb96a8fd22179bfd"],
  ] as const;
  try {
    for (const [venue, address] of linkedWallets) {
      const response = await badges.request.put(`${BACKEND}/api/links`, {
        headers: { origin: EXTENSION_ORIGIN },
        data: { handle: "degenalpha", venue, address },
      });
      expect(response.status()).toBe(200);
    }
    await badges.setViewportSize({ width: 1440, height: 1000 });
    await badges.goto("https://x.com/home");
    const linked = badges.locator("article", { hasText: "@degenalpha" });
    const badge = linked.locator('.tw-badge[data-venue="hyperliquid"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await badge.click();
    const badgePop = badges.locator('.tw-pop[role="dialog"]');
    await expect(badgePop.locator(".tw-badge-card")).toBeVisible();
    await badges.waitForTimeout(200);
    await shot(badgePop, "x-badge-card-hyperliquid");
    await badgePop.getByRole("button", { name: "Expand card" }).click();
    await expect(badgePop).toHaveAttribute("data-size", "expanded");
    await expect(badgePop.locator(".tw-badge-card")).toHaveAttribute("data-size", "expanded");
    await badges.waitForTimeout(200);
    await shot(badges, "x-badge-card-expanded");
  } finally {
    let cleanupResponses;
    try {
      cleanupResponses = await Promise.all(
        linkedWallets.map(([venue]) =>
          badges.request.fetch(`${BACKEND}/api/links`, {
            method: "DELETE",
            headers: { origin: EXTENSION_ORIGIN },
            data: { handle: "degenalpha", venue },
          }),
        ),
      );
    } finally {
      await badges.close();
    }
    for (const response of cleanupResponses) expect(response.ok()).toBe(true);
  }

  // enable-site: the popup's per-site consent block. The popup is opened as a page, so the
  // active tab and the granted origins are stubbed to what they would be on a real site the
  // user has not enabled yet, with one other site already on the list.
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    const chrome = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const tabs = chrome.tabs as { query: unknown };
    tabs.query = async () => [{ url: "https://app.pendle.finance/trade/dashboard", active: true }];
    const permissions = chrome.permissions as { getAll: unknown };
    permissions.getAll = async () => ({ origins: ["http://127.0.0.1:3000/*", "https://debank.com/*"], permissions: [] });
  });
  await popup.setViewportSize({ width: 420, height: 1100 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Two wallets already inspected, so the recent list is in the shot rather than absent.
  await popup.evaluate(async (seen) => {
    await (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> } } } }).chrome.storage.local.set({ recentWallets: seen });
  }, [
    { query: "vitalik.eth", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: "vitalik.eth", chain: "ethereum", seenAt: Date.now() },
    { query: "0x7fdafde5cfb5465924316eced2d3715494c517d1", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: "0x7f…17d1", chain: "arbitrum", seenAt: Date.now() - 60_000 },
  ]);
  await popup.reload();
  await expect(popup.locator(".tw-lens")).toBeVisible({ timeout: 15_000 });
  await popup.waitForTimeout(300);
  await shot(popup.locator(".tw-lens"), "enable-site");
  await popup.close();
});

/**
 * The expand view and the perp card's new depth. Desktop widths only: Tripwire is a PC product,
 * so there are no narrow captures here.
 */
test("expand and perp depth captures", async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1100 });
  await putRules(page, { preset: "balanced" });
  await page.goto("https://app.hyperliquid.xyz/trade/ETH");
  await expect(page.locator(".tw-strip")).toBeVisible({ timeout: 20_000 });
  await page.locator(".tw-strip-details").click();

  const pop = page.locator('.tw-pop[role="dialog"]');
  await expect(pop).toBeVisible();
  // perp-funding-venues: the cross-venue table in the anchored card, at 440px.
  await expect(pop.locator(".tw-venue-table tbody tr")).toHaveCount(5, { timeout: 20_000 });
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(pop, "perp-funding-venues");

  // perp-expanded: the same card as the centred overlay, over the venue behind it.
  await pop.getByRole("button", { name: "Expand card" }).click();
  await expect(pop).toHaveAttribute("data-size", "expanded");
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(400);
  await shot(page, "perp-expanded");

  // perp-traders: the tab that costs 11 credits, with its leaderboard from the fixtures.
  await pop.getByRole("tab", { name: /Traders/ }).click();
  await expect(pop.locator('[role="tabpanel"]:not([hidden]) table tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot(pop, "perp-traders");
  await page.close();

  // card-skeleton: the card mid-load, with the panel call held open.
  const loading = await context.newPage();
  await loading.setViewportSize({ width: 1440, height: 1000 });
  await putRules(loading, { preset: "balanced" });
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => (release = resolve));
  await context.route(`${BACKEND}/api/post-intel`, async (route) => {
    const body = route.request().postDataJSON() as { mode?: string };
    if (body?.mode === "panel") await held;
    await route.continue();
  });
  await loading.goto("https://x.com/home");
  const chip = loading.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/\w/, { timeout: 20_000 });
  await chip.click();
  const skeletonCard = loading.locator('.tw-pop[role="dialog"]');
  await expect(skeletonCard.locator(".tw-card")).toHaveAttribute("aria-busy", "true");
  await skeletonCard.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await loading.waitForTimeout(200);
  await shot(skeletonCard, "card-skeleton");
  release!();
  await context.unroute(`${BACKEND}/api/post-intel`);
  await loading.close();

  // spot-expanded: the spot card at full size, with the wallet lists opened out.
  const spot = await context.newPage();
  await spot.setViewportSize({ width: 1600, height: 1100 });
  await putRules(spot, { preset: "balanced" });
  await spot.goto("https://x.com/home");
  const spotChip = spot.locator(".tw-chip");
  await expect(spotChip.locator(".tw-chip-key")).toHaveText(/\w/, { timeout: 20_000 });
  await spotChip.click();
  const spotCard = spot.locator('.tw-pop[role="dialog"]');
  await expect(spotCard.locator(".tw-card-symbol")).toHaveText("$WIF", { timeout: 20_000 });
  await spotCard.getByRole("button", { name: "Expand card" }).click();
  await expect(spotCard).toHaveAttribute("data-size", "expanded");
  await spotCard.locator("img.tw-token-logo").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await spotCard.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await spot.waitForTimeout(500);
  await shot(spot, "spot-expanded");
  await spot.close();
});
