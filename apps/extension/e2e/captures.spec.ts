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

  // x-popover-wallets: both sides of every wallet, with the tag and the secondary figure.
  await card.getByRole("tab", { name: "Wallets" }).click();
  await expect(card.locator(".tw-wallet-rows li").first()).toBeVisible();
  await page.waitForTimeout(200);
  await shot(card, "x-popover-wallets");

  // x-popover-risk: the token record block and the two indicator vocabularies.
  await card.getByRole("tab", { name: "Risk" }).click();
  await expect(card.locator('section[aria-label="Market"] .tw-readouts')).toBeVisible();
  await page.waitForTimeout(200);
  await shot(card, "x-popover-risk");
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

  // Jumper's widget uses a high stacking layer on the live site. Both evidence sizes must stay
  // above it; these captures guard the compact and expanded screenshots that exposed the bug.
  await jumper.evaluate(() => (window as unknown as { setCardWidth(w: number): void }).setCardWidth(416));
  await jumper.locator(".tw-strip-details").click();
  const jumperEvidence = jumper.locator('.tw-pop[role="dialog"]');
  await expect(jumperEvidence).toBeVisible();
  await jumper.waitForTimeout(200);
  await shot(jumper, "jumper-evidence-compact");
  await jumperEvidence.getByRole("button", { name: "Expand card" }).click();
  await expect(jumperEvidence).toHaveAttribute("data-size", "expanded");
  await jumper.waitForTimeout(200);
  await shot(jumper, "jumper-evidence-expanded");
  await jumperEvidence.getByRole("button", { name: "Close" }).click();

  // strip-jumper-btc: a destination outside coverage names the chain rather than failing.
  await jumper.goto("https://jumper.xyz/?fromChain=1&toChain=20000000000001&toToken=bitcoin");
  await expect(jumper.locator(".tw-strip-finding")).toHaveText("No onchain data for Bitcoin", { timeout: 20_000 });
  await jumper.waitForTimeout(200);
  await shot(jumper.locator(".card"), "strip-jumper-btc");

  // strip-jumper-sui: current LI.FI id resolves to a short chain name, never a 16-digit fallback.
  await jumper.goto("https://jumper.xyz/?fromChain=1&toChain=9270000000000000&toToken=sui");
  await expect(jumper.locator(".tw-strip-finding")).toHaveText("No onchain data for Sui", { timeout: 20_000 });
  await jumper.waitForTimeout(200);
  await shot(jumper.locator(".card"), "strip-jumper-sui");
  await jumper.close();

  // strip-uniswap-native: the default swap page, whose URL names no token at all.
  const uni = await context.newPage();
  await putRules(uni, { preset: "balanced" });
  await uni.setViewportSize({ width: 1280, height: 900 });
  await uni.goto("https://app.uniswap.org/swap");
  await expect(uni.locator(".tw-strip-finding")).toHaveText("Select a network to check ETH", { timeout: 20_000 });
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
  await card.evaluate((el) => Promise.allSettled(el.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-overview");

  // wallet-card-defi (Round 1.5.6 + 1.5.1): the priced button, then what it buys. In replay
  // this reads the recorded answer and spends nothing, which is the point of the fixture.
  await card.getByRole("button", { name: /Check DeFi and label \(2 credits\)/ }).click();
  await expect(card.locator('[aria-label="DeFi positions"]')).toContainText(/DeFi/);
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-defi");

  // wallet-card-performance (Round 1.5.2 + 1.5.7): realized ROI beside the money, and the
  // unrealized table under its own priced button.
  await card.getByRole("radio", { name: "Performance" }).click();
  await card.getByRole("button", { name: /Load unrealized PnL \(1 credit\)/ }).click();
  await expect(card.locator('[aria-label="Open positions and cost basis"] tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-performance");
  await card.getByRole("radio", { name: "Summary" }).click();

  // wallet-card-activity (Round 2.3): the timeline the card never had. Opening the tab spends
  // nothing; the row of buttons inside it each print a price first.
  await card.getByRole("tab", { name: "Activity" }).click();
  await card.getByRole("button", { name: /Load recent activity \(1 credit\)/ }).click();
  await expect(card.locator(".tw-activity-rows li").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-activity");

  // wallet-card-connections (Round 2.3): the first funder, the related wallets with Nansen's
  // own relation word, and the 5-credit counterparty table.
  await card.getByRole("radio", { name: "Connections" }).click();
  await card.getByRole("button", { name: /Check origin \(up to 2 credits\)/ }).click();
  await expect(card.locator('[aria-label="Origin and related wallets"]')).toContainText(/First funded by|first-funder/, { timeout: 15_000 });
  await card.getByRole("button", { name: /Load counterparties \(5 credits\)/ }).click();
  await expect(card.locator('[aria-label="Counterparties"] tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot(card, "wallet-card-connections");
  await card.getByRole("tab", { name: "Overview" }).click();

  // wallet-card-overview-expanded: the Summary view with room for two columns, so the DeFi
  // block and the allocation chart sit side by side under a full-width row of tiles.
  await card.getByRole("button", { name: "Expand card" }).click();
  await expect(card).toHaveAttribute("data-size", "expanded");
  await page.waitForTimeout(250);
  await shot(card, "wallet-card-overview-expanded");
  await card.getByRole("button", { name: "Collapse card" }).click();
  await expect(card).not.toHaveAttribute("data-size", "expanded");

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

    // x-badge-card-polymarket: the other linked venue's card. It had no generator at all before
    // Round 1.2, so the committed shot had drifted away from what the code renders.
    await badgePop.getByRole("button", { name: "Collapse card" }).click();
    await expect(badgePop).not.toHaveAttribute("data-size", "expanded");
    await badges.keyboard.press("Escape");
    const pmBadge = linked.locator('.tw-badge[data-venue="polymarket"]');
    await expect(pmBadge).toBeVisible({ timeout: 15_000 });
    await pmBadge.click();
    const pmPop = badges.locator('.tw-pop[role="dialog"]');
    await expect(pmPop.locator(".tw-badge-card")).toBeVisible();
    await badges.waitForTimeout(200);
    await shot(pmPop, "x-badge-card-polymarket");

    // x-badge-card-polymarket-settled (Round 1.5.5): the settled history, which used to be 494
    // rows of a paid response that nothing rendered.
    const settled = pmPop.locator('[aria-label="Settled markets"]');
    await settled.scrollIntoViewIfNeeded();
    await expect(settled).toContainText(/largest of/);
    await badges.waitForTimeout(200);
    await shot(pmPop, "x-badge-card-polymarket-settled");
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

  const profile = await context.newPage();
  await profile.route("https://x.com/VitalikButerin", route => route.fulfill({ path: path.resolve("e2e/pages/x-profile.html"), contentType: "text/html" }));
  await profile.setViewportSize({ width: 1440, height: 1000 });
  await profile.goto("https://x.com/VitalikButerin");
  const entityBadge = profile.getByRole("button", { name: "Nansen label for @VitalikButerin" });
  await expect(entityBadge).toBeVisible({ timeout: 20000 });
  await shot(profile.locator(".profile"), "x-profile-badge");
  await entityBadge.click();
  const entityCard = profile.locator(".tw-badge-card");
  await expect(entityCard).toBeVisible();
  if (await entityCard.getByRole("button", { name: "Collapse card" }).isVisible()) await entityCard.getByRole("button", { name: "Collapse card" }).click();
  await shot(entityCard, "entity-profile-compact");
  await entityCard.getByRole("button", { name: "Expand card" }).click();
  await expect(entityCard).toHaveAttribute("data-size", "expanded");
  await profile.waitForTimeout(200);
  await shot(profile, "entity-profile-expanded");
  await profile.close();

  // The three popup tabs at the width Chrome gives them. The popup is opened as a page, so the
  // active tab and the granted origins are stubbed to what they would be on a real site the user
  // has not enabled yet, with one other site already on the list.
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    const chrome = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const tabs = chrome.tabs as { query: unknown };
    tabs.query = async () => [{ id: 1, url: "https://app.pendle.finance/trade/dashboard", active: true }];
    const permissions = chrome.permissions as { getAll: unknown };
    permissions.getAll = async () => ({ origins: ["http://127.0.0.1:3000/*", "https://debank.com/*"], permissions: [] });
  });
  // The popup sizes itself; the viewport only has to be large enough to hold it whole.
  await popup.setViewportSize({ width: 420, height: 560 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Two wallets already inspected, so the recent list is in the shot rather than absent.
  await popup.evaluate(async (seen) => {
    await (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> } } } }).chrome.storage.local.set({ recentWallets: seen });
  }, [
    { query: "vitalik.eth", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: "vitalik.eth", chain: "ethereum", seenAt: Date.now() },
    { query: "0x7fdafde5cfb5465924316eced2d3715494c517d1", address: "0x7fdafde5cfb5465924316eced2d3715494c517d1", label: null, chain: "arbitrum", seenAt: Date.now() - 60_000 },
  ]);
  await popup.reload();
  await expect(popup.locator(".tw-popup")).toBeVisible({ timeout: 15_000 });
  await expect(popup.locator(".tw-status")).not.toHaveText(/Checking/);

  for (const [tab, name] of [
    ["Protection", "popup-protection"],
    ["Sites", "popup-sites"],
    ["Wallets", "popup-wallets"],
  ] as const) {
    await popup.getByRole("tab", { name: tab }).click();
    await expect(popup.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await popup.locator(".tw-tabpanel:not([hidden])").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    // The user's report was "a big scroll": the popup is a fixed box on every tab.
    const scrolls = await popup.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight || document.body.scrollHeight > document.body.clientHeight);
    expect(scrolls, `${name} scrolls the page`).toBe(false);
    await shot(popup.locator(".tw-popup"), name);
  }
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
  // perp-funding-venues: the cross-venue table in the anchored card, at 440px. Round 1.3 put
  // two more sections above it, so the table has to be scrolled to before the shot or the
  // capture stops showing the thing it is named after.
  await expect(pop.locator(".tw-venue-table tbody tr")).toHaveCount(5, { timeout: 20_000 });
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await pop.locator('section[aria-label="Funding & OI across venues"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(pop, "perp-funding-venues");

  // perp-oi-history (Round 2.5): open interest over time, from the only venue in the table that
  // publishes a history, with Binance's name and symbol on the legend rather than the coin's.
  await pop.locator('section[aria-label="Open interest over time"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(pop, "perp-oi-history");

  // perp-cohorts: the three cohorts the 1-credit position-intelligence row buys (Round 1.3.3),
  // with the Smart Money bar above them and the opens strip below. This also leaves the panel
  // scrolled back to the top for the expanded shot below.
  await pop.locator('section[aria-label="Smart Money long vs short"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(pop, "perp-cohorts");

  await pop.getByRole("tab", { name: "Liquidations" }).click();
  const compactLadder = pop.locator(".tw-liquidation-chart svg");
  await expect(compactLadder).toBeVisible();
  await expect.poll(async () => (await compactLadder.boundingBox())?.height).toBeCloseTo(240, 0);
  await page.screenshot({ path: path.resolve("../../scratch/review/liquidation-compact.png") });
  await pop.getByRole("tab", { name: "Positioning" }).click();

  // perp-expanded: the same card as the centred overlay, over the venue behind it.
  await pop.getByRole("button", { name: "Expand card" }).click();
  await expect(pop).toHaveAttribute("data-size", "expanded");
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  // From the first section: the expanded Positioning tab is where Round 2.5's column flow has
  // to be read, and the tall cohort block is the thing it exists to sit beside.
  await pop.locator('[role="tabpanel"]:not([hidden])').evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    if (node) node.scrollTop = 0;
  });
  await page.waitForTimeout(400);
  await shot(page, "perp-expanded");

  await pop.getByRole("tab", { name: "Liquidations" }).click();
  const ladder = pop.locator(".tw-liquidation-chart svg");
  await expect(ladder).toBeVisible();
  await expect.poll(async () => (await ladder.boundingBox())?.height).toBeCloseTo(320, 0);
  const bars = ladder.locator('g[tabindex="0"]');
  await bars.first().focus();
  await expect(pop.locator(".tw-liquidation-detail")).toContainText("position value");
  if (await bars.count() > 1) {
    await page.keyboard.press("Tab");
    await expect(bars.nth(1)).toBeFocused();
  }
  await page.screenshot({ path: path.resolve("../../scratch/review/liquidation-expanded.png") });

  // perp-ladder-cohorts (Round 2.5): the picker that can buy the same ladder for another
  // population. Three of the four choices print their price; nothing has been pressed, so
  // nothing has been spent, and the shot is of that state.
  await expect(pop.locator(".tw-cohort-picker")).toBeVisible();
  await pop.locator('section[aria-label="Liquidation ladder"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(pop, "perp-ladder-cohorts");

  // perp-traders: the tab that costs 11 credits, with its leaderboard from the fixtures.
  await pop.getByRole("tab", { name: /Traders/ }).click();
  await expect(pop.locator('[role="tabpanel"]:not([hidden]) table tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot(pop, "perp-traders");

  // perp-win-rate (Round 2.5): the same table after one row's win rate has been asked for. In
  // replay the answer comes from the recorded summary and costs nothing; live it is 1 credit,
  // which is what the button said before it was pressed.
  await pop.locator('button[aria-label^="Win rate"]').first().click();
  await expect(pop.locator(".tw-winrate-of").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(pop, "perp-win-rate");
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
  await spotCard.getByRole("tab", { name: /Holders/ }).click();
  await expect(spotCard.locator(".tw-table tbody tr")).toHaveCount(6, { timeout: 20000 });
  await shot(spot, "spot-holders-links");

  // Round 2.1: the sequence half of the card. The tape is the post-time divider and the labelled
  // wallets; the winners tab is the five-credit "have they already sold?" read.
  await spotCard.getByRole("tab", { name: /Tape/ }).click();
  await expect(spotCard.locator(".tw-tape-rows li").first()).toBeVisible({ timeout: 20_000 });
  await shot(spot, "spot-tape");
  await spotCard.getByRole("tab", { name: /Winners/ }).click();
  // Scoped to the panel on screen: every tab's markup stays in the DOM, so an unscoped table
  // selector resolves to a hidden row in the Holders panel next door.
  await expect(spotCard.locator('[role="tabpanel"]:not([hidden]) .tw-table tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await shot(spot, "spot-winners");
  // Round 1.6.1: the Dexscreener block under the Nansen token record, each figure named.
  await spotCard.getByRole("tab", { name: /Risk/ }).click();
  await expect(spotCard.locator('section[aria-label="Market structure"]')).toBeVisible({ timeout: 20_000 });
  await shot(spot, "spot-market-structure");
  await spot.close();
});


/**
 * The prediction card, rebuilt in Round 1.2: a price, a state, both sides of the free CLOB book
 * and a PnL column that says which PnL it is. The venue page is the repo's own captured
 * polymarket.com event DOM, so the content script runs against the real markup.
 */
test("prediction card captures", async ({ context }) => {
  const page = await context.newPage();
  await page.route("https://polymarket.com/event/**", (route) =>
    route.fulfill({ path: path.resolve("test/fixtures/venues/polymarket.html"), contentType: "text/html; charset=utf-8" }),
  );
  await page.setViewportSize({ width: 1600, height: 1100 });
  await putRules(page, { preset: "balanced" });
  await page.goto("https://polymarket.com/event/friedrich-merz-out-as-chancellor-of-germany-before-2027");

  await expect(page.locator(".tw-strip")).toBeVisible({ timeout: 20_000 });
  await page.locator(".tw-strip-details").click();
  const pop = page.locator('.tw-pop[role="dialog"]');
  await expect(pop).toBeVisible();

  // prediction-card: the readout block — price off the resting book, the market's own figures,
  // and the proven-winner split beneath it.
  await expect(pop.locator(".tw-price-value")).toHaveText(/¢/, { timeout: 20_000 });
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(pop, "prediction-card");

  // prediction-holders: "PnL here" against the wallet's settled record.
  await pop.getByRole("tab", { name: "Holders" }).click();
  await expect(pop.locator(".tw-pm-holders tbody tr").first()).toBeVisible();
  await page.waitForTimeout(200);
  await shot(pop, "prediction-holders");

  // prediction-book: both outcomes, both sides, free.
  await pop.getByRole("button", { name: "Expand card" }).click();
  await expect(pop).toHaveAttribute("data-size", "expanded");

  // prediction-markets: the event's other rungs, free, two columns with the line that says they
  // are evidence and not a verdict (Round 2.2).
  await pop.getByRole("tab", { name: "Markets" }).click();
  await expect(pop.locator(".tw-market-option").first()).toBeVisible();
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(pop, "prediction-markets");
  await pop.getByRole("tab", { name: "Book" }).click();
  await expect(pop.locator('.tw-book-side[data-side="ask"] li').first()).toBeVisible({ timeout: 20_000 });
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(300);
  await shot(page, "prediction-book");
  await page.close();
});
