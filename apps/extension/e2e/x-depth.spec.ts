import path from "node:path";
import { BACKEND, BONK, expect, test, WIF } from "./fixtures";

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

/**
 * Round 2.4 — posts whose token is not in the post's own body: a quoted tweet, a link preview,
 * and a post naming two contracts at once.
 */
test("X: quoted, previewed and second tokens are checked, placed and attributed", async ({ context }) => {
  // Every chip-mode check the page makes, so "the second chip spends nothing until it is
  // opened" is measured rather than asserted.
  const checked: string[] = [];
  await context.route(`${BACKEND}/api/post-intel`, async (route) => {
    const body = route.request().postDataJSON();
    checked.push(`${body.mode}:${body.target.tokenAddress}`);
    await route.continue();
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.route("https://x.com/quotes", (route) =>
    route.fulfill({ path: path.resolve("e2e/pages/x-quote.html"), contentType: "text/html" }),
  );
  await page.goto("https://x.com/quotes");

  const posts = page.locator('article[data-testid="tweet"]');

  // 1. The outer post has no text element at all. The old anchor would have found the quoted
  // post's one; the chip must sit after the quote wrapper, still inside the outer article.
  const quoted = posts.nth(0).locator(".tw-chip");
  await expect(quoted).toHaveAttribute("data-verdict", /CLEAR|CAUTION|BLOCK|UNCHECKED/, { timeout: 20000 });
  await expect(quoted).toContainText("Quoted post");
  expect(
    await page.evaluate(() => document.querySelector("#q1-wrapper")?.nextElementSibling?.tagName),
  ).toBe("TRIPWIRE-UI");

  // The card says whose words put this token on it, naming the quoted account, not the poster.
  await quoted.click();
  const card = page.locator(".tw-card-author");
  await expect(card).toContainText("comes from the quoted post by @innerposter");
  await expect(card).toContainText("not from @quotefan's own words");
  await page.keyboard.press("Escape");

  // 2. Two contracts in one body: two chips, and only the first one was paid for.
  const rotation = posts.nth(1).locator(".tw-chip");
  await expect(rotation).toHaveCount(2);
  const second = rotation.nth(1);
  await expect(second).toHaveAttribute("data-verdict", "UNCHECKED");
  await expect(second).toContainText("Also mentioned. Open to check.");
  expect(checked).toContain(`chip:${BONK}`);
  expect(checked.some((c) => c.endsWith(PEPE))).toBe(false);

  // Opening it is the spend, and the chip takes its verdict from that one call: the card's
  // panel check, never a second chip-mode one.
  await second.click();
  await expect(page.locator(".tw-pop")).toBeVisible();
  await expect.poll(() => checked.filter((c) => c.endsWith(PEPE)), { timeout: 20000 }).toEqual([`panel:${PEPE}`]);
  await expect(second).not.toContainText("Open to check", { timeout: 20000 });
  await expect(second).not.toHaveAttribute("data-verdict", "LOADING");
  await page.keyboard.press("Escape");

  // 3. A post whose own words name nothing: the contract comes from the link preview.
  const preview = posts.nth(2).locator(".tw-chip");
  await expect(preview).toHaveAttribute("data-verdict", /CLEAR|CAUTION|BLOCK|UNCHECKED/, { timeout: 20000 });
  await expect(preview).toContainText("Link preview");
  expect(checked).toContain(`chip:${USDT}`);

  // Four chips on three posts, and none of them widened the page (non-negotiable #5).
  await expect(page.locator(".tw-chip")).toHaveCount(4);
  expect(checked.filter((c) => c.startsWith("chip:")).sort()).toEqual([`chip:${BONK}`, `chip:${USDT}`, `chip:${WIF}`].sort());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

/**
 * Round 2.4 captures, for the same review folder the rest of the shot list writes to:
 *   TRIPWIRE_CAPTURE=1 TRIPWIRE_E2E_PORT=3224 pnpm -F extension exec playwright test -c e2e/playwright.config.ts x-depth
 */
test("captures: X post sources", async ({ context }) => {
  test.skip(!process.env.TRIPWIRE_CAPTURE, "captures run on demand, not in the smoke suite");
  const out = path.resolve(import.meta.dirname, "..", "..", "..", ".impeccable", "review");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.route("https://x.com/quotes", (route) =>
    route.fulfill({ path: path.resolve("e2e/pages/x-quote.html"), contentType: "text/html" }),
  );
  await page.goto("https://x.com/quotes");
  await expect(page.locator(".tw-chip")).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator(".tw-chip").first()).toContainText("Quoted post");
  await page.waitForTimeout(600);

  // x-post-sources: three posts whose token is not in the post's own body, and the second chip
  // that has not been checked, all sitting inside X's own column.
  await page.locator("main").screenshot({ path: path.join(out, "x-post-sources.png") });

  // x-popover-quoted: the card for a token the poster never typed, with the line that says so.
  await page.locator(".tw-chip").first().click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".tw-card-author")).toContainText("quoted post");
  await card.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.waitForTimeout(400);
  await card.screenshot({ path: path.join(out, "x-popover-quoted.png") });
});
